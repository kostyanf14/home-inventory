from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.api.endpoints.barcode import upsert_user_catalog_product
from app.db.session import get_db
from app.models.models import (
    EquipmentDetail,
    FoodDetail,
    InventoryItem,
    ItemType,
    MedicineDetail,
    Place,
    Product,
    Site,
    User,
)
from app.schemas.schemas import (
    InventoryItemCreate,
    InventoryItemRead,
    InventoryItemUpdate,
    require_details_for_type,
)

router = APIRouter(prefix="/inventory-items", tags=["inventory-items"])


async def assert_location_owned(db: AsyncSession, user: User, site_id: int, place_id: int) -> None:
    """A site must belong to the caller and the place must belong to that site."""
    site_res = await db.execute(select(Site).where(Site.id == site_id, Site.user_id == user.id))
    if not site_res.scalars().first():
        raise HTTPException(status_code=400, detail="Invalid site_id")

    place_res = await db.execute(
        select(Place).where(Place.id == place_id, Place.site_id == site_id)
    )
    if not place_res.scalars().first():
        raise HTTPException(status_code=400, detail="Invalid place_id for this site")


async def assert_product_available(db: AsyncSession, user: User, product_id: int | None) -> None:
    if product_id is None:
        return
    result = await db.execute(
        select(Product).where(
            Product.id == product_id,
            or_(Product.user_id == user.id, Product.user_id.is_(None)),
        )
    )
    if not result.scalars().first():
        raise HTTPException(status_code=400, detail="Invalid product_id")


def merge_details(existing, payload, model):
    """Update the detail row in place, or build a fresh one for this item."""
    if existing is None:
        return model(**payload.model_dump())
    for field, value in payload.model_dump().items():
        setattr(existing, field, value)
    return existing


def item_query(*, with_details: bool = True):
    query = select(InventoryItem)
    if with_details:
        query = query.options(
            selectinload(InventoryItem.medicine_details),
            selectinload(InventoryItem.equipment_details),
            selectinload(InventoryItem.food_details),
        )
    return query


@router.get("", response_model=list[InventoryItemRead])
async def list_inventory_items(
    site_id: int | None = None,
    place_id: int | None = None,
    item_type: ItemType | None = None,
    barcode: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = item_query().where(InventoryItem.user_id == current_user.id)
    if site_id is not None:
        query = query.where(InventoryItem.site_id == site_id)
    if place_id is not None:
        query = query.where(InventoryItem.place_id == place_id)
    if item_type is not None:
        query = query.where(InventoryItem.item_type == item_type)
    if barcode is not None:
        query = query.where(InventoryItem.barcode == barcode)

    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=InventoryItemRead, status_code=status.HTTP_201_CREATED)
async def create_inventory_item(
    item_in: InventoryItemCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await assert_location_owned(db, current_user, item_in.site_id, item_in.place_id)
    await assert_product_available(db, current_user, item_in.product_id)

    item_data = item_in.model_dump(
        exclude={"medicine_details", "equipment_details", "food_details"}
    )
    if item_in.barcode:
        catalog_product = await upsert_user_catalog_product(
            db,
            current_user,
            barcode=item_in.barcode,
            name=item_in.display_name,
            default_unit=item_in.unit,
            category=item_in.item_type.value,
        )
        if catalog_product is not None and item_data.get("product_id") is None:
            item_data["product_id"] = catalog_product.id
    item = InventoryItem(**item_data, user_id=current_user.id)

    if item_in.medicine_details:
        item.medicine_details = MedicineDetail(**item_in.medicine_details.model_dump())
    if item_in.equipment_details:
        item.equipment_details = EquipmentDetail(**item_in.equipment_details.model_dump())
    if item_in.food_details:
        item.food_details = FoodDetail(**item_in.food_details.model_dump())

    db.add(item)
    await db.commit()

    # Re-query with details loaded
    result = await db.execute(item_query().where(InventoryItem.id == item.id))
    return result.scalars().first()


@router.get("/{item_id}", response_model=InventoryItemRead)
async def get_inventory_item(
    item_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        item_query().where(InventoryItem.id == item_id, InventoryItem.user_id == current_user.id)
    )
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    return item


@router.patch("/{item_id}", response_model=InventoryItemRead)
async def update_inventory_item(
    item_id: int,
    item_in: InventoryItemUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        item_query().where(InventoryItem.id == item_id, InventoryItem.user_id == current_user.id)
    )
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    update_data = item_in.model_dump(
        exclude_unset=True, exclude={"medicine_details", "equipment_details", "food_details"}
    )

    # Relocating must land inside the caller's own site/place graph, exactly as on create.
    if "site_id" in update_data or "place_id" in update_data:
        await assert_location_owned(
            db,
            current_user,
            update_data.get("site_id", item.site_id),
            update_data.get("place_id", item.place_id),
        )
    if "product_id" in update_data:
        await assert_product_available(db, current_user, update_data["product_id"])

    next_type = update_data.get("item_type", item.item_type)
    try:
        require_details_for_type(
            next_type, item_in.medicine_details, item_in.equipment_details, item_in.food_details
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    for field, value in update_data.items():
        setattr(item, field, value)

    if item_in.medicine_details:
        item.medicine_details = merge_details(
            item.medicine_details, item_in.medicine_details, MedicineDetail
        )
    elif item.item_type != ItemType.MEDICINE:
        item.medicine_details = None

    if item_in.equipment_details:
        item.equipment_details = merge_details(
            item.equipment_details, item_in.equipment_details, EquipmentDetail
        )
    elif item.item_type != ItemType.EQUIPMENT:
        item.equipment_details = None

    if item_in.food_details:
        item.food_details = merge_details(item.food_details, item_in.food_details, FoodDetail)
    elif item.item_type != ItemType.FOOD:
        item.food_details = None

    if item.item_type == ItemType.MEDICINE and item.medicine_details is None:
        raise HTTPException(
            status_code=400,
            detail="medicine_details with an expiration_date is required for medicine",
        )
    if item.item_type == ItemType.FOOD and item.food_details is None:
        raise HTTPException(
            status_code=400,
            detail="food_details with an expiration_date is required for food",
        )

    if item.barcode:
        catalog_product = await upsert_user_catalog_product(
            db,
            current_user,
            barcode=item.barcode,
            name=item.display_name,
            default_unit=item.unit,
            category=item.item_type.value,
        )
        if catalog_product is not None and item.product_id is None:
            item.product_id = catalog_product.id

    await db.commit()

    result = await db.execute(item_query().where(InventoryItem.id == item.id))
    return result.scalars().first()


@router.post("/{item_id}/use", response_model=InventoryItemRead)
async def use_inventory_item(
    item_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    """Subtract one unit from medicine or food. Other item types are rejected."""
    result = await db.execute(
        item_query().where(InventoryItem.id == item_id, InventoryItem.user_id == current_user.id)
    )
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    if item.item_type not in {ItemType.MEDICINE, ItemType.FOOD}:
        raise HTTPException(status_code=400, detail="Only medicine and food can be used this way")
    if item.quantity < 1:
        raise HTTPException(status_code=400, detail="Not enough quantity to use 1")

    item.quantity -= 1
    await db.commit()

    result = await db.execute(item_query().where(InventoryItem.id == item.id))
    return result.scalars().first()


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_inventory_item(
    item_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        item_query(with_details=False).where(
            InventoryItem.id == item_id, InventoryItem.user_id == current_user.id
        )
    )
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    await db.delete(item)
    await db.commit()
    return None

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.models import (
    EquipmentDetail,
    InventoryItem,
    ItemType,
    MedicineDetail,
    Place,
    Site,
    User,
)
from app.schemas.schemas import InventoryItemCreate, InventoryItemRead, InventoryItemUpdate

router = APIRouter(prefix="/inventory-items", tags=["inventory-items"])


@router.get("", response_model=list[InventoryItemRead])
async def list_inventory_items(
    site_id: int | None = None,
    place_id: int | None = None,
    item_type: ItemType | None = None,
    barcode: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(InventoryItem)
        .options(
            selectinload(InventoryItem.medicine_details),
            selectinload(InventoryItem.equipment_details),
        )
        .where(InventoryItem.user_id == current_user.id)
    )
    if site_id:
        query = query.where(InventoryItem.site_id == site_id)
    if place_id:
        query = query.where(InventoryItem.place_id == place_id)
    if item_type:
        query = query.where(InventoryItem.item_type == item_type)
    if barcode:
        query = query.where(InventoryItem.barcode == barcode)

    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=InventoryItemRead, status_code=status.HTTP_201_CREATED)
async def create_inventory_item(
    item_in: InventoryItemCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify site and place ownership
    site_res = await db.execute(
        select(Site).where(Site.id == item_in.site_id, Site.user_id == current_user.id)
    )
    if not site_res.scalars().first():
        raise HTTPException(status_code=400, detail="Invalid site_id")

    place_res = await db.execute(
        select(Place).where(Place.id == item_in.place_id, Place.site_id == item_in.site_id)
    )
    if not place_res.scalars().first():
        raise HTTPException(status_code=400, detail="Invalid place_id for this site")

    item_data = item_in.model_dump(exclude={"medicine_details", "equipment_details"})
    item = InventoryItem(**item_data, user_id=current_user.id)

    if item_in.item_type == ItemType.MEDICINE and item_in.medicine_details:
        item.medicine_details = MedicineDetail(**item_in.medicine_details.model_dump())
    elif item_in.item_type == ItemType.EQUIPMENT and item_in.equipment_details:
        item.equipment_details = EquipmentDetail(**item_in.equipment_details.model_dump())

    db.add(item)
    await db.commit()

    # Re-query with details loaded
    result = await db.execute(
        select(InventoryItem)
        .options(
            selectinload(InventoryItem.medicine_details),
            selectinload(InventoryItem.equipment_details),
        )
        .where(InventoryItem.id == item.id)
    )
    return result.scalars().first()


@router.get("/{item_id}", response_model=InventoryItemRead)
async def get_inventory_item(
    item_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    query = (
        select(InventoryItem)
        .options(
            selectinload(InventoryItem.medicine_details),
            selectinload(InventoryItem.equipment_details),
        )
        .where(InventoryItem.id == item_id, InventoryItem.user_id == current_user.id)
    )
    result = await db.execute(query)
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
    query = (
        select(InventoryItem)
        .options(
            selectinload(InventoryItem.medicine_details),
            selectinload(InventoryItem.equipment_details),
        )
        .where(InventoryItem.id == item_id, InventoryItem.user_id == current_user.id)
    )
    result = await db.execute(query)
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    update_data = item_in.model_dump(
        exclude_unset=True, exclude={"medicine_details", "equipment_details"}
    )
    for field, value in update_data.items():
        setattr(item, field, value)

    if item_in.medicine_details:
        if item.medicine_details:
            for f, v in item_in.medicine_details.model_dump(exclude_unset=True).items():
                setattr(item.medicine_details, f, v)
        else:
            item.medicine_details = MedicineDetail(**item_in.medicine_details.model_dump())

    if item_in.equipment_details:
        if item.equipment_details:
            for f, v in item_in.equipment_details.model_dump(exclude_unset=True).items():
                setattr(item.equipment_details, f, v)
        else:
            item.equipment_details = EquipmentDetail(**item_in.equipment_details.model_dump())

    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_inventory_item(
    item_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    query = select(InventoryItem).where(
        InventoryItem.id == item_id, InventoryItem.user_id == current_user.id
    )
    result = await db.execute(query)
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    await db.delete(item)
    await db.commit()
    return None

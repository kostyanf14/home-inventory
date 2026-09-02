from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.models import Place, Site, User
from app.schemas.schemas import PlaceCreate, PlaceRead, PlaceUpdate

router = APIRouter(prefix="/places", tags=["places"])

MAX_PLACE_DEPTH = 32


async def load_owned_place(db: AsyncSession, user: User, place_id: int) -> Place:
    result = await db.execute(
        select(Place).join(Site).where(Place.id == place_id, Site.user_id == user.id)
    )
    place = result.scalars().first()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")
    return place


async def assert_valid_parent(
    db: AsyncSession, site_id: int, parent_place_id: int, place_id: int | None = None
) -> None:
    """A parent must live in the same site, and must not create a cycle."""
    if place_id is not None and parent_place_id == place_id:
        raise HTTPException(status_code=400, detail="A place cannot be its own parent")

    result = await db.execute(
        select(Place).where(Place.id == parent_place_id, Place.site_id == site_id)
    )
    parent = result.scalars().first()
    if not parent:
        raise HTTPException(status_code=400, detail="Invalid parent_place_id for this site")

    if place_id is None:
        return

    # Walk up from the proposed parent; meeting this place again means a cycle.
    seen: set[int] = {place_id}
    current = parent
    for _ in range(MAX_PLACE_DEPTH):
        if current.parent_place_id is None:
            return
        if current.parent_place_id in seen:
            raise HTTPException(status_code=400, detail="parent_place_id would create a cycle")
        seen.add(current.parent_place_id)
        ancestor_res = await db.execute(select(Place).where(Place.id == current.parent_place_id))
        current = ancestor_res.scalars().first()
        if current is None:
            return
    raise HTTPException(status_code=400, detail="Place hierarchy is nested too deeply")


@router.get("", response_model=list[PlaceRead])
async def list_places(
    site_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Place).join(Site).where(Site.user_id == current_user.id).distinct()
    if site_id is not None:
        query = query.where(Place.site_id == site_id)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=PlaceRead, status_code=status.HTTP_201_CREATED)
async def create_place(
    place_in: PlaceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify user owns the site
    site_res = await db.execute(
        select(Site).where(Site.id == place_in.site_id, Site.user_id == current_user.id)
    )
    if not site_res.scalars().first():
        raise HTTPException(status_code=400, detail="Invalid site_id")

    if place_in.parent_place_id is not None:
        await assert_valid_parent(db, place_in.site_id, place_in.parent_place_id)

    place = Place(**place_in.model_dump())
    db.add(place)
    await db.commit()
    await db.refresh(place)
    return place


@router.get("/{place_id}", response_model=PlaceRead)
async def get_place(
    place_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await load_owned_place(db, current_user, place_id)


@router.patch("/{place_id}", response_model=PlaceRead)
async def update_place(
    place_id: int,
    place_in: PlaceUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    place = await load_owned_place(db, current_user, place_id)

    update_data = place_in.model_dump(exclude_unset=True)
    if update_data.get("parent_place_id") is not None:
        await assert_valid_parent(db, place.site_id, update_data["parent_place_id"], place.id)

    for field, value in update_data.items():
        setattr(place, field, value)

    await db.commit()
    await db.refresh(place)
    return place


@router.delete("/{place_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_place(
    place_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    place = await load_owned_place(db, current_user, place_id)
    await db.delete(place)
    await db.commit()
    return None

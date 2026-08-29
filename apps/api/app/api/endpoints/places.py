from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.models import Place, Site, User
from app.schemas.schemas import PlaceCreate, PlaceRead, PlaceUpdate

router = APIRouter(prefix="/places", tags=["places"])


@router.get("", response_model=list[PlaceRead])
async def list_places(
    site_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Place).join(Site).where(Site.user_id == current_user.id)
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
    site = site_res.scalars().first()
    if not site:
        raise HTTPException(status_code=400, detail="Invalid site_id")

    # If parent place provided, verify it belongs to same site
    if place_in.parent_place_id:
        parent_res = await db.execute(
            select(Place).where(
                Place.id == place_in.parent_place_id, Place.site_id == place_in.site_id
            )
        )
        if not parent_res.scalars().first():
            raise HTTPException(status_code=400, detail="Invalid parent_place_id for this site")

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
    query = select(Place).join(Site).where(Place.id == place_id, Site.user_id == current_user.id)
    result = await db.execute(query)
    place = result.scalars().first()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")
    return place


@router.patch("/{place_id}", response_model=PlaceRead)
async def update_place(
    place_id: int,
    place_in: PlaceUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Place).join(Site).where(Place.id == place_id, Site.user_id == current_user.id)
    result = await db.execute(query)
    place = result.scalars().first()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")

    update_data = place_in.model_dump(exclude_unset=True)
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
    query = select(Place).join(Site).where(Place.id == place_id, Site.user_id == current_user.id)
    result = await db.execute(query)
    place = result.scalars().first()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")

    await db.delete(place)
    await db.commit()
    return None

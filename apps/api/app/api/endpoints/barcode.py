import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.models import Product, User
from app.schemas.schemas import BarcodeLookupRequest, BarcodeLookupResponse, ProductRead

router = APIRouter(prefix="/barcode", tags=["barcode"])


@router.post("/lookup", response_model=BarcodeLookupResponse)
async def lookup_barcode(
    payload: BarcodeLookupRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    barcode = payload.barcode.strip()
    if not barcode:
        raise HTTPException(status_code=400, detail="Barcode is required")

    # 1. Check local catalog
    result = await db.execute(select(Product).where(Product.barcode == barcode))
    local_product = result.scalars().first()
    if local_product:
        return BarcodeLookupResponse(
            found=True,
            source="local",
            product=ProductRead.model_validate(local_product),
            message="Product found in local catalog",
        )

    # 2. Query external provider (Open Food Facts as default open API example)
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            off_url = f"https://world.openfoodfacts.org/api/v0/product/{barcode}.json"
            response = await client.get(off_url)
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == 1 and "product" in data:
                    off_prod = data["product"]
                    prod_name = (
                        off_prod.get("product_name")
                        or off_prod.get("generic_name")
                        or "Unknown External Product"
                    )
                    brand = off_prod.get("brands")
                    category = off_prod.get("categories")
                    image_url = off_prod.get("image_url")

                    # Create local product candidate
                    new_prod = Product(
                        name=prod_name,
                        brand=brand,
                        category=category,
                        barcode=barcode,
                        image_url=image_url,
                        source="external",
                        source_external_id=f"off_{barcode}",
                    )
                    db.add(new_prod)
                    await db.commit()
                    await db.refresh(new_prod)

                    return BarcodeLookupResponse(
                        found=True,
                        source="external",
                        product=ProductRead.model_validate(new_prod),
                        message="Product retrieved from Open Food Facts external database",
                    )
    except (httpx.HTTPError, ValueError):
        # Fallback gracefully if external lookup fails or times out
        pass

    return BarcodeLookupResponse(
        found=False,
        source="not_found",
        product=None,
        message="Barcode not found in local or external catalog",
    )

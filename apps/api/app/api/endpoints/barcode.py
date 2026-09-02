import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.models import Product, User
from app.schemas.schemas import (
    BarcodeLookupRequest,
    BarcodeLookupResponse,
    ProductPreview,
    ProductRead,
    ScanResultSaveRequest,
)

router = APIRouter(prefix="/barcode", tags=["barcode"])

OFF_PRODUCT_URL = "https://world.openfoodfacts.org/api/v0/product/{barcode}.json"
# Open Food Facts payloads are small; refuse anything that looks like an abuse of the proxy.
MAX_EXTERNAL_RESPONSE_BYTES = 512 * 1024


async def find_catalog_product(db: AsyncSession, user: User, barcode: str) -> Product | None:
    """The caller's own product first, then the shared catalog (user_id IS NULL)."""
    result = await db.execute(
        select(Product)
        .where(
            Product.barcode == barcode,
            or_(Product.user_id == user.id, Product.user_id.is_(None)),
        )
        .order_by(Product.user_id.is_(None))
    )
    return result.scalars().first()


async def fetch_external_product(barcode: str) -> dict | None:
    """Look the barcode up at Open Food Facts. Returns preview data, never a DB row."""
    try:
        async with httpx.AsyncClient(
            timeout=settings.EXTERNAL_LOOKUP_TIMEOUT_SECONDS, follow_redirects=False
        ) as client:
            response = await client.get(OFF_PRODUCT_URL.format(barcode=barcode))
            if response.status_code != 200:
                return None
            if len(response.content) > MAX_EXTERNAL_RESPONSE_BYTES:
                return None
            data = response.json()
    except (httpx.HTTPError, ValueError):
        # Fall through to "not found" when the provider fails or times out.
        return None

    if not isinstance(data, dict) or data.get("status") != 1:
        return None
    off_product = data.get("product")
    if not isinstance(off_product, dict):
        return None
    return off_product


def truncate(value: object, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed[:limit] or None


def external_preview(barcode: str, off_product: dict) -> ProductPreview:
    image_url = truncate(off_product.get("image_url"), 500)
    if image_url and not image_url.lower().startswith(("http://", "https://")):
        image_url = None
    return ProductPreview(
        name=truncate(off_product.get("product_name"), 200)
        or truncate(off_product.get("generic_name"), 200)
        or "Unknown External Product",
        brand=truncate(off_product.get("brands"), 200),
        category=truncate(off_product.get("categories"), 200),
        barcode=barcode,
        image_url=image_url,
        source="external",
        source_external_id=f"off_{barcode}",
    )


@router.post("/lookup", response_model=BarcodeLookupResponse)
async def lookup_barcode(
    payload: BarcodeLookupRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    barcode = payload.barcode

    local_product = await find_catalog_product(db, current_user, barcode)
    if local_product:
        return BarcodeLookupResponse(
            found=True,
            source="local",
            product=ProductPreview.model_validate(local_product),
            message="Product found in local catalog",
        )

    off_product = await fetch_external_product(barcode)
    if off_product is not None:
        # Nothing is written yet: the client confirms the prefill, then calls
        # POST /barcode/scan-result/save.
        return BarcodeLookupResponse(
            found=True,
            source="external",
            product=external_preview(barcode, off_product),
            message="Product retrieved from Open Food Facts. Confirm to save it to your catalog.",
        )

    return BarcodeLookupResponse(
        found=False,
        source="not_found",
        product=None,
        message="Barcode not found in local or external catalog",
    )


@router.post("/scan-result/save", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
async def save_scan_result(
    payload: ScanResultSaveRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Persist a confirmed lookup into the caller's own catalog."""
    existing = await db.execute(
        select(Product).where(
            Product.barcode == payload.barcode, Product.user_id == current_user.id
        )
    )
    product = existing.scalars().first()
    data = payload.model_dump()

    if product:
        for field, value in data.items():
            setattr(product, field, value)
    else:
        product = Product(**data, user_id=current_user.id)
        db.add(product)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=409, detail="This barcode is already in your catalog"
        ) from exc

    await db.refresh(product)
    return product

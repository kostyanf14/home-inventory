import html
import re

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.rate_limit import enforce_external_lookup_rate_limit
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

OFF_PRODUCT_URL = "https://world.openfoodfacts.org/api/v3/product/{barcode}"
OFF_FIELDS = (
    "product_name,product_name_en,product_name_uk,product_name_ru,"
    "generic_name,generic_name_en,generic_name_uk,brands,categories,image_url"
)
OFF_LANGUAGE_ALIASES = {"ua": "uk", "uk": "uk", "en": "en"}
# Open Food Facts payloads are small; refuse anything that looks like an abuse of the proxy.
MAX_EXTERNAL_RESPONSE_BYTES = 512 * 1024
CATALOG_BARCODE_RE = re.compile(r"^[0-9]{6,14}$")


def is_catalog_barcode(value: str | None) -> bool:
    return bool(value and CATALOG_BARCODE_RE.fullmatch(value))


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


async def upsert_user_catalog_product(
    db: AsyncSession,
    user: User,
    *,
    barcode: str,
    name: str,
    default_unit: str | None = None,
    category: str | None = None,
) -> Product | None:
    """Create a user-owned catalog row for a new 6-14 digit barcode.

    Existing rows (the caller's, or the shared catalog) are returned unchanged.
    """
    if not is_catalog_barcode(barcode):
        return None

    existing = await find_catalog_product(db, user, barcode)
    if existing:
        return existing

    product = Product(
        name=name,
        barcode=barcode,
        default_unit=default_unit,
        category=category,
        source="user",
        user_id=user.id,
    )
    db.add(product)
    await db.flush()
    return product


async def fetch_external_product(barcode: str, language: str = "en") -> dict | None:
    """Look the barcode up at Open Food Facts. Returns preview data, never a DB row."""
    try:
        async with httpx.AsyncClient(
            timeout=settings.EXTERNAL_LOOKUP_TIMEOUT_SECONDS, follow_redirects=False
        ) as client:
            response = await client.get(
                OFF_PRODUCT_URL.format(barcode=barcode),
                params={"fields": OFF_FIELDS, "lc": language},
                headers={"User-Agent": settings.EXTERNAL_LOOKUP_USER_AGENT},
            )
            if response.status_code != 200:
                return None
            if len(response.content) > MAX_EXTERNAL_RESPONSE_BYTES:
                return None
            data = response.json()
    except (httpx.HTTPError, ValueError):
        # Fall through to "not found" when the provider fails or times out.
        return None

    return off_product_from_response(data)


def off_product_from_response(data: object) -> dict | None:
    """Parse an Open Food Facts v3 product envelope (status success, result product_found)."""
    if not isinstance(data, dict):
        return None
    if data.get("status") != "success":
        return None
    result = data.get("result")
    if isinstance(result, dict) and result.get("id") not in (None, "product_found"):
        return None
    off_product = data.get("product")
    if not isinstance(off_product, dict):
        return None
    return off_product


def off_language(value: str | None) -> str:
    if not value:
        return "en"
    return OFF_LANGUAGE_ALIASES.get(value.strip().lower(), "en")


def localized_text(product: dict, base: str, preferred_lc: str) -> str | None:
    """Open Food Facts often stores the only name as product_name_uk (etc.), not product_name."""
    keys = [base, f"{base}_{preferred_lc}", f"{base}_en", f"{base}_uk", f"{base}_ru"]
    seen: set[str] = set()
    for key in keys:
        if key in seen:
            continue
        seen.add(key)
        name = clean_text(product.get(key), 200)
        if name:
            return name
    prefix = f"{base}_"
    for key, value in product.items():
        if not isinstance(key, str) or not key.startswith(prefix) or key in seen:
            continue
        name = clean_text(value, 200)
        if name:
            return name
    return None


def clean_text(value: object, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    text = re.sub(r"\s+", " ", html.unescape(value)).strip()
    return text[:limit] or None


def truncate(value: object, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed[:limit] or None


def external_preview(barcode: str, off_product: dict, language: str = "en") -> ProductPreview:
    image_url = truncate(off_product.get("image_url"), 500)
    if image_url and not image_url.lower().startswith(("http://", "https://")):
        image_url = None
    return ProductPreview(
        name=localized_text(off_product, "product_name", language)
        or localized_text(off_product, "generic_name", language)
        or "Unknown External Product",
        brand=clean_text(off_product.get("brands"), 200),
        category=clean_text(off_product.get("categories"), 200),
        barcode=barcode,
        image_url=image_url,
        source="external",
        source_external_id=f"off_{barcode}",
    )


@router.post("/lookup", response_model=BarcodeLookupResponse)
async def lookup_barcode(
    payload: BarcodeLookupRequest,
    request: Request,
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

    if payload.local_only:
        return BarcodeLookupResponse(
            found=False,
            source="not_found",
            product=None,
            message="Barcode not found in local catalog",
        )

    enforce_external_lookup_rate_limit(request, current_user.id)
    language = off_language(payload.language)
    off_product = await fetch_external_product(barcode, language)
    if off_product is not None:
        # Nothing is written yet: the client confirms the prefill, then calls
        # POST /barcode/scan-result/save.
        return BarcodeLookupResponse(
            found=True,
            source="external",
            product=external_preview(barcode, off_product, language),
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

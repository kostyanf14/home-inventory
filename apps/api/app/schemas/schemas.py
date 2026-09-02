from datetime import date, datetime
from typing import Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.core.config import settings
from app.core.security import BCRYPT_MAX_PASSWORD_BYTES
from app.models.models import ItemStatus, ItemType

ALLOWED_URL_SCHEMES = ("http://", "https://")

# GTIN-8/12/13/14 plus the shorter codes still printed on local goods.
StrictBarcode = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[0-9]{6,14}$")]
# Item barcodes are only ever compared, never interpolated into a URL, so they
# stay permissive - but bounded and free of whitespace and control characters.
ItemBarcode = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64, pattern=r"^\S+$")
]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Unit = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)]
Password = Annotated[
    str, StringConstraints(min_length=settings.PASSWORD_MIN_LENGTH, max_length=128)
]
Quantity = Annotated[float, Field(ge=0, le=1_000_000_000, allow_inf_nan=False)]


def _validate_url(value: str | None) -> str | None:
    if value is None:
        return None
    candidate = value.strip()
    if not candidate:
        return None
    if not candidate.lower().startswith(ALLOWED_URL_SCHEMES):
        raise ValueError("URL must start with http:// or https://")
    return candidate


class UrlFieldsMixin(BaseModel):
    """Keeps javascript: and data: URLs out of fields the clients render as links."""

    @field_validator("photo_url", "image_url", "receipt_file_url", check_fields=False)
    @classmethod
    def check_url(cls, value: str | None) -> str | None:
        return _validate_url(value)


# Token Schemas
class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenData(BaseModel):
    user_id: int | None = None


# User Schemas
class UserCreate(BaseModel):
    email: EmailStr
    password: Password
    name: str | None = Field(default=None, max_length=200)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("password")
    @classmethod
    def check_password_bytes(cls, value: str) -> str:
        if len(value.encode("utf-8")) > BCRYPT_MAX_PASSWORD_BYTES:
            raise ValueError(
                f"Password must not exceed {BCRYPT_MAX_PASSWORD_BYTES} bytes when UTF-8 encoded"
            )
        return value


class UserRead(BaseModel):
    id: int
    email: EmailStr
    name: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Site Schemas
class SiteBase(BaseModel):
    name: ShortText
    type: str | None = Field(default=None, max_length=100)
    address_line_1: str | None = Field(default=None, max_length=200)
    address_line_2: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=32)
    country: str | None = Field(default=None, max_length=100)
    notes: str | None = None


class SiteCreate(SiteBase):
    pass


class SiteUpdate(BaseModel):
    name: ShortText | None = None
    type: str | None = Field(default=None, max_length=100)
    address_line_1: str | None = Field(default=None, max_length=200)
    address_line_2: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=32)
    country: str | None = Field(default=None, max_length=100)
    notes: str | None = None


class SiteRead(SiteBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Place Schemas
class PlaceBase(BaseModel):
    name: ShortText
    type: str | None = Field(default=None, max_length=100)
    parent_place_id: int | None = Field(default=None, ge=1)
    notes: str | None = None


class PlaceCreate(PlaceBase):
    site_id: int = Field(ge=1)


class PlaceUpdate(BaseModel):
    name: ShortText | None = None
    type: str | None = Field(default=None, max_length=100)
    parent_place_id: int | None = Field(default=None, ge=1)
    notes: str | None = None


class PlaceRead(PlaceBase):
    id: int
    site_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Medicine Detail Schemas
class MedicineDetailBase(BaseModel):
    expiration_date: date
    dosage: str | None = Field(default=None, max_length=100)
    form: str | None = Field(default=None, max_length=100)
    requires_prescription: bool = False
    batch_number: str | None = Field(default=None, max_length=100)


class MedicineDetailCreate(MedicineDetailBase):
    pass


class MedicineDetailRead(MedicineDetailBase):
    inventory_item_id: int

    model_config = ConfigDict(from_attributes=True)


# Equipment Detail Schemas
class EquipmentDetailBase(UrlFieldsMixin):
    serial_number: str | None = Field(default=None, max_length=100)
    buy_date: date | None = None
    warranty_expiration_date: date | None = None
    model_number: str | None = Field(default=None, max_length=100)
    vendor_name: str | None = Field(default=None, max_length=200)
    receipt_file_url: str | None = None

    @model_validator(mode="after")
    def check_dates(self):
        if (
            self.buy_date
            and self.warranty_expiration_date
            and self.warranty_expiration_date < self.buy_date
        ):
            raise ValueError("warranty_expiration_date must not be before buy_date")
        return self


class EquipmentDetailCreate(EquipmentDetailBase):
    pass


class EquipmentDetailRead(EquipmentDetailBase):
    inventory_item_id: int

    model_config = ConfigDict(from_attributes=True)


# Product Schemas
class ProductBase(UrlFieldsMixin):
    name: ShortText
    brand: str | None = Field(default=None, max_length=200)
    category: str | None = Field(default=None, max_length=200)
    barcode: StrictBarcode | None = None
    manufacturer: str | None = Field(default=None, max_length=200)
    default_unit: str | None = Field(default=None, max_length=32)
    image_url: str | None = None


class ProductCreate(ProductBase):
    pass


class ProductRead(ProductBase):
    id: int
    user_id: int | None = None
    source: str
    source_external_id: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProductPreview(ProductBase):
    """A lookup result. `id` is set only when the product is already in the catalog."""

    id: int | None = None
    source: str
    source_external_id: str | None = None

    model_config = ConfigDict(from_attributes=True)


def require_details_for_type(
    item_type: ItemType,
    medicine_details: "MedicineDetailCreate | None",
    equipment_details: "EquipmentDetailCreate | None",
) -> None:
    """Reject detail blocks that do not belong to the item's type."""
    if medicine_details is not None and item_type != ItemType.MEDICINE:
        raise ValueError("medicine_details is only allowed when item_type is medicine")
    if equipment_details is not None and item_type != ItemType.EQUIPMENT:
        raise ValueError("equipment_details is only allowed when item_type is equipment")


# Inventory Item Schemas
class InventoryItemBase(UrlFieldsMixin):
    site_id: int = Field(ge=1)
    place_id: int = Field(ge=1)
    product_id: int | None = Field(default=None, ge=1)
    item_type: ItemType = ItemType.OTHER
    display_name: ShortText
    barcode: ItemBarcode | None = None
    quantity: Quantity = 1.0
    unit: Unit = "pcs"
    status: ItemStatus = ItemStatus.ACTIVE
    notes: str | None = None
    photo_url: str | None = None


class InventoryItemCreate(InventoryItemBase):
    medicine_details: MedicineDetailCreate | None = None
    equipment_details: EquipmentDetailCreate | None = None

    @model_validator(mode="after")
    def check_type_details(self):
        require_details_for_type(self.item_type, self.medicine_details, self.equipment_details)
        if self.item_type == ItemType.MEDICINE and self.medicine_details is None:
            raise ValueError("medicine_details with an expiration_date is required for medicine")
        return self


class InventoryItemUpdate(UrlFieldsMixin):
    site_id: int | None = Field(default=None, ge=1)
    place_id: int | None = Field(default=None, ge=1)
    product_id: int | None = Field(default=None, ge=1)
    display_name: ShortText | None = None
    barcode: ItemBarcode | None = None
    quantity: Quantity | None = None
    unit: Unit | None = None
    status: ItemStatus | None = None
    notes: str | None = None
    photo_url: str | None = None
    medicine_details: MedicineDetailCreate | None = None
    equipment_details: EquipmentDetailCreate | None = None


class InventoryItemRead(InventoryItemBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime
    medicine_details: MedicineDetailRead | None = None
    equipment_details: EquipmentDetailRead | None = None

    model_config = ConfigDict(from_attributes=True)


# Barcode Lookup Schemas
class BarcodeLookupRequest(BaseModel):
    barcode: StrictBarcode
    # Step 1 of barcode support: the web UI looks in the caller's catalog only.
    local_only: bool = False


class BarcodeLookupResponse(BaseModel):
    found: bool
    source: str  # local, external, not_found
    product: ProductPreview | None = None
    message: str | None = None


class ScanResultSaveRequest(ProductBase):
    """A lookup result the user confirmed; only now is it written to the catalog."""

    barcode: StrictBarcode
    source: str = "external"
    source_external_id: str | None = Field(default=None, max_length=200)

    @field_validator("source")
    @classmethod
    def check_source(cls, value: str) -> str:
        allowed = {"manual", "external", "user"}
        if value not in allowed:
            raise ValueError(f"source must be one of {sorted(allowed)}")
        return value

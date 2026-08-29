from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models.models import ItemStatus, ItemType


# Token Schemas
class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    user_id: int | None = None


# User Schemas
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str | None = None


class UserRead(BaseModel):
    id: int
    email: EmailStr
    name: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Site Schemas
class SiteBase(BaseModel):
    name: str
    type: str | None = None
    address_line_1: str | None = None
    address_line_2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    notes: str | None = None


class SiteCreate(SiteBase):
    pass


class SiteUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    address_line_1: str | None = None
    address_line_2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    notes: str | None = None


class SiteRead(SiteBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Place Schemas
class PlaceBase(BaseModel):
    name: str
    type: str | None = None
    parent_place_id: int | None = None
    notes: str | None = None


class PlaceCreate(PlaceBase):
    site_id: int


class PlaceUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    parent_place_id: int | None = None
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
    dosage: str | None = None
    form: str | None = None
    requires_prescription: bool = False
    batch_number: str | None = None


class MedicineDetailCreate(MedicineDetailBase):
    pass


class MedicineDetailRead(MedicineDetailBase):
    inventory_item_id: int

    model_config = ConfigDict(from_attributes=True)


# Equipment Detail Schemas
class EquipmentDetailBase(BaseModel):
    serial_number: str | None = None
    buy_date: date | None = None
    warranty_expiration_date: date | None = None
    model_number: str | None = None
    vendor_name: str | None = None
    receipt_file_url: str | None = None


class EquipmentDetailCreate(EquipmentDetailBase):
    pass


class EquipmentDetailRead(EquipmentDetailBase):
    inventory_item_id: int

    model_config = ConfigDict(from_attributes=True)


# Product Schemas
class ProductBase(BaseModel):
    name: str
    brand: str | None = None
    category: str | None = None
    barcode: str | None = None
    manufacturer: str | None = None
    default_unit: str | None = None
    image_url: str | None = None


class ProductCreate(ProductBase):
    pass


class ProductRead(ProductBase):
    id: int
    source: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Inventory Item Schemas
class InventoryItemBase(BaseModel):
    site_id: int
    place_id: int
    product_id: int | None = None
    item_type: ItemType = ItemType.OTHER
    display_name: str
    barcode: str | None = None
    quantity: float = 1.0
    unit: str = "pcs"
    status: ItemStatus = ItemStatus.ACTIVE
    notes: str | None = None
    photo_url: str | None = None


class InventoryItemCreate(InventoryItemBase):
    medicine_details: MedicineDetailCreate | None = None
    equipment_details: EquipmentDetailCreate | None = None


class InventoryItemUpdate(BaseModel):
    site_id: int | None = None
    place_id: int | None = None
    product_id: int | None = None
    display_name: str | None = None
    barcode: str | None = None
    quantity: float | None = None
    unit: str | None = None
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
    barcode: str


class BarcodeLookupResponse(BaseModel):
    found: bool
    source: str  # local, external, not_found
    product: ProductRead | None = None
    message: str | None = None

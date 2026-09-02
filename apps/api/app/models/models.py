import enum
from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.db.session import Base


def utc_now():
    return datetime.now(UTC)


def as_utc(value: datetime | None) -> datetime | None:
    """SQLite hands back naive datetimes; treat stored values as UTC."""
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)


class ItemType(enum.StrEnum):
    MEDICINE = "medicine"
    EQUIPMENT = "equipment"
    OTHER = "other"


class ItemStatus(enum.StrEnum):
    ACTIVE = "active"
    USED = "used"
    DISPOSED = "disposed"
    MISSING = "missing"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    name = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    sites = relationship("Site", back_populates="owner", cascade="all, delete-orphan")
    inventory_items = relationship(
        "InventoryItem", back_populates="owner", cascade="all, delete-orphan"
    )
    products = relationship("Product", back_populates="owner", cascade="all, delete-orphan")
    auth_sessions = relationship("AuthSession", back_populates="user", cascade="all, delete-orphan")


class AuthSession(Base):
    """One login. Access and refresh tokens carry its `sid`, so it can be revoked."""

    __tablename__ = "auth_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    session_id = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    rotated_to = Column(String, nullable=True)

    user = relationship("User", back_populates="auth_sessions")


class Site(Base):
    __tablename__ = "sites"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    type = Column(String, nullable=True)  # home, office, storage, etc.
    address_line_1 = Column(String, nullable=True)
    address_line_2 = Column(String, nullable=True)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True)
    postal_code = Column(String, nullable=True)
    country = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    owner = relationship("User", back_populates="sites")
    places = relationship("Place", back_populates="site", cascade="all, delete-orphan")
    inventory_items = relationship(
        "InventoryItem", back_populates="site", cascade="all, delete-orphan"
    )


class Place(Base):
    __tablename__ = "places"

    id = Column(Integer, primary_key=True, index=True)
    site_id = Column(Integer, ForeignKey("sites.id"), nullable=False)
    name = Column(String, nullable=False)
    type = Column(String, nullable=True)  # room, cabinet, drawer, box, kit
    parent_place_id = Column(Integer, ForeignKey("places.id"), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    site = relationship("Site", back_populates="places")
    parent = relationship("Place", remote_side=[id], backref="sub_places")
    inventory_items = relationship(
        "InventoryItem", back_populates="place", cascade="all, delete-orphan"
    )


class Product(Base):
    __tablename__ = "products"

    __table_args__ = (UniqueConstraint("user_id", "barcode", name="uq_products_user_barcode"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    name = Column(String, nullable=False)
    brand = Column(String, nullable=True)
    category = Column(String, nullable=True)
    barcode = Column(String, index=True, nullable=True)
    manufacturer = Column(String, nullable=True)
    default_unit = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    source = Column(String, default="manual")  # manual, external, user
    source_external_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    owner = relationship("User", back_populates="products")


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)
    site_id = Column(Integer, ForeignKey("sites.id"), nullable=False)
    place_id = Column(Integer, ForeignKey("places.id"), nullable=False)
    item_type = Column(Enum(ItemType), default=ItemType.OTHER, nullable=False)
    display_name = Column(String, nullable=False)
    barcode = Column(String, index=True, nullable=True)
    quantity = Column(Float, default=1.0, nullable=False)
    unit = Column(String, default="pcs", nullable=False)
    status = Column(Enum(ItemStatus), default=ItemStatus.ACTIVE, nullable=False)
    notes = Column(Text, nullable=True)
    photo_url = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    owner = relationship("User", back_populates="inventory_items")
    site = relationship("Site", back_populates="inventory_items")
    place = relationship("Place", back_populates="inventory_items")
    product = relationship("Product")
    medicine_details = relationship(
        "MedicineDetail",
        uselist=False,
        back_populates="inventory_item",
        cascade="all, delete-orphan",
    )
    equipment_details = relationship(
        "EquipmentDetail",
        uselist=False,
        back_populates="inventory_item",
        cascade="all, delete-orphan",
    )


class MedicineDetail(Base):
    __tablename__ = "medicine_details"

    inventory_item_id = Column(Integer, ForeignKey("inventory_items.id"), primary_key=True)
    expiration_date = Column(Date, nullable=False)
    dosage = Column(String, nullable=True)
    form = Column(String, nullable=True)  # tablet, spray, ointment, etc.
    requires_prescription = Column(Boolean, default=False)
    batch_number = Column(String, nullable=True)

    inventory_item = relationship("InventoryItem", back_populates="medicine_details")


class EquipmentDetail(Base):
    __tablename__ = "equipment_details"

    inventory_item_id = Column(Integer, ForeignKey("inventory_items.id"), primary_key=True)
    serial_number = Column(String, nullable=True)
    buy_date = Column(Date, nullable=True)
    warranty_expiration_date = Column(Date, nullable=True)
    model_number = Column(String, nullable=True)
    vendor_name = Column(String, nullable=True)
    receipt_file_url = Column(String, nullable=True)

    inventory_item = relationship("InventoryItem", back_populates="equipment_details")

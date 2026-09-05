"""Add food item type and food_details.

Revision ID: 0002_food_item_type
Revises: 0001_initial
Create Date: 2026-09-05 19:45:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0002_food_item_type"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "food_details",
        sa.Column("inventory_item_id", sa.Integer(), nullable=False),
        sa.Column("expiration_date", sa.Date(), nullable=False),
        sa.Column("form", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(
            ["inventory_item_id"],
            ["inventory_items.id"],
        ),
        sa.PrimaryKeyConstraint("inventory_item_id"),
    )
    with op.batch_alter_table("inventory_items", schema=None) as batch_op:
        batch_op.alter_column(
            "item_type",
            existing_type=sa.Enum("MEDICINE", "EQUIPMENT", "OTHER", name="itemtype"),
            type_=sa.Enum("MEDICINE", "EQUIPMENT", "FOOD", "OTHER", name="itemtype"),
            existing_nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("inventory_items", schema=None) as batch_op:
        batch_op.alter_column(
            "item_type",
            existing_type=sa.Enum("MEDICINE", "EQUIPMENT", "FOOD", "OTHER", name="itemtype"),
            type_=sa.Enum("MEDICINE", "EQUIPMENT", "OTHER", name="itemtype"),
            existing_nullable=False,
        )
    op.drop_table("food_details")

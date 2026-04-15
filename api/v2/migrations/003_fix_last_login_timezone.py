"""Fix last_login timezone column

Revision ID: v2_003
Revises:
Create Date: 2026-04-15

"""
from alembic import op
import sqlalchemy as sa

revision = 'v2_003'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Change last_login from naive datetime to timezone-aware
    op.alter_column('auth_user', 'last_login',
                    existing_type=sa.DateTime(),
                    type_=sa.DateTime(timezone=True),
                    postgresql_using='last_login AT TIME ZONE \'UTC\'')


def downgrade() -> None:
    op.alter_column('auth_user', 'last_login',
                    existing_type=sa.DateTime(timezone=True),
                    type_=sa.DateTime())
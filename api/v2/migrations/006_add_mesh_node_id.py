"""Add mesh_node_id to agents table

Revision ID: 006
Create Date: 2026-04-17

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add mesh_node_id column to agents table
    op.add_column('agents_agent', sa.Column('mesh_node_id', sa.String(255), nullable=True))
    # Create index for faster lookups
    op.create_index('ix_agents_agent_mesh_node_id', 'agents_agent', ['mesh_node_id'])


def downgrade() -> None:
    # Remove index and column
    op.drop_index('ix_agents_agent_mesh_node_id', table_name='agents_agent')
    op.drop_column('agents_agent', 'mesh_node_id')
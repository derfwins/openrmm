"""Migration: Create script execution and package tables."""

from sqlalchemy import create_engine
from v2.config import settings
from v2.database import Base
from v2.models.script import ScriptExecution
from v2.models.package import Package, PackageExecution

# Use synchronous engine for migration
sync_url = settings.DATABASE_URL.replace("+asyncpg", "+psycopg2").replace("postgresql+asyncpg", "postgresql")
engine = create_engine(sync_url, isolation_level="AUTOCOMMIT")


def upgrade():
    """Create scripts_execution, packages_package, and packages_execution tables."""
    ScriptExecution.__table__.create(bind=engine, checkfirst=True)
    Package.__table__.create(bind=engine, checkfirst=True)
    PackageExecution.__table__.create(bind=engine, checkfirst=True)
    print("Created scripts_execution, packages_package, and packages_execution tables")


def downgrade():
    """Drop scripts_execution, packages_package, and packages_execution tables."""
    PackageExecution.__table__.drop(bind=engine, checkfirst=True)
    Package.__table__.drop(bind=engine, checkfirst=True)
    ScriptExecution.__table__.drop(bind=engine, checkfirst=True)
    print("Dropped scripts_execution, packages_package, and packages_execution tables")


if __name__ == "__main__":
    upgrade()
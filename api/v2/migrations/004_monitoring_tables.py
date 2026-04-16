"""Migration: Create monitoring tables."""

from sqlalchemy import create_engine, text
from v2.config import settings

# Use synchronous engine for migration
sync_url = settings.DATABASE_URL.replace("+asyncpg", "+psycopg2").replace("postgresql+asyncpg", "postgresql")
engine = create_engine(sync_url, isolation_level="AUTOCOMMIT")

from v2.models.monitoring import (
    MonitoringProbe, MonitoringGroup, MonitoringSensor,
    MonitoringReading, MonitoringBackup, MonitoringAlertRule,
)
from v2.database import Base


def upgrade():
    """Create all monitoring tables."""
    MonitoringProbe.__table__.create(bind=engine, checkfirst=True)
    MonitoringGroup.__table__.create(bind=engine, checkfirst=True)
    MonitoringSensor.__table__.create(bind=engine, checkfirst=True)
    MonitoringReading.__table__.create(bind=engine, checkfirst=True)
    MonitoringBackup.__table__.create(bind=engine, checkfirst=True)
    MonitoringAlertRule.__table__.create(bind=engine, checkfirst=True)
    print("Created 6 monitoring tables")


def downgrade():
    """Drop all monitoring tables."""
    MonitoringAlertRule.__table__.drop(bind=engine, checkfirst=True)
    MonitoringBackup.__table__.drop(bind=engine, checkfirst=True)
    MonitoringReading.__table__.drop(bind=engine, checkfirst=True)
    MonitoringSensor.__table__.drop(bind=engine, checkfirst=True)
    MonitoringGroup.__table__.drop(bind=engine, checkfirst=True)
    MonitoringProbe.__table__.drop(bind=engine, checkfirst=True)
    print("Dropped monitoring tables")


if __name__ == "__main__":
    upgrade()
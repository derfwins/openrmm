"""Migration: Create monitoring tables."""

from sqlalchemy import text
from v2.database import engine, Base
from v2.models.monitoring import (
    MonitoringProbe, MonitoringGroup, MonitoringSensor,
    MonitoringReading, MonitoringBackup, MonitoringAlertRule,
)


def upgrade():
    """Create all monitoring tables."""
    tables = [
        MonitoringProbe.__table__,
        MonitoringGroup.__table__,
        MonitoringSensor.__table__,
        MonitoringReading.__table__,
        MonitoringBackup.__table__,
        MonitoringAlertRule.__table__,
    ]
    for table in tables:
        table.create(bind=engine, checkfirst=True)
    print(f"Created {len(tables)} monitoring tables")


def downgrade():
    """Drop all monitoring tables."""
    for table in reversed([
        MonitoringAlertRule.__table__,
        MonitoringBackup.__table__,
        MonitoringReading.__table__,
        MonitoringSensor.__table__,
        MonitoringGroup.__table__,
        MonitoringProbe.__table__,
    ]):
        table.drop(bind=engine, checkfirst=True)
    print("Dropped monitoring tables")


if __name__ == "__main__":
    upgrade()
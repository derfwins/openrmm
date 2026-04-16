"""Create audit log table"""
from sqlalchemy import create_engine
from v2.config import settings
from v2.models.audit import AuditLog
from v2.database import Base

sync_url = settings.DATABASE_URL.replace("+asyncpg", "+psycopg2").replace("postgresql+asyncpg", "postgresql")
engine = create_engine(sync_url, isolation_level="AUTOCOMMIT")


def upgrade():
    AuditLog.__table__.create(bind=engine, checkfirst=True)
    print("Created audit_auditlog table")


def downgrade():
    AuditLog.__table__.drop(bind=engine, checkfirst=True)
    print("Dropped audit_auditlog table")


if __name__ == "__main__":
    upgrade()
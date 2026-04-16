"""Audit log model"""
from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func
from v2.database import Base


class AuditLog(Base):
    __tablename__ = "audit_auditlog"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(255), nullable=False)
    action = Column(String(100), nullable=False)  # login, logout, create, update, delete, run_script, etc.
    resource_type = Column(String(100), nullable=True)  # agent, client, site, script, user, etc.
    resource_id = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    ip_address = Column(String(45), nullable=True)
    timestamp = Column(DateTime, server_default=func.now())
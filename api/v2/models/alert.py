"""Alert model"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from v2.database import Base


class Alert(Base):
    __tablename__ = "alerts_alert"

    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("agents_agent.id", ondelete="CASCADE"), nullable=True)
    alert_type = Column(String(50), nullable=False)  # warning, info, critical
    message = Column(Text, default="", server_default="")
    is_resolved = Column(Boolean, default=False, server_default="false")
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    # Source
    source = Column(String(100), default="", server_default="")  # check, script, agent, system
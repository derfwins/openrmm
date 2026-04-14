"""Agent model"""
from sqlalchemy import Column, Integer, String, Boolean, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from v2.database import Base


class Agent(Base):
    __tablename__ = "agents_agent"

    id = Column(Integer, primary_key=True, index=True)
    hostname = Column(String(255), nullable=False)
    agent_id = Column(String(255), unique=True, nullable=False, index=True)

    # Connection info
    site_id = Column(Integer, ForeignKey("clients_site.id", ondelete="SET NULL"), nullable=True)
    version = Column(String(50), default="", server_default="")
    operating_system = Column(String(255), default="", server_default="")
    plat = Column(String(50), default="", server_default="")  # windows, linux, darwin
    goarch = Column(String(50), default="", server_default="")  # amd64, arm64

    # Status
    status = Column(String(50), default="offline", server_default="offline")  # online, offline, overdue
    last_seen = Column(DateTime, nullable=True)
    first_seen = Column(DateTime, server_default=func.now())
    last_heartbeat = Column(DateTime, nullable=True)

    # Monitoring
    monitoring_type = Column(String(50), default="server", server_default="server")  # server, workstation
    description = Column(Text, default="", server_default="")
    mesh_node_id = Column(String(255), default="", server_default="")

    # Settings
    is_maintenance = Column(Boolean, default=False, server_default="false")
    block_policy_inheritance = Column(Boolean, default=False, server_default="false")

    # System info (updated by agent)
    cpu_model = Column(String(255), default="", server_default="")
    cpu_cores = Column(Integer, default=0, server_default="0")
    total_ram = Column(Float, default=0, server_default="0")
    os_name = Column(String(255), default="", server_default="")
    os_version = Column(String(255), default="", server_default="")
    public_ip = Column(String(50), default="", server_default="")
    local_ip = Column(String(50), default="", server_default="")
    logged_in_user = Column(String(255), default="", server_default="")

    site = relationship("Site", back_populates="agents")
    checks = relationship("Check", back_populates="agent", cascade="all, delete-orphan")


class Check(Base):
    __tablename__ = "agents_check"

    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("agents_agent.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    check_type = Column(String(50), nullable=False)  # ping, disk, script, etc.
    status = Column(String(50), default="pending", server_default="pending")
    last_run = Column(DateTime, nullable=True)
    more_info = Column(Text, default="", server_default="")

    agent = relationship("Agent", back_populates="checks")
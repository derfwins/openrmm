"""Core settings model"""
from sqlalchemy import Column, Integer, String, Boolean, Text
from v2.database import Base


class CoreSettings(Base):
    __tablename__ = "core_coresettings"

    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String(255), default="OpenRMM", server_default="OpenRMM")
    timezone = Column(String(255), default="UTC", server_default="UTC")
    date_format = Column(String(50), default="MM/DD/YYYY", server_default="MM/DD/YYYY")
    agent_auto_update = Column(Boolean, default=True, server_default="true")

    # Domain settings
    api_url = Column(String(255), default="", server_default="")
    frontend_url = Column(String(255), default="", server_default="")
    mesh_site = Column(String(255), default="", server_default="")
    mesh_username = Column(String(255), default="", server_default="")
    mesh_token_key = Column(String(255), default="", server_default="")
    mesh_device_group = Column(String(255), default="", server_default="")
    mesh_sync = Column(Boolean, default=False, server_default="false")

    # Email settings
    smtp_host = Column(String(255), default="", server_default="")
    smtp_port = Column(Integer, default=587, server_default="587")
    smtp_username = Column(String(255), default="", server_default="")
    smtp_password = Column(String(255), default="", server_default="")
    smtp_from = Column(String(255), default="", server_default="")
    smtp_use_tls = Column(Boolean, default=True, server_default="true")

    # Notification settings
    alert_warning = Column(Boolean, default=True, server_default="true")
    alert_info = Column(Boolean, default=True, server_default="true")

    # Security settings
    server_scripts = Column(Boolean, default=False, server_default="false")
    web_terminal = Column(Boolean, default=False, server_default="false")
    enable_sso = Column(Boolean, default=False, server_default="false")
    debug_level = Column(Integer, default=0, server_default="0")
    data_retention_days = Column(Integer, default=0, server_default="0")

    # AI settings
    openai_api_key = Column(String(255), default="", server_default="")
    ai_model = Column(String(255), default="gpt-4", server_default="gpt-4")
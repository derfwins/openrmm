"""Script model"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from v2.database import Base


class Script(Base):
    __tablename__ = "scripts_script"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="", server_default="")
    script_type = Column(String(50), default="powershell", server_default="powershell")  # powershell, bash, python
    category = Column(String(100), default="", server_default="")  # community, custom, shared
    script_body = Column(Text, default="", server_default="")
    args = Column(Text, default="", server_default="")
    shell = Column(String(50), default="powershell", server_default="powershell")
    timeout = Column(Integer, default=300, server_default="300")  # seconds
    is_active = Column(Boolean, default=True, server_default="true")
    created_by = Column(String(255), default="", server_default="")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
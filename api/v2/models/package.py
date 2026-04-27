"""Package model - software packages for deployment"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from v2.database import Base


class Package(Base):
    __tablename__ = "packages_package"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="", server_default="")
    filename = Column(String(255), nullable=False)
    file_path = Column(String(512), nullable=False)
    file_size = Column(Integer, default=0)
    file_hash = Column(String(64), default="", server_default="")
    package_type = Column(String(50), default="msi", server_default="msi")  # msi, exe, ps1
    install_args = Column(Text, default="", server_default="")
    uninstall_args = Column(Text, default="", server_default="")
    created_by = Column(String(255), default="", server_default="")
    created_at = Column(DateTime, server_default=func.now())


class PackageExecution(Base):
    __tablename__ = "packages_execution"

    id = Column(Integer, primary_key=True, index=True)
    package_id = Column(Integer, ForeignKey("packages_package.id", ondelete="SET NULL"), nullable=True)
    agent_id = Column(String(255), nullable=False)
    session_id = Column(String(255), default="", server_default="")
    status = Column(String(50), default="pending", server_default="pending")  # pending, downloading, installing, completed, failed
    output = Column(Text, default="", server_default="")
    return_code = Column(Integer, nullable=True)
    created_by = Column(String(255), default="", server_default="")
    created_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime, nullable=True)
"""User model"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from v2.database import Base


class User(Base):
    __tablename__ = "auth_user"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(150), unique=True, nullable=False, index=True)
    email = Column(String(254), default="", server_default="")
    first_name = Column(String(150), default="", server_default="")
    last_name = Column(String(150), default="", server_default="")
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, server_default="true")
    is_staff = Column(Boolean, default=False, server_default="false")
    is_superuser = Column(Boolean, default=False, server_default="false")
    last_login = Column(DateTime, nullable=True)
    date_joined = Column(DateTime, server_default=func.now())
    totp_key = Column(String(255), default="", server_default="")
    block_dashboard_login = Column(Boolean, default=False, server_default="false")
    role_id = Column(Integer, ForeignKey("accounts_role.id"), nullable=True)

    role = relationship("Role", back_populates="users")

    def set_password(self, password: str):
        from passlib.context import CryptContext
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        self.password_hash = pwd_context.hash(password)

    def check_password(self, password: str) -> bool:
        from passlib.context import CryptContext
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        return pwd_context.verify(password, self.password_hash)

    def has_mfa(self) -> bool:
        return bool(self.totp_key and len(self.totp_key) > 5)


class Role(Base):
    __tablename__ = "accounts_role"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    is_superuser = Column(Boolean, default=False, server_default="false")

    # Agent permissions
    can_view_agent = Column(Boolean, default=False, server_default="false")
    can_edit_agent = Column(Boolean, default=False, server_default="false")
    can_delete_agent = Column(Boolean, default=False, server_default="false")
    can_deploy_agent = Column(Boolean, default=False, server_default="false")
    can_run_scripts_agent = Column(Boolean, default=False, server_default="false")

    # Client permissions
    can_view_client = Column(Boolean, default=False, server_default="false")
    can_edit_client = Column(Boolean, default=False, server_default="false")
    can_delete_client = Column(Boolean, default=False, server_default="false")

    # Check permissions
    can_view_checks = Column(Boolean, default=False, server_default="false")
    can_edit_checks = Column(Boolean, default=False, server_default="false")
    can_delete_checks = Column(Boolean, default=False, server_default="false")
    can_run_checks = Column(Boolean, default=False, server_default="false")

    # Script permissions
    can_view_scripts = Column(Boolean, default=False, server_default="false")
    can_edit_scripts = Column(Boolean, default=False, server_default="false")
    can_delete_scripts = Column(Boolean, default=False, server_default="false")
    can_run_scripts = Column(Boolean, default=False, server_default="false")

    # Alert permissions
    can_view_alerts = Column(Boolean, default=False, server_default="false")
    can_edit_alerts = Column(Boolean, default=False, server_default="false")
    can_delete_alerts = Column(Boolean, default=False, server_default="false")

    # Admin permissions
    can_view_admin = Column(Boolean, default=False, server_default="false")
    can_edit_admin = Column(Boolean, default=False, server_default="false")
    can_delete_admin = Column(Boolean, default=False, server_default="false")

    users = relationship("User", back_populates="role")
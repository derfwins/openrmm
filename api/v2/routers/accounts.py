"""Accounts endpoints - Users and Roles"""
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from v2.database import get_db
from v2.models.user import User, Role
from v2.auth import get_current_user, hash_password, verify_password

router = APIRouter(prefix="/accounts")


# === Schemas ===

class UserCreate(BaseModel):
    username: str
    email: str = ""
    password: str
    first_name: str = ""
    last_name: str = ""
    role: Optional[int] = None


class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None
    role: Optional[int] = None
    block_dashboard_login: Optional[bool] = None


class PasswordReset(BaseModel):
    id: int
    password: str


class TOTPReset(BaseModel):
    id: int


class RoleCreate(BaseModel):
    name: str
    is_superuser: bool = False
    can_view_agent: bool = False
    can_edit_agent: bool = False
    can_delete_agent: bool = False
    can_deploy_agent: bool = False
    can_run_scripts_agent: bool = False
    can_view_client: bool = False
    can_edit_client: bool = False
    can_delete_client: bool = False
    can_view_checks: bool = False
    can_edit_checks: bool = False
    can_delete_checks: bool = False
    can_run_checks: bool = False
    can_view_scripts: bool = False
    can_edit_scripts: bool = False
    can_delete_scripts: bool = False
    can_run_scripts: bool = False
    can_view_alerts: bool = False
    can_edit_alerts: bool = False
    can_delete_alerts: bool = False
    can_view_admin: bool = False
    can_edit_admin: bool = False
    can_delete_admin: bool = False


# === Users ===

@router.get("/users/")
async def list_users(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User))
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "is_active": u.is_active,
            "is_superuser": u.is_superuser,
            "last_login": u.last_login.isoformat() if u.last_login else None,
            "role": u.role_id,
            "block_dashboard_login": u.block_dashboard_login,
        }
        for u in users
    ]


@router.post("/users/")
async def create_user(req: UserCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Check if username exists
    existing = await db.execute(select(User).where(User.username == req.username))
    if existing.scalar_one_or_none():
        raise HTTPException(400, detail="Username already exists")

    new_user = User(
        username=req.username,
        email=req.email,
        first_name=req.first_name,
        last_name=req.last_name,
        role_id=req.role,
        is_active=True,
    )
    new_user.set_password(req.password)
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user.username


@router.get("/{pk}/users/")
async def get_user(pk: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == pk))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(404, detail="User not found")
    return {
        "id": u.id, "username": u.username, "email": u.email,
        "first_name": u.first_name, "last_name": u.last_name,
        "is_active": u.is_active, "is_superuser": u.is_superuser,
        "last_login": u.last_login.isoformat() if u.last_login else None,
        "role": u.role_id, "block_dashboard_login": u.block_dashboard_login,
    }


@router.put("/{pk}/users/")
async def update_user(pk: int, req: UserUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if user.id == pk and user.is_superuser:
        pass  # Allow superusers to edit themselves via admin panel
    result = await db.execute(select(User).where(User.id == pk))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(404, detail="User not found")
    if target.is_superuser and not user.is_superuser:
        raise HTTPException(403, detail="The root user cannot be modified from the UI")

    update_data = req.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key == "role":
            setattr(target, "role_id", value)
        else:
            setattr(target, key, value)

    await db.commit()
    return "ok"


@router.delete("/{pk}/users/")
async def delete_user(pk: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if user.id == pk:
        raise HTTPException(400, detail="Cannot delete yourself")
    result = await db.execute(select(User).where(User.id == pk))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(404, detail="User not found")
    if target.is_superuser:
        raise HTTPException(403, detail="The root user cannot be deleted from the UI")
    await db.delete(target)
    await db.commit()
    return "ok"


# === Password & MFA ===

@router.post("/users/reset/")
async def reset_password(req: PasswordReset, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == req.id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(404, detail="User not found")
    target.set_password(req.password)
    await db.commit()
    return "ok"


@router.put("/users/reset_totp/")
async def reset_totp(req: TOTPReset, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == req.id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(404, detail="User not found")
    target.totp_key = ""
    await db.commit()
    return "ok"


@router.post("/users/setup_totp/")
async def setup_totp(req: TOTPReset, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    import pyotp
    result = await db.execute(select(User).where(User.id == req.id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(404, detail="User not found")
    secret = pyotp.random_base32()
    target.totp_key = secret
    await db.commit()
    # Return the provisioning URI for QR code
    uri = pyotp.totp.TOTP(secret).provisioning_uri(name=target.username, issuer_name="OpenRMM")
    return {"secret": secret, "uri": uri}


# === Roles ===

@router.get("/roles/")
async def list_roles(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Role))
    roles = result.scalars().all()
    return [
        {
            "id": r.id, "name": r.name, "is_superuser": r.is_superuser,
            "can_view_agent": r.can_view_agent, "can_edit_agent": r.can_edit_agent,
            "can_delete_agent": r.can_delete_agent, "can_deploy_agent": r.can_deploy_agent,
            "can_run_scripts_agent": r.can_run_scripts_agent,
            "can_view_client": r.can_view_client, "can_edit_client": r.can_edit_client,
            "can_delete_client": r.can_delete_client,
            "can_view_checks": r.can_view_checks, "can_edit_checks": r.can_edit_checks,
            "can_delete_checks": r.can_delete_checks, "can_run_checks": r.can_run_checks,
            "can_view_scripts": r.can_view_scripts, "can_edit_scripts": r.can_edit_scripts,
            "can_delete_scripts": r.can_delete_scripts, "can_run_scripts": r.can_run_scripts,
            "can_view_alerts": r.can_view_alerts, "can_edit_alerts": r.can_edit_alerts,
            "can_delete_alerts": r.can_delete_alerts,
            "can_view_admin": r.can_view_admin, "can_edit_admin": r.can_edit_admin,
            "can_delete_admin": r.can_delete_admin,
        }
        for r in roles
    ]


@router.post("/roles/")
async def create_role(req: RoleCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    role = Role(**req.model_dump())
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return role.name


@router.put("/roles/{pk}/")
async def update_role(pk: int, req: RoleCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Role).where(Role.id == pk))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(404, detail="Role not found")
    for key, value in req.model_dump().items():
        setattr(role, key, value)
    await db.commit()
    return "ok"


@router.delete("/roles/{pk}/")
async def delete_role(pk: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Role).where(Role.id == pk))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(404, detail="Role not found")
    await db.delete(role)
    await db.commit()
    return "ok"
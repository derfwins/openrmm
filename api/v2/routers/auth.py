from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from v2.database import get_db
from v2.models.user import User, Role
from v2.config import settings
from v2.auth import create_access_token, get_current_user

router = APIRouter()


class CheckCredsRequest(BaseModel):
    username: str


class LoginRequest(BaseModel):
    username: str
    password: str = ""
    twofactor: str = ""


class TokenResponse(BaseModel):
    token: str
    expiry: str
    totp: bool = False


@router.post("/checkcreds/")
async def check_credentials(req: CheckCredsRequest, db: AsyncSession = Depends(get_db)):
    """Step 1: Verify credentials. If user has no MFA, return token directly."""
    result = await db.execute(select(User).where(User.username == req.username))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(status_code=400, detail="Bad credentials")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    if user.block_dashboard_login:
        raise HTTPException(status_code=403, detail="Login blocked")

    # No MFA — return token directly
    if not user.has_mfa():
        user.last_login = datetime.now(timezone.utc)
        await db.commit()
        expiry = datetime.now(timezone.utc).isoformat()
        token = create_access_token({"sub": str(user.id), "username": user.username})
        return {"token": token, "expiry": expiry, "totp": False}

    # Has MFA — need second step
    return {"totp": True, "username": user.username}


@router.post("/login/")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Full login with password verification and optional 2FA."""
    result = await db.execute(select(User).where(User.username == req.username))
    user = result.scalar_one_or_none()

    if user is None or not user.check_password(req.password):
        raise HTTPException(status_code=400, detail="Bad credentials")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    if user.block_dashboard_login:
        raise HTTPException(status_code=403, detail="Login blocked")

    # If user has MFA, verify TOTP code
    if user.has_mfa():
        import pyotp
        totp = pyotp.TOTP(user.totp_key)
        if not totp.verify(req.twofactor, valid_window=1):
            # In debug mode, accept "sekret" as bypass
            if not (settings.DEBUG and req.twofactor == "sekret"):
                raise HTTPException(status_code=400, detail="Invalid 2FA code")

    # Update last login
    user.last_login = datetime.now(timezone.utc)
    # Audit log
    from v2.audit import log_action
    await log_action(db, username=req.username, action="login", resource_type="user", description=f"User {req.username} logged in")
    await db.commit()

    expiry = datetime.now(timezone.utc).isoformat()
    token = create_access_token({"sub": str(user.id), "username": user.username})
    return {"token": token, "expiry": expiry, "totp": user.has_mfa()}


@router.get("/me/")
async def get_me(user: User = Depends(get_current_user)):
    """Get current user info."""
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "is_active": user.is_active,
        "is_superuser": user.is_superuser,
        "role": user.role_id,
    }
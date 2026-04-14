"""Core settings endpoints"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional

from v2.database import get_db
from v2.models.user import User
from v2.models.settings import CoreSettings
from v2.auth import get_current_user

router = APIRouter(prefix="/core")


# === All settings fields as a schema ===

class SettingsUpdate(BaseModel):
    company_name: Optional[str] = None
    timezone: Optional[str] = None
    date_format: Optional[str] = None
    agent_auto_update: Optional[bool] = None
    api_url: Optional[str] = None
    frontend_url: Optional[str] = None
    mesh_site: Optional[str] = None
    mesh_username: Optional[str] = None
    mesh_token_key: Optional[str] = None
    mesh_device_group: Optional[str] = None
    mesh_sync: Optional[bool] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from: Optional[str] = None
    smtp_use_tls: Optional[bool] = None
    alert_warning: Optional[bool] = None
    alert_info: Optional[bool] = None
    server_scripts: Optional[bool] = None
    web_terminal: Optional[bool] = None
    enable_sso: Optional[bool] = None
    debug_level: Optional[int] = None
    data_retention_days: Optional[int] = None
    openai_api_key: Optional[str] = None
    ai_model: Optional[str] = None


@router.get("/settings/")
async def get_settings(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CoreSettings))
    settings = result.scalar_one_or_none()
    if not settings:
        # Auto-create default settings
        settings = CoreSettings()
        db.add(settings)
        await db.commit()
        await db.refresh(settings)

    return {
        "id": settings.id,
        "company_name": settings.company_name,
        "timezone": settings.timezone,
        "date_format": settings.date_format,
        "agent_auto_update": settings.agent_auto_update,
        "api_url": settings.api_url,
        "frontend_url": settings.frontend_url,
        "mesh_site": settings.mesh_site,
        "mesh_username": settings.mesh_username,
        "mesh_token_key": settings.mesh_token_key,
        "mesh_device_group": settings.mesh_device_group,
        "mesh_sync": settings.mesh_sync,
        "smtp_host": settings.smtp_host,
        "smtp_port": settings.smtp_port,
        "smtp_username": settings.smtp_username,
        "smtp_password": settings.smtp_password,
        "smtp_from": settings.smtp_from,
        "smtp_use_tls": settings.smtp_use_tls,
        "alert_warning": settings.alert_warning,
        "alert_info": settings.alert_info,
        "server_scripts": settings.server_scripts,
        "web_terminal": settings.web_terminal,
        "enable_sso": settings.enable_sso,
        "debug_level": settings.debug_level,
        "data_retention_days": settings.data_retention_days,
        "openai_api_key": settings.openai_api_key,
        "ai_model": settings.ai_model,
    }


@router.put("/settings/")
async def update_settings(req: SettingsUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CoreSettings))
    settings = result.scalar_one_or_none()
    if not settings:
        settings = CoreSettings()
        db.add(settings)
        await db.flush()

    for key, value in req.model_dump(exclude_unset=True).items():
        setattr(settings, key, value)

    await db.commit()
    return "ok"
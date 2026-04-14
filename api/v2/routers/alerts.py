"""Alerts endpoints"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional

from v2.database import get_db
from v2.models.user import User
from v2.models.alert import Alert
from v2.auth import get_current_user

router = APIRouter(prefix="/alerts")


class AlertCreate(BaseModel):
    agent_id: Optional[int] = None
    alert_type: str  # warning, info, critical
    message: str
    source: str = "system"


class AlertUpdate(BaseModel):
    is_resolved: Optional[bool] = None


@router.get("/")
async def list_alerts(
    resolved: Optional[bool] = None,
    alert_type: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Alert).order_by(Alert.created_at.desc())
    if resolved is not None:
        query = query.where(Alert.is_resolved == resolved)
    if alert_type:
        query = query.where(Alert.alert_type == alert_type)
    result = await db.execute(query)
    alerts = result.scalars().all()
    return [
        {
            "id": a.id, "agent_id": a.agent_id, "alert_type": a.alert_type,
            "message": a.message, "is_resolved": a.is_resolved,
            "resolved_at": a.resolved_at.isoformat() if a.resolved_at else None,
            "source": a.source,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in alerts
    ]


@router.post("/")
async def create_alert(req: AlertCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    alert = Alert(
        agent_id=req.agent_id, alert_type=req.alert_type,
        message=req.message, source=req.source,
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    return {"id": alert.id, "alert_type": alert.alert_type, "message": alert.message}


@router.put("/{pk}/")
async def update_alert(pk: int, req: AlertUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Alert).where(Alert.id == pk))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(404, detail="Alert not found")
    for key, value in req.model_dump(exclude_unset=True).items():
        setattr(alert, key, value)
    if req.is_resolved:
        from datetime import datetime, timezone
        alert.resolved_at = datetime.now(timezone.utc)
    await db.commit()
    return "ok"


@router.delete("/{pk}/")
async def delete_alert(pk: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Alert).where(Alert.id == pk))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(404, detail="Alert not found")
    await db.delete(alert)
    await db.commit()
    return "ok"


@router.post("/resolve_all/")
async def resolve_all_alerts(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from datetime import datetime, timezone
    await db.execute(
        update(Alert).where(Alert.is_resolved == False).values(is_resolved=True, resolved_at=datetime.now(timezone.utc))
    )
    await db.commit()
    return "ok"
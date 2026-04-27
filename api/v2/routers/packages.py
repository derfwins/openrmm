"""Package management endpoints — delegates to script router agent WS connections."""
import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from v2.database import get_db
from v2.models.user import User
from v2.models.package import PackageExecution
from v2.routers.auth import get_current_user
from v2.routers.scripts import (
    PackageSearchRequest,
    PackageInstallRequest,
    PackageUninstallRequest,
    PackageListRequest,
    agent_connections,
)

router = APIRouter(prefix="/packages")


@router.post("/search/")
async def search_packages(req: PackageSearchRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Forward a package search request to an agent."""
    ws = agent_connections.get(req.agent_id)
    if ws is None:
        raise HTTPException(400, detail="Agent offline")

    session_id = str(uuid.uuid4())
    try:
        await ws.send_json({
            "type": "package_search",
            "query": req.query,
            "manager": req.manager,
            "session_id": session_id,
        })
    except Exception:
        raise HTTPException(500, detail="Failed to send message to agent")

    return {"session_id": session_id, "agent_id": req.agent_id}


@router.post("/install/")
async def install_package(req: PackageInstallRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Forward a package install request to an agent."""
    ws = agent_connections.get(req.agent_id)
    if ws is None:
        raise HTTPException(400, detail="Agent offline")

    session_id = str(uuid.uuid4())
    execution = PackageExecution(
        package_id=None,
        agent_id=req.agent_id,
        session_id=session_id,
        status="pending",
        created_by=user.username,
    )
    db.add(execution)
    await db.commit()

    try:
        await ws.send_json({
            "type": "package_install",
            "package_id": req.package_id,
            "manager": req.manager,
            "install_args": req.install_args,
            "session_id": session_id,
        })
    except Exception:
        execution.status = "failed"
        execution.output = "Failed to dispatch via WebSocket"
        execution.completed_at = datetime.utcnow()
        await db.commit()
        raise HTTPException(500, detail="Failed to send message to agent")

    return {"session_id": session_id, "agent_id": req.agent_id}


@router.post("/uninstall/")
async def uninstall_package(req: PackageUninstallRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Forward a package uninstall request to an agent."""
    ws = agent_connections.get(req.agent_id)
    if ws is None:
        raise HTTPException(400, detail="Agent offline")

    session_id = str(uuid.uuid4())
    try:
        await ws.send_json({
            "type": "package_uninstall",
            "package_id": req.package_id,
            "manager": req.manager,
            "session_id": session_id,
        })
    except Exception:
        raise HTTPException(500, detail="Failed to send message to agent")

    return {"session_id": session_id, "agent_id": req.agent_id}


@router.post("/list/")
async def list_packages(req: PackageListRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Forward a list installed packages request to an agent."""
    ws = agent_connections.get(req.agent_id)
    if ws is None:
        raise HTTPException(400, detail="Agent offline")

    session_id = str(uuid.uuid4())
    try:
        await ws.send_json({
            "type": "package_list",
            "manager": req.manager,
            "session_id": session_id,
        })
    except Exception:
        raise HTTPException(500, detail="Failed to send message to agent")

    return {"session_id": session_id, "agent_id": req.agent_id}
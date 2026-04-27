"""Package management endpoints — synchronously waits for agent response."""
import uuid
import asyncio
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

# In-memory pending futures: session_id -> asyncio.Future
package_futures: dict[str, asyncio.Future] = {}


async def _send_and_wait(agent_id: str, message: dict, timeout: float = 60.0) -> dict:
    """Send a WS message to agent and wait for the response Future to resolve."""
    ws = agent_connections.get(agent_id)
    if ws is None:
        raise HTTPException(400, detail="Agent offline")

    session_id = str(uuid.uuid4())
    message["session_id"] = session_id

    loop = asyncio.get_event_loop()
    future = loop.create_future()
    package_futures[session_id] = future

    try:
        await ws.send_json(message)
    except Exception:
        package_futures.pop(session_id, None)
        raise HTTPException(500, detail="Failed to send message to agent")

    try:
        result = await asyncio.wait_for(future, timeout=timeout)
        return result
    except asyncio.TimeoutError:
        package_futures.pop(session_id, None)
        raise HTTPException(504, detail="Agent did not respond in time")
    except Exception as e:
        package_futures.pop(session_id, None)
        raise HTTPException(500, detail=f"Error waiting for agent: {str(e)}")


@router.post("/search/")
async def search_packages(req: PackageSearchRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Forward a package search request to an agent and wait for results."""
    return await _send_and_wait(
        req.agent_id,
        {"type": "package_search", "query": req.query, "manager": req.manager},
        timeout=60.0,
    )


@router.post("/install/")
async def install_package(req: PackageInstallRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Forward a package install request to an agent and wait for result."""
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

    result = await _send_and_wait(
        req.agent_id,
        {"type": "package_install", "package_id": req.package_id, "manager": req.manager, "install_args": req.install_args},
        timeout=300.0,
    )

    # Update execution record
    execution.status = "completed" if result.get("success") else "failed"
    execution.output = result.get("output", "")[:50000]
    execution.completed_at = datetime.utcnow()
    await db.commit()

    return result


@router.post("/uninstall/")
async def uninstall_package(req: PackageUninstallRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Forward a package uninstall request to an agent and wait for result."""
    return await _send_and_wait(
        req.agent_id,
        {"type": "package_uninstall", "package_id": req.package_id, "manager": req.manager},
        timeout=300.0,
    )


@router.post("/list/")
async def list_packages(req: PackageListRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Forward a list installed packages request to an agent and wait for results."""
    return await _send_and_wait(
        req.agent_id,
        {"type": "package_list", "manager": req.manager},
        timeout=60.0,
    )



from pydantic import BaseModel

class ChocolateyInstallRequest(BaseModel):
    agent_id: str

@router.post("/chocolatey-install/")
async def install_chocolatey(req: ChocolateyInstallRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Install Chocolatey on an agent."""
    return await _send_and_wait(
        req.agent_id,
        {"type": "chocolatey_install"},
        timeout=180.0,
    )

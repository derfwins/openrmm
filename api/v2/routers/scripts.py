"""Scripts endpoints"""
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional, List

from v2.database import get_db
from v2.models.user import User
from v2.models.script import Script, ScriptExecution
from v2.models.package import Package, PackageExecution
from v2.auth import get_current_user
from v2.routers.ws_state import agent_connections

router = APIRouter(prefix="/scripts")


class ScriptCreate(BaseModel):
    name: str
    description: str = ""
    script_type: str = "powershell"  # powershell, bash, python
    category: str = "custom"
    script_body: str = ""
    args: str = ""
    shell: str = "powershell"
    timeout: int = 300


class ScriptUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    script_type: Optional[str] = None
    category: Optional[str] = None
    script_body: Optional[str] = None
    args: Optional[str] = None
    shell: Optional[str] = None
    timeout: Optional[int] = None
    is_active: Optional[bool] = None


class ScriptRunRequest(BaseModel):
    agent_ids: List[str]
    shell: Optional[str] = None
    args: Optional[str] = None


class AdhocScriptRequest(BaseModel):
    agent_ids: List[str]
    script_body: str
    shell: str = "powershell"
    args: str = ""


class PackageSearchRequest(BaseModel):
    agent_id: str
    query: str
    manager: str = "winget"


class PackageInstallRequest(BaseModel):
    agent_id: str
    package_id: str
    manager: str = "winget"
    install_args: str = ""


class PackageUninstallRequest(BaseModel):
    agent_id: str
    package_id: str
    manager: str = "winget"


class PackageListRequest(BaseModel):
    agent_id: str
    manager: str = "winget"


@router.get("/")
async def list_scripts(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Script))
    scripts = result.scalars().all()
    return [
        {
            "id": s.id, "name": s.name, "description": s.description,
            "script_type": s.script_type, "category": s.category,
            "shell": s.shell, "timeout": s.timeout,
            "is_active": s.is_active, "created_by": s.created_by,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        }
        for s in scripts
    ]


@router.post("/")
async def create_script(req: ScriptCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    script = Script(
        name=req.name, description=req.description, script_type=req.script_type,
        category=req.category, script_body=req.script_body, args=req.args,
        shell=req.shell, timeout=req.timeout, created_by=user.username,
    )
    db.add(script)
    await db.commit()
    await db.refresh(script)
    return {"id": script.id, "name": script.name}


@router.get("/{pk}/")
async def get_script(pk: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Script).where(Script.id == pk))
    script = result.scalar_one_or_none()
    if not script:
        raise HTTPException(404, detail="Script not found")
    return {
        "id": script.id, "name": script.name, "description": script.description,
        "script_type": script.script_type, "category": script.category,
        "script_body": script.script_body, "args": script.args,
        "shell": script.shell, "timeout": script.timeout,
        "is_active": script.is_active, "created_by": script.created_by,
        "created_at": script.created_at.isoformat() if script.created_at else None,
        "updated_at": script.updated_at.isoformat() if script.updated_at else None,
    }


@router.put("/{pk}/")
async def update_script(pk: int, req: ScriptUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Script).where(Script.id == pk))
    script = result.scalar_one_or_none()
    if not script:
        raise HTTPException(404, detail="Script not found")
    for key, value in req.model_dump(exclude_unset=True).items():
        setattr(script, key, value)
    await db.commit()
    return "ok"


@router.delete("/{pk}/")
async def delete_script(pk: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Script).where(Script.id == pk))
    script = result.scalar_one_or_none()
    if not script:
        raise HTTPException(404, detail="Script not found")
    await db.delete(script)
    await db.commit()
    return "ok"


# ── Script Execution Endpoints ──────────────────────────────────────────────

@router.post("/{pk}/run/")
async def run_script(pk: int, req: ScriptRunRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Dispatch a saved script to one or more agents via WebSocket."""
    result = await db.execute(select(Script).where(Script.id == pk))
    script = result.scalar_one_or_none()
    if not script:
        raise HTTPException(404, detail="Script not found")

    shell = req.shell or script.shell
    dispatched = 0
    session_ids = []
    offline = []

    for agent_id in req.agent_ids:
        session_id = str(uuid.uuid4())
        execution = ScriptExecution(
            script_id=script.id,
            agent_id=agent_id,
            session_id=session_id,
            status="pending",
            created_by=user.username,
        )
        db.add(execution)

        ws = agent_connections.get(agent_id)
        if ws is None:
            execution.status = "failed"
            execution.output = "Agent offline"
            execution.completed_at = datetime.utcnow()
            offline.append(agent_id)
        else:
            try:
                await ws.send_json({
                    "type": "run_script",
                    "script_body": script.script_body,
                    "shell": shell,
                    "session_id": session_id,
                    "script_id": script.id,
                })
                dispatched += 1
            except Exception:
                execution.status = "failed"
                execution.output = "Failed to dispatch via WebSocket"
                execution.completed_at = datetime.utcnow()
                offline.append(agent_id)

        session_ids.append(session_id)

    await db.commit()
    return {"dispatched": dispatched, "session_ids": session_ids, "offline": offline}


@router.post("/run-adhoc/")
async def run_adhoc_script(req: AdhocScriptRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Run an ad-hoc script (not saved) on agents."""
    dispatched = 0
    session_ids = []
    offline = []

    for agent_id in req.agent_ids:
        session_id = str(uuid.uuid4())
        execution = ScriptExecution(
            script_id=None,
            agent_id=agent_id,
            session_id=session_id,
            status="pending",
            created_by=user.username,
        )
        db.add(execution)

        ws = agent_connections.get(agent_id)
        if ws is None:
            execution.status = "failed"
            execution.output = "Agent offline"
            execution.completed_at = datetime.utcnow()
            offline.append(agent_id)
        else:
            try:
                await ws.send_json({
                    "type": "run_script",
                    "script_body": req.script_body,
                    "shell": req.shell,
                    "session_id": session_id,
                    "script_id": None,
                })
                dispatched += 1
            except Exception:
                execution.status = "failed"
                execution.output = "Failed to dispatch via WebSocket"
                execution.completed_at = datetime.utcnow()
                offline.append(agent_id)

        session_ids.append(session_id)

    await db.commit()
    return {"dispatched": dispatched, "session_ids": session_ids, "offline": offline}


@router.get("/executions/")
async def list_executions(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """List recent script executions with results."""
    result = await db.execute(
        select(ScriptExecution).order_by(desc(ScriptExecution.created_at)).limit(100)
    )
    executions = result.scalars().all()
    return [
        {
            "id": e.id,
            "script_id": e.script_id,
            "agent_id": e.agent_id,
            "session_id": e.session_id,
            "status": e.status,
            "output": e.output,
            "return_code": e.return_code,
            "started_at": e.started_at.isoformat() if e.started_at else None,
            "completed_at": e.completed_at.isoformat() if e.completed_at else None,
            "created_by": e.created_by,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in executions
    ]


@router.get("/executions/{session_id}/")
async def get_execution(session_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Get a specific execution result by session_id."""
    result = await db.execute(
        select(ScriptExecution).where(ScriptExecution.session_id == session_id)
    )
    execution = result.scalar_one_or_none()
    if not execution:
        raise HTTPException(404, detail="Execution not found")
    return {
        "id": execution.id,
        "script_id": execution.script_id,
        "agent_id": execution.agent_id,
        "session_id": execution.session_id,
        "status": execution.status,
        "output": execution.output,
        "return_code": execution.return_code,
        "started_at": execution.started_at.isoformat() if execution.started_at else None,
        "completed_at": execution.completed_at.isoformat() if execution.completed_at else None,
        "created_by": execution.created_by,
        "created_at": execution.created_at.isoformat() if execution.created_at else None,
    }


# ── Package Management Endpoints (proxy to agent) ──────────────────────────

@router.post("/packages/search/")
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


@router.post("/packages/install/")
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


@router.post("/packages/uninstall/")
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


@router.post("/packages/list/")
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
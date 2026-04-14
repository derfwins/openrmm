"""Scripts endpoints"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional

from v2.database import get_db
from v2.models.user import User
from v2.models.script import Script
from v2.auth import get_current_user

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
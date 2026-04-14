"""Agents endpoints"""
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from v2.database import get_db
from v2.models.user import User
from v2.models.agent import Agent, Check
from v2.models.client import Site
from v2.auth import get_current_user
from v2.config import settings

router = APIRouter(prefix="/agents")


class InstallerRequest(BaseModel):
    plat: str = "windows"      # windows, linux, darwin
    goarch: str = "amd64"      # amd64, arm64
    client: int
    site: int
    expires: str = ""
    installMethod: str = "powershell"
    api: str = ""
    agenttype: str = "server"  # server, workstation
    power: bool = False
    rdp: bool = False
    ping: bool = True
    fileName: str = "install"


@router.get("/")
async def list_agents(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Agent))
    agents = result.scalars().all()
    return [
        {
            "id": a.id, "hostname": a.hostname, "agent_id": a.agent_id,
            "site_id": a.site_id, "version": a.version,
            "plat": a.plat, "goarch": a.goarch,
            "status": a.status, "last_seen": a.last_seen.isoformat() if a.last_seen else None,
            "monitoring_type": a.monitoring_type, "description": a.description,
            "mesh_node_id": a.mesh_node_id,
            "is_maintenance": a.is_maintenance,
            "cpu_model": a.cpu_model, "cpu_cores": a.cpu_cores,
            "total_ram": a.total_ram, "os_name": a.os_name,
            "os_version": a.os_version, "public_ip": a.public_ip,
            "local_ip": a.local_ip, "logged_in_user": a.logged_in_user,
        }
        for a in agents
    ]


@router.post("/installer/")
async def generate_installer(
    req: InstallerRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate agent install script."""
    # Verify site exists and belongs to client
    result = await db.execute(select(Site).where(Site.id == req.site, Site.client_id == req.client))
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(404, detail="Site not found for this client")

    api_url = req.api or f"https://{settings.mesh_site.replace('http://', '').replace('https://', '')}"

    if req.plat == "windows":
        # PowerShell install script
        script = f"""# OpenRMM Agent Installer
$ErrorActionPreference = "Stop"
$apiUrl = "{api_url}"
$clientId = {req.client}
$siteId = {req.site}
$agentType = "{req.agenttype}"

Write-Host "Installing OpenRMM Agent..." -ForegroundColor Cyan
Write-Host "API: $apiUrl"
Write-Host "Client: $clientId | Site: $siteId"
Write-Host "Type: $agentType"
Write-Host ""
Write-Host "Agent binary download not yet available." -ForegroundColor Yellow
Write-Host "The agent service is still under development."
Write-Host "Once available, this script will download and install the agent automatically."
"""
        return script, 200, {"Content-Type": "text/plain; charset=utf-8"}
    else:
        # Bash install script
        script = f"""#!/bin/bash
# OpenRMM Agent Installer
API_URL="{api_url}"
CLIENT_ID={req.client}
SITE_ID={req.site}
AGENT_TYPE="{req.agenttype}"

echo "Installing OpenRMM Agent..."
echo "API: $API_URL"
echo "Client: $CLIENT_ID | Site: $SITE_ID"
echo "Type: $AGENT_TYPE"
echo ""
echo "Agent binary download not yet available."
echo "The agent service is still under development."
"""
        return script, 200, {"Content-Type": "text/plain; charset=utf-8"}


# === Agent Heartbeat (for future agent binary) ===

class HeartbeatRequest(BaseModel):
    agent_id: str
    hostname: str = ""
    version: str = ""
    operating_system: str = ""
    plat: str = ""
    goarch: str = ""
    cpu_model: str = ""
    cpu_cores: int = 0
    total_ram: float = 0
    os_name: str = ""
    os_version: str = ""
    public_ip: str = ""
    local_ip: str = ""
    logged_in_user: str = ""


@router.post("/heartbeat/")
async def agent_heartbeat(req: HeartbeatRequest, db: AsyncSession = Depends(get_db)):
    """Agent heartbeat — registers or updates an agent."""
    result = await db.execute(select(Agent).where(Agent.agent_id == req.agent_id))
    agent = result.scalar_one_or_none()

    if not agent:
        # Auto-register new agent
        agent = Agent(
            agent_id=req.agent_id,
            hostname=req.hostname or req.agent_id,
            status="online",
            first_seen=datetime.now(timezone.utc),
        )
        db.add(agent)
    else:
        agent.status = "online"

    # Update fields
    now = datetime.now(timezone.utc)
    agent.last_seen = now
    agent.last_heartbeat = now
    for field in ["hostname", "version", "operating_system", "plat", "goarch",
                   "cpu_model", "cpu_cores", "total_ram", "os_name", "os_version",
                   "public_ip", "local_ip", "logged_in_user"]:
        val = getattr(req, field, None)
        if val is not None:
            setattr(agent, field, val)

    await db.commit()
    return {"status": "ok"}
"""Agents endpoints"""
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional

from v2.database import get_db
from v2.models.user import User
from v2.models.agent import Agent, Check
from v2.models.client import Site
from v2.auth import get_current_user

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


def _build_windows_installer(api_url: str, client_id: int, site_id: int, agent_type: str) -> str:
    """Build PowerShell installer script using string concat to avoid f-string escaping hell."""
    lines = [
        "# OpenRMM Agent Installer for Windows",
        "# Run as Administrator in PowerShell",
        "",
        '$ErrorActionPreference = "Stop"',
        "",
        f'$Server = "{api_url}"',
        f"$ClientId = {client_id}",
        f"$SiteId = {site_id}",
        f'$AgentType = "{agent_type}"',
        "",
        'Write-Host "=== OpenRMM Agent Installer ===" -ForegroundColor Cyan',
        'Write-Host "Server: $Server"',
        'Write-Host "Client: $ClientId | Site: $SiteId | Type: $AgentType"',
        'Write-Host ""',
        "",
        "# Check admin",
        "$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)",
        'if (-not $isAdmin) { Write-Host "ERROR: Run as Administrator!" -ForegroundColor Red; exit 1 }',
        "",
        '$InstallDir = "C:\\Program Files\\OpenRMM"',
        "New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null",
        "",
        "# Check Python 3",
        "$pythonExe = $null",
        'foreach ($cmd in @("python", "python3", "py")) {',
        "    try {",
        "        $ver = & $cmd --version 2>&1",
        '        if ($ver -match "Python 3\\.") { $pythonExe = $cmd; break }',
        "    } catch {}",
        "}",
        "",
        "if (-not $pythonExe) {",
        '    Write-Host "Installing Python 3.12..." -ForegroundColor Yellow',
        '    $pyUrl = "https://www.python.org/ftp/python/3.12.4/python-3.12.4-amd64.exe"',
        '    $pyInstaller = "$env:TEMP\\python-installer.exe"',
        "    Invoke-WebRequest -Uri $pyUrl -OutFile $pyInstaller -UseBasicParsing",
        '    Start-Process -Wait -FilePath $pyInstaller -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1 Include_pip=1"',
        "    Remove-Item $pyInstaller -Force",
        '    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")',
        '    $pythonExe = "python"',
        "}",
        "",
        "# Verify Python works",
        "$pyVer = & $pythonExe --version 2>&1",
        'if ($pyVer -notmatch "Python 3\\.") { Write-Host "ERROR: Python 3 installation failed!" -ForegroundColor Red; exit 1 }',
        'Write-Host "Python: $pyVer" -ForegroundColor Green',
        "",
        "# Install psutil",
        'Write-Host "Installing dependencies..." -ForegroundColor Cyan',
        'Start-Process -Wait -FilePath $pythonExe -ArgumentList "-m pip install psutil websockets pywinpty mss av numpy --quiet" -WindowStyle Hidden',
        "",
        "# Download agent from server",
        '$AgentUrl = "$Server/agents/download/openrmm-agent.py"',
        'Write-Host "Downloading agent from: $AgentUrl" -ForegroundColor Cyan',
        'Invoke-WebRequest -Uri $AgentUrl -OutFile "$InstallDir\\openrmm-agent.py" -UseBasicParsing',
        "",
        "# Create launcher batch file",
        '$LaunchBat = "$InstallDir\\launch.bat"',
        '$BatContent = "@echo off" + [Environment]::NewLine + $pythonExe + " " + [char]34 + "$InstallDir\\openrmm-agent.py" + [char]34 + " --server $Server --client-id $ClientId --site-id $SiteId --agent-type $AgentType"',
        '[System.IO.File]::WriteAllText($LaunchBat, $BatContent)',
        "",
        "# Register scheduled task",
        '$TaskName = "OpenRMM-Agent"',
        "Unregister-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue",
        "$Action = New-ScheduledTaskAction -Execute $LaunchBat",
        "$Trigger = New-ScheduledTaskTrigger -AtStartup",
        "$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 999",
        '$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest',
        'Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description "OpenRMM Agent" | Out-Null',
        "Start-ScheduledTask -TaskName $TaskName",
        "",
        'Write-Host ""',
        'Write-Host "=== Agent Installed! ===" -ForegroundColor Green',
        'Write-Host "Dir: $InstallDir"',
        "Write-Host \"Service: Scheduled Task 'OpenRMM-Agent' (runs as SYSTEM)\"",
        'Write-Host "Log: $InstallDir\\agent.log"',
        "",
        "Write-Host \"To uninstall: Unregister-ScheduledTask -TaskName OpenRMM-Agent; Remove-Item '$InstallDir' -Recurse\"",
    ]
    return "\n".join(lines)


def _build_linux_installer(api_url: str, client_id: int, site_id: int, agent_type: str) -> str:
    """Build bash installer script."""
    lines = [
        "#!/bin/bash",
        "# OpenRMM Agent Installer for Linux/Mac",
        "# Run as root or with sudo",
        "set -e",
        "",
        f'SERVER="{api_url}"',
        f"CLIENT_ID={client_id}",
        f"SITE_ID={site_id}",
        f'AGENT_TYPE="{agent_type}"',
        "",
        'if [ "$EUID" -ne 0 ]; then echo "ERROR: Run with sudo!"; exit 1; fi',
        "",
        'echo "=== OpenRMM Agent Installer ==="',
        'echo "Server: $SERVER | Client: $CLIENT_ID | Site: $SITE_ID | Type: $AGENT_TYPE"',
        "",
        "# Check Python 3",
        'if ! command -v python3 &>/dev/null; then',
        '    echo "Installing Python 3..."',
        '    if command -v apt &>/dev/null; then apt update && apt install -y python3 python3-pip',
        '    elif command -v yum &>/dev/null; then yum install -y python3 python3-pip',
        '    elif command -v brew &>/dev/null; then brew install python3',
        '    else echo "ERROR: Install Python 3 manually"; exit 1',
        "    fi",
        "fi",
        "",
        "python3 -m pip install psutil --quiet 2>/dev/null || pip3 install psutil --quiet",
        "",
        'INSTALL_DIR="/opt/openrmm-agent"',
        "mkdir -p $INSTALL_DIR",
        "",
        "# Download agent",
        'AGENT_URL="$SERVER/agents/download/openrmm-agent.py"',
        'echo "Downloading agent from: $AGENT_URL"',
        'curl -sfL "$AGENT_URL" -o "$INSTALL_DIR/openrmm-agent.py" || wget -q "$AGENT_URL" -O "$INSTALL_DIR/openrmm-agent.py"',
        "",
        "# Create systemd service",
        "cat > /etc/systemd/system/openrmm-agent.service << EOF",
        "[Unit]",
        "Description=OpenRMM Monitoring Agent",
        "After=network-online.target",
        "Wants=network-online.target",
        "",
        "[Service]",
        "Type=simple",
        "ExecStart=/usr/bin/python3 $INSTALL_DIR/openrmm-agent.py --server $SERVER --client-id $CLIENT_ID --site-id $SITE_ID --agent-type $AGENT_TYPE",
        "WorkingDirectory=$INSTALL_DIR",
        "Restart=always",
        "RestartSec=10",
        "",
        "[Install]",
        "WantedBy=multi-user.target",
        "EOF",
        "",
        "systemctl daemon-reload",
        "systemctl enable openrmm-agent",
        "systemctl start openrmm-agent",
        "",
        'echo ""',
        'echo "=== Agent Installed! ==="',
        'echo "Dir: $INSTALL_DIR"',
        'echo "Service: openrmm-agent (systemd)"',
        'echo "Log: $INSTALL_DIR/agent.log"',
    ]
    return "\n".join(lines)


@router.get("/")
async def list_agents(
    client_id: Optional[int] = Query(None),
    site_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Agent)
    if site_id:
        stmt = stmt.where(Agent.site_id == site_id)
    elif client_id:
        # Get all site IDs for this client
        site_result = await db.execute(select(Site.id).where(Site.client_id == client_id))
        site_ids = [row[0] for row in site_result.all()]
        stmt = stmt.where((Agent.site_id.in_(site_ids)) | (Agent.site_id.is_(None)))
    result = await db.execute(stmt)
    agents = result.scalars().all()
    return [
        {
            "id": a.id, "hostname": a.hostname, "agent_id": a.agent_id,
            "site_id": a.site_id, "version": a.version,
            "plat": a.plat, "goarch": a.goarch,
            "status": a.status, "last_seen": a.last_seen.isoformat() if a.last_seen else None,
            "monitoring_type": a.monitoring_type, "description": a.description,
            "is_maintenance": a.is_maintenance,
            "cpu_model": a.cpu_model, "cpu_cores": a.cpu_cores,
            "total_ram": a.total_ram, "os_name": a.os_name,
            "os_version": a.os_version, "public_ip": a.public_ip,
            "local_ip": a.local_ip, "logged_in_user": a.logged_in_user,
        "mesh_node_id": a.mesh_node_id,
            "disks_json": a.disks_json, "memory_json": a.memory_json,
            "uptime_seconds": a.uptime_seconds, "logged_in_users": a.logged_in_users,
            "running_processes": a.running_processes, "cpu_percent": a.cpu_percent,
            "services_json": a.services_json,
        }
        for a in agents
    ]


@router.get("/{agent_id}/")
async def get_agent(
    agent_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single agent by agent_id (UUID) or database id."""
    # Try UUID first (agent_id field), then numeric id
    result = await db.execute(select(Agent).where(Agent.agent_id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        try:
            numeric_id = int(agent_id)
            result = await db.execute(select(Agent).where(Agent.id == numeric_id))
            agent = result.scalar_one_or_none()
        except ValueError:
            pass
    if not agent:
        raise HTTPException(404, detail="Agent not found")
    return {
        "id": agent.id, "hostname": agent.hostname, "agent_id": agent.agent_id,
        "site_id": agent.site_id, "version": agent.version,
        "plat": agent.plat, "goarch": agent.goarch,
        "status": agent.status, "last_seen": agent.last_seen.isoformat() if agent.last_seen else None,
        "monitoring_type": agent.monitoring_type, "description": agent.description,
        "is_maintenance": agent.is_maintenance,
        "cpu_model": agent.cpu_model, "cpu_cores": agent.cpu_cores,
        "total_ram": agent.total_ram, "os_name": agent.os_name,
        "os_version": agent.os_version, "public_ip": agent.public_ip,
        "local_ip": agent.local_ip, "logged_in_user": agent.logged_in_user,
        "mesh_node_id": agent.mesh_node_id,
        "disks_json": agent.disks_json, "memory_json": agent.memory_json,
        "uptime_seconds": agent.uptime_seconds, "logged_in_users": agent.logged_in_users,
        "running_processes": agent.running_processes, "cpu_percent": agent.cpu_percent,
        "services_json": agent.services_json,
    }


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

    api_url = req.api or ""

    if req.plat == "windows":
        script = _build_windows_installer(api_url, req.client, req.site, req.agenttype)
    else:
        script = _build_linux_installer(api_url, req.client, req.site, req.agenttype)

    return PlainTextResponse(script)


@router.get("/download/openrmm-agent.py")
async def download_agent():
    """Download the agent Python script."""
    import os
    # Try multiple possible locations
    possible_paths = [
        os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "agent", "openrmm-agent.py")),
        "/app/agent/openrmm-agent.py",
        "/opt/openrmm/agent/openrmm-agent.py",
    ]
    for agent_path in possible_paths:
        if os.path.exists(agent_path):
            from fastapi.responses import FileResponse
            return FileResponse(agent_path, media_type="text/x-python", filename="openrmm-agent.py")
    raise HTTPException(404, detail="Agent script not found on server")


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
    disks_json: str = ""
    memory_json: str = ""
    uptime_seconds: int = 0
    logged_in_users: str = ""
    running_processes: int = 0
    cpu_percent: float = 0
    services_json: str = ""
    mesh_node_id: str = ""


@router.post("/heartbeat/")
async def agent_heartbeat(req: HeartbeatRequest, db: AsyncSession = Depends(get_db)):
    """Agent heartbeat — registers or updates an agent."""
    result = await db.execute(select(Agent).where(Agent.agent_id == req.agent_id))
    agent = result.scalar_one_or_none()

    if not agent:
        # Check for existing agent with same hostname (prevent duplicates)
        hostname = req.hostname or req.agent_id
        host_result = await db.execute(select(Agent).where(Agent.hostname == hostname))
        existing = host_result.scalar_one_or_none()
        if existing:
            # Same machine re-registered with new agent_id — update the existing record
            logger.info(f"Agent {req.agent_id} matches existing hostname '{hostname}' (existing agent_id={existing.agent_id}), updating")
            existing.agent_id = req.agent_id
            existing.status = "online"
            agent = existing
        else:
            # Auto-register new agent
            agent = Agent(
                agent_id=req.agent_id,
                hostname=hostname,
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
                   "public_ip", "local_ip", "logged_in_user", "disks_json",
                   "memory_json", "uptime_seconds", "logged_in_users",
                   "running_processes", "cpu_percent", "services_json"]:
        val = getattr(req, field, None)
        if val is not None and val != "":
            setattr(agent, field, val)

    # Only update mesh_node_id if agent provides a non-empty value
    # (prevents overwriting correct DB value with empty string from older agents)
    mesh_val = getattr(req, "mesh_node_id", None)
    if mesh_val and "@" in mesh_val and "$" in mesh_val:
        agent.mesh_node_id = mesh_val

    await db.commit()

    # Auto-update: tell agent if newer version is available
    response = {"status": "ok"}
    try:
        import os
        agent_path = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "agent", "openrmm-agent.py"))
        if os.path.exists(agent_path):
            # Read version from the agent file
            with open(agent_path, "r") as f:
                for line in f:
                    if line.startswith("AGENT_VERSION"):
                        latest = line.split("=")[1].strip().strip('"').strip("'")
                        if latest != req.version:
                            response["update_available"] = latest
                        break
    except Exception:
        pass

    return response

@router.post("/{agent_id}/restart/")
async def restart_agent(agent_id: str):
    """Send restart command to agent via WebSocket."""
    from v2.routers.ws_state import agent_connections, lookup_agent_id
    agent_uuid = await lookup_agent_id(agent_id)
    if not agent_uuid:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent_ws = agent_connections.get(agent_uuid)
    if not agent_ws:
        raise HTTPException(status_code=503, detail="Agent not connected via WebSocket")
    try:
        await agent_ws.send_json({"type": "restart_agent"})
        return {"status": "ok", "message": "Restart command sent"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send restart: {e}")


@router.post("/{agent_id}/service/")
async def service_action(agent_id: str, action: str = Query(...), service_name: str = Query(...)):
    """Send service control command to agent via WebSocket."""
    from v2.routers.ws_state import agent_connections, lookup_agent_id
    agent_uuid = await lookup_agent_id(agent_id)
    if not agent_uuid:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent_ws = agent_connections.get(agent_uuid)
    if not agent_ws:
        raise HTTPException(status_code=503, detail="Agent not connected via WebSocket")
    if action not in ("start", "stop", "restart"):
        raise HTTPException(status_code=400, detail="Action must be start, stop, or restart")
    try:
        await agent_ws.send_json({"type": "service_action", "action": action, "service": service_name})
        return {"status": "ok", "message": f"Service {action} command sent for {service_name}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send service command: {e}")


@router.delete("/{agent_id}/")
async def delete_agent(
    agent_id: str,
    uninstall: bool = Query(False),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an agent from the database. Optionally send uninstall command first."""
    result = await db.execute(select(Agent).where(Agent.agent_id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        # Try numeric ID
        try:
            result = await db.execute(select(Agent).where(Agent.id == int(agent_id)))
            agent = result.scalar_one_or_none()
        except ValueError:
            pass
    if not agent:
        raise HTTPException(404, detail="Agent not found")

    # If uninstall requested, send uninstall command to agent via WebSocket
    if uninstall:
        from v2.routers.ws_state import agent_connections
        agent_ws = agent_connections.get(agent.agent_id)
        if agent_ws:
            try:
                await agent_ws.send_json({"type": "uninstall_agent"})
            except Exception:
                pass  # Best effort — agent may not be connected

    # Delete from database
    await db.delete(agent)
    await db.commit()
    return {"status": "ok", "message": "Agent deleted" + (" and uninstall command sent" if uninstall else "")}


@router.post("/run-command/")
async def run_command(
    command: str = Query(...),
    agent_id: str = Query(None),
    timeout: int = Query(60),
):
    """Run a command on an agent machine via WebSocket."""
    from v2.routers.ws_state import agent_connections, lookup_agent_id
    import time
    
    agent_uuid = None
    if agent_id:
        agent_uuid = await lookup_agent_id(agent_id)
    else:
        if agent_connections:
            agent_uuid = next(iter(agent_connections.keys()))
    
    if not agent_uuid:
        raise HTTPException(status_code=404, detail="Agent not found or not connected")
    
    agent_ws = agent_connections.get(agent_uuid)
    if not agent_ws:
        raise HTTPException(status_code=503, detail="Agent not connected via WebSocket")
    
    session_id = f"cmd_{int(time.time())}"
    
    try:
        await agent_ws.send_json({
            "type": "run_command",
            "command": command,
            "timeout": timeout,
            "session_id": session_id,
        })
        return {"status": "sent", "session_id": session_id, "command": command[:100]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send command: {e}")


class AgentUpdate(BaseModel):
    site_id: Optional[int] = None
    description: Optional[str] = None
    is_maintenance: Optional[bool] = None
    monitoring_type: Optional[str] = None
    rustdesk_id: Optional[str] = None


@router.patch("/{agent_id}/")
async def update_agent(
    agent_id: int,
    update: AgentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update agent properties (site assignment, description, etc.)."""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Update fields if provided
    if update.site_id is not None:
        agent.site_id = update.site_id
    if update.description is not None:
        agent.description = update.description
    if update.is_maintenance is not None:
        agent.is_maintenance = update.is_maintenance
    if update.monitoring_type is not None:
        agent.monitoring_type = update.monitoring_type
    if update.rustdesk_id is not None:
        agent.rustdesk_id = update.rustdesk_id
    
    await db.commit()
    await db.refresh(agent)
    
    return {"id": agent.id, "hostname": agent.hostname, "site_id": agent.site_id, "status": agent.status}


@router.patch("/{agent_id}/rustdesk-id/")
async def update_rustdesk_id(
    agent_id: str,
    rustdesk_id: str = Query(..., description="RustDesk peer ID to link"),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Link a RustDesk peer ID to an OpenRMM agent."""
    result = await db.execute(select(Agent).where(Agent.agent_id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        try:
            result = await db.execute(select(Agent).where(Agent.id == int(agent_id)))
            agent = result.scalar_one_or_none()
        except (ValueError, TypeError):
            pass
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    agent.rustdesk_id = rustdesk_id
    await db.commit()
    return {"status": "ok", "agent_id": agent_id, "rustdesk_id": rustdesk_id}

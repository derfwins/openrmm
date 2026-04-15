"""Agents endpoints"""
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

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

    api_url = req.api or ""

    if req.plat == "windows":
        # PowerShell install script - downloads agent files and sets up scheduled task
        script = f'''# OpenRMM Agent Installer for Windows
# Run as Administrator in PowerShell

$ErrorActionPreference = "Stop"
$Server = "{api_url}"
$ClientId = {req.client}
$SiteId = {req.site}
$AgentType = "{req.agenttype}"

Write-Host "=== OpenRMM Agent Installer ===" -ForegroundColor Cyan
Write-Host "Server: $Server"
Write-Host "Client: $ClientId | Site: $SiteId | Type: $AgentType"
Write-Host ""

# Check admin
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {{ Write-Host "ERROR: Run as Administrator!" -ForegroundColor Red; exit 1 }}

$InstallDir = "C:\Program Files\OpenRMM"
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

# Check Python 3
$pythonExe = $null
foreach ($cmd in @("python", "python3", "py")) {{
    try {{
        $ver = & $cmd --version 2>&1
        if ($ver -match "Python 3\.") {{ $pythonExe = $cmd; break }}
    }} catch {{}}
}}
if (-not $pythonExe) {{
    Write-Host "Installing Python 3.12..." -ForegroundColor Yellow
    $pyUrl = "https://www.python.org/ftp/python/3.12.4/python-3.12.4-amd64.exe"
    $pyInstaller = "$env:TEMP\python-installer.exe"
    Invoke-WebRequest -Uri $pyUrl -OutFile $pyInstaller -UseBasicParsing
    Start-Process -Wait -FilePath $pyInstaller -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1 Include_pip=1"
    Remove-Item $pyInstaller -Force
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    $pythonExe = "python"
}}

# Verify Python works
$pyVer = & $pythonExe --version 2>&1
if ($pyVer -notmatch "Python 3\.") {{ Write-Host "ERROR: Python 3 installation failed!" -ForegroundColor Red; exit 1 }}
Write-Host "Python: $pyVer" -ForegroundColor Green

# Install psutil
Write-Host "Installing dependencies..." -ForegroundColor Cyan
& $pythonExe -m pip install psutil --quiet

# Download agent script from server
$AgentUrl = "$Server/agents/download/openrmm-agent.py"
Write-Host "Downloading agent from: $AgentUrl" -ForegroundColor Cyan
try {{
    Invoke-WebRequest -Uri $AgentUrl -OutFile "$InstallDir\openrmm-agent.py" -UseBasicParsing
}} catch {{
    Write-Host "Download failed, creating agent script locally..." -ForegroundColor Yellow
    @"
#!/usr/bin/env python3
import json,os,platform,signal,socket,sys,time,uuid
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import URLError
AGENT_VERSION="0.1.0"
ID_FILE=Path(os.path.expanduser("~"))/".openrmm-agent-id"
running=True
backoff=1
def sig_handler(s,f):
    global running; running=False
signal.signal(signal.SIGINT,sig_handler)
signal.signal(signal.SIGTERM,sig_handler)
def get_id():
    if ID_FILE.exists(): return ID_FILE.read_text().strip()
    aid=str(uuid.uuid4()); ID_FILE.write_text(aid); return aid
def local_ip():
    try:
        s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.connect(("8.8.8.8",80)); r=s.getsockname()[0]; s.close(); return r
    except: return ""
def public_ip():
    for u in ["https://api.ipify.org","https://ifconfig.me"]:
        try: return urlopen(Request(u,headers={{"User-Agent":"openrmm-agent"}}),timeout=5).read().decode().strip()
        except: continue
    return ""
def sys_info():
    i={{"hostname":socket.gethostname(),"version":AGENT_VERSION,"operating_system":platform.system(),"plat":platform.system().lower(),"goarch":platform.machine(),"os_name":platform.system(),"os_version":platform.version(),"public_ip":public_ip(),"local_ip":local_ip(),"cpu_model":platform.processor(),"cpu_cores":0,"total_ram":0,"logged_in_user":os.getlogin() if hasattr(os,"getlogin") else ""}}
    try:
        import psutil; i["cpu_cores"]=psutil.cpu_count(logical=True) or 0; i["total_ram"]=psutil.virtual_memory().total
    except: pass
    return i
def heartbeat(srv,aid,info):
    try:
        r=urlopen(Request(f"{{srv}}/agents/heartbeat/",data=json.dumps({{"agent_id":aid,**info}}).encode(),headers={{"Content-Type":"application/json"}}),timeout=10)
        return json.loads(r.read()).get("status")=="ok"
    except: return False
import argparse
p=argparse.ArgumentParser(); p.add_argument("--server",required=True); p.add_argument("--client-id",type=int,required=True); p.add_argument("--site-id",type=int,required=True); p.add_argument("--agent-type",default="server"); a=p.parse_args()
print(f"OpenRMM Agent v{{AGENT_VERSION}} starting")
while running:
    i=sys_info()
    if heartbeat(a.server,get_id(),i): backoff=1
    else: time.sleep(backoff); backoff=min(backoff*2,60); continue
    for _ in range(30):
        if not running: break
        time.sleep(1)
"@ | Set-Content -Path "$InstallDir\openrmm-agent.py"
}}

# Create launcher
Set-Content -Path "$InstallDir\launch.bat" -Value "@echo off`n$pythonExe \"$InstallDir\openrmm-agent.py\" --server $Server --client-id $ClientId --site-id $SiteId --agent-type $AgentType"

# Register scheduled task
$TaskName = "OpenRMM-Agent"
Unregister-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$Action = New-ScheduledTaskAction -Execute "$InstallDir\launch.bat"
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 999
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description "OpenRMM Agent" | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host ""
Write-Host "=== Agent Installed! ===" -ForegroundColor Green
Write-Host "Dir: $InstallDir"
Write-Host "Service: Scheduled Task 'OpenRMM-Agent' (runs as SYSTEM)"
Write-Host "Log: $InstallDir\agent.log"
Write-Host ""
Write-Host "To uninstall: Unregister-ScheduledTask -TaskName OpenRMM-Agent; Remove-Item '$InstallDir' -Recurse"
'''
        return PlainTextResponse(script)
    else:
        # Bash install script
        script = f'''#!/bin/bash
# OpenRMM Agent Installer for Linux/Mac
# Run as root or with sudo
set -e

SERVER="{api_url}"
CLIENT_ID={req.client}
SITE_ID={req.site}
AGENT_TYPE="{req.agenttype}"

if [ "$EUID" -ne 0 ]; then echo "ERROR: Run with sudo!"; exit 1; fi

echo "=== OpenRMM Agent Installer ==="
echo "Server: $SERVER | Client: $CLIENT_ID | Site: $SITE_ID | Type: $AGENT_TYPE"

# Check Python 3
if ! command -v python3 &>/dev/null; then
    echo "Installing Python 3..."
    if command -v apt &>/dev/null; then apt update && apt install -y python3 python3-pip
    elif command -v yum &>/dev/null; then yum install -y python3 python3-pip
    elif command -v brew &>/dev/null; then brew install python3
    else echo "ERROR: Install Python 3 manually"; exit 1
    fi
fi

python3 -m pip install psutil --quiet 2>/dev/null || pip3 install psutil --quiet

INSTALL_DIR="/opt/openrmm-agent"
mkdir -p $INSTALL_DIR

# Download agent
AGENT_URL="$SERVER/agents/download/openrmm-agent.py"
echo "Downloading agent from: $AGENT_URL"
curl -sfL "$AGENT_URL" -o "$INSTALL_DIR/openrmm-agent.py" || wget -q "$AGENT_URL" -O "$INSTALL_DIR/openrmm-agent.py" || {{
    echo "Download failed, creating agent locally..."
    python3 -c "
import json,os,platform,signal,socket,sys,time,uuid
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import URLError
AGENT_VERSION='0.1.0'
ID_FILE=Path(os.path.expanduser('~'))/'.openrmm-agent-id'
running=True; backoff=1
def sig_handler(s,f): global running; running=False
signal.signal(signal.SIGINT,sig_handler); signal.signal(signal.SIGTERM,sig_handler)
def get_id():
    if ID_FILE.exists(): return ID_FILE.read_text().strip()
    aid=str(uuid.uuid4()); ID_FILE.write_text(aid); return aid
def local_ip():
    try: s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.connect(('8.8.8.8',80)); r=s.getsockname()[0]; s.close(); return r
    except: return ''
def public_ip():
    for u in ['https://api.ipify.org','https://ifconfig.me']:
        try: return urlopen(Request(u,headers={{'User-Agent':'openrmm-agent'}}),timeout=5).read().decode().strip()
        except: continue
    return ''
def sys_info():
    i={{'hostname':socket.gethostname(),'version':AGENT_VERSION,'operating_system':platform.system(),'plat':platform.system().lower(),'goarch':platform.machine(),'os_name':platform.system(),'os_version':platform.version(),'public_ip':public_ip(),'local_ip':local_ip(),'cpu_model':platform.processor(),'cpu_cores':0,'total_ram':0,'logged_in_user':os.getlogin() if hasattr(os,'getlogin') else ''}}
    try:
        import psutil; i['cpu_cores']=psutil.cpu_count(logical=True) or 0; i['total_ram']=psutil.virtual_memory().total
    except: pass
    return i
def heartbeat(srv,aid,info):
    try:
        r=urlopen(Request(f'{{srv}}/agents/heartbeat/',data=json.dumps({{'agent_id':aid,**info}}).encode(),headers={{'Content-Type':'application/json'}}),timeout=10)
        return json.loads(r.read()).get('status')=='ok'
    except: return False
import argparse
p=argparse.ArgumentParser(); p.add_argument('--server',required=True); p.add_argument('--client-id',type=int,required=True); p.add_argument('--site-id',type=int,required=True); p.add_argument('--agent-type',default='server'); a=p.parse_args()
print(f'OpenRMM Agent v{{AGENT_VERSION}} starting')
while running:
    i=sys_info()
    if heartbeat(a.server,get_id(),i): backoff=1
    else: time.sleep(backoff); backoff=min(backoff*2,60); continue
    for _ in range(30):
        if not running: break
        time.sleep(1)
" > $INSTALL_DIR/openrmm-agent.py
}}

# Create systemd service
cat > /etc/systemd/system/openrmm-agent.service << EOF
[Unit]
Description=OpenRMM Monitoring Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 $INSTALL_DIR/openrmm-agent.py --server $SERVER --client-id $CLIENT_ID --site-id $SITE_ID --agent-type $AGENT_TYPE
WorkingDirectory=$INSTALL_DIR
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable openrmm-agent
systemctl start openrmm-agent

echo ""
echo "=== Agent Installed! ==="
echo "Dir: $INSTALL_DIR"
echo "Service: openrmm-agent (systemd)"
echo "Log: $INSTALL_DIR/agent.log"
'''
        return PlainTextResponse(script)


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


@router.get("/download/openrmm-agent.py")
async def download_agent():
    """Download the agent Python script."""
    import os
    agent_path = os.path.join(os.path.dirname(__file__), "..", "..", "agent", "openrmm-agent.py")
    agent_path = os.path.normpath(agent_path)
    if os.path.exists(agent_path):
        from fastapi.responses import FileResponse
        return FileResponse(agent_path, media_type="text/x-python", filename="openrmm-agent.py")
    # Fallback: serve the standalone agent inline
    from fastapi.responses import PlainTextResponse
    script = '''#!/usr/bin/env python3
"""OpenRMM Agent"""
import json,os,platform,signal,socket,sys,time,uuid
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import URLError
AGENT_VERSION="0.1.0"
ID_FILE=Path(os.path.expanduser("~"))/".openrmm-agent-id"
running=True; backoff=1
def sig_handler(s,f): global running; running=False
signal.signal(signal.SIGINT,sig_handler)
signal.signal(signal.SIGTERM,sig_handler)
def get_id():
    if ID_FILE.exists(): return ID_FILE.read_text().strip()
    aid=str(uuid.uuid4()); ID_FILE.write_text(aid); return aid
def local_ip():
    try: s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.connect(("8.8.8.8",80)); r=s.getsockname()[0]; s.close(); return r
    except: return ""
def public_ip():
    for u in ["https://api.ipify.org","https://ifconfig.me"]:
        try: return urlopen(Request(u,headers={{"User-Agent":"openrmm-agent"}}),timeout=5).read().decode().strip()
        except: continue
    return ""
def sys_info():
    i={"hostname":socket.gethostname(),"version":AGENT_VERSION,"operating_system":platform.system(),"plat":platform.system().lower(),"goarch":platform.machine(),"os_name":platform.system(),"os_version":platform.version(),"public_ip":public_ip(),"local_ip":local_ip(),"cpu_model":platform.processor(),"cpu_cores":0,"total_ram":0,"logged_in_user":os.getlogin() if hasattr(os,"getlogin") else ""}
    try:
        import psutil; i["cpu_cores"]=psutil.cpu_count(logical=True) or 0; i["total_ram"]=psutil.virtual_memory().total
    except: pass
    return i
def heartbeat(srv,aid,info):
    try:
        r=urlopen(Request(f"{srv}/agents/heartbeat/",data=json.dumps({"agent_id":aid,**info}).encode(),headers={"Content-Type":"application/json"}}),timeout=10)
        return json.loads(r.read()).get("status")=="ok"
    except: return False
import argparse
p=argparse.ArgumentParser(); p.add_argument("--server",required=True); p.add_argument("--client-id",type=int,required=True); p.add_argument("--site-id",type=int,required=True); p.add_argument("--agent-type",default="server"); a=p.parse_args()
print(f"OpenRMM Agent v{AGENT_VERSION} starting")
while running:
    i=sys_info()
    if heartbeat(a.server,get_id(),i): backoff=1
    else: time.sleep(backoff); backoff=min(backoff*2,60); continue
    for _ in range(30):
        if not running: break
        time.sleep(1)
'''
    return PlainTextResponse(script, media_type="text/x-python")


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
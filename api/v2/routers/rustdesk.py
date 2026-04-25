"""
RustDesk OSS integration routes for OpenRMM.

Works with RustDesk OSS server (no HTTP API).
Reads server key from Docker volume and peers from SQLite DB.
"""
import os
import secrets
import logging
import sqlite3
import string

from fastapi import APIRouter, Query, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from v2.auth import get_current_user
from v2.database import get_db

router = APIRouter(prefix="/rustdesk/api")
logger = logging.getLogger(__name__)

# RustDesk configuration from environment
RUSTDESK_SERVER = os.environ.get("RUSTDESK_SERVER", "rustdesk.derfwins.com")
RUSTDESK_RELAY_SERVER = os.environ.get("RUSTDESK_RELAY_SERVER", "rustdesk-relay.derfwins.com")
# Path to hbbs data inside Docker
RUSTDESK_DATA_DIR = os.environ.get("RUSTDESK_DATA_DIR", "/rustdesk_data")
RUSTDESK_PUBLIC_KEY = "lioe8YzcsJlDYHs9sMLtOgwS0ZjrDLyiYt2JE6LGEGw="


@router.get("/server-key/")
async def get_server_key():
    """Get the RustDesk server config for agent installation."""
    # Try to read key from file (in case it was regenerated)
    key = RUSTDESK_PUBLIC_KEY
    try:
        key_path = os.path.join(RUSTDESK_DATA_DIR, "id_ed25519.pub")
        if os.path.exists(key_path):
            with open(key_path, "r") as f:
                key = f.read().strip()
    except Exception as e:
        logger.warning(f"Could not read RustDesk key file: {e}")

    return {
        "public_key": key,
        "server": RUSTDESK_SERVER,
        "id_server": RUSTDESK_SERVER,
        "relay_server": RUSTDESK_RELAY_SERVER,
    }


@router.get("/session/")
async def create_session(
    peer_id: str = Query(..., description="RustDesk peer ID or OpenRMM agent ID"),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from v2.models.agent import Agent

    rustdesk_peer_id = peer_id
    result = await db.execute(select(Agent).where(Agent.agent_id == peer_id))
    agent = result.scalar_one_or_none()

    if agent:
        rustdesk_peer_id = agent.rustdesk_id

    password = secrets.token_hex(4)

    return {
        "peer_id": rustdesk_peer_id,
        "server": RUSTDESK_SERVER,
        "relay_server": RUSTDESK_RELAY_SERVER,
        "password": password,
        "server_url": RUSTDESK_SERVER,
        "key": RUSTDESK_PUBLIC_KEY,
        "client_url": f"rustdesk://{rustdesk_peer_id}@{RUSTDESK_SERVER}?password={password}&key={RUSTDESK_PUBLIC_KEY}",
    }


@router.get("/install-command/")
async def get_install_command(
    os_type: str = Query("windows", description="windows, linux, or macos"),
    current_user=Depends(get_current_user),
):
    """Get the command to install the RustDesk agent on a device."""
    server = RUSTDESK_SERVER
    relay = RUSTDESK_RELAY_SERVER
    server_key = RUSTDESK_PUBLIC_KEY

    # Try to read key from file
    try:
        key_path = os.path.join(RUSTDESK_DATA_DIR, "id_ed25519.pub")
        if os.path.exists(key_path):
            with open(key_path, "r") as f:
                server_key = f.read().strip()
    except Exception:
        pass

    if os_type.lower() == "windows":
        command = (
            f'# Install RustDesk Agent for OpenRMM\n'
            f'# Run as Administrator in PowerShell\n\n'
            f'[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12\n'
            f'$InstallDir = "C:\\Program Files\\RustDesk"\n'
            f'New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null\n\n'
            f'Write-Host "Downloading RustDesk..." -ForegroundColor Cyan\n'
            f'Invoke-WebRequest -Uri "https://rmmapp.derfwins.com/downloads/rustdesk-1.4.6-x86_64.exe" '
            f'-OutFile "$env:TEMP\\rustdesk-setup.exe" -UseBasicParsing\n\n'
            f'Write-Host "Installing RustDesk..." -ForegroundColor Cyan\n'
            f'Start-Process -FilePath "$env:TEMP\\rustdesk-setup.exe" '
            f'-ArgumentList "/S" -Wait\n\n'
            f'Write-Host "Configuring server..." -ForegroundColor Cyan\n'
            f'$rd = Get-Command rustdesk.exe -ErrorAction SilentlyContinue | Select-Object -First 1; '
            f'if (-not $rd) {{ $rd = "C:\\Program Files\\RustDesk\\rustdesk.exe" }}; '
            f'if (-not (Test-Path $rd)) {{ $rd = "$env:LOCALAPPDATA\\RustDesk\\rustdesk.exe" }}\n'
            f'& $rd --config-server {server}\n'
            f'& $rd --relay-server {relay}\n'
            f'& $rd --key {server_key}\n'
            f'$peerId = & $rd --get-id\n'
            f'Write-Host "RustDesk Peer ID: $peerId" -ForegroundColor Green\n'
            f'Write-Host "Register this ID in OpenRMM to enable remote access." -ForegroundColor Yellow\n'
        )

    elif os_type.lower() == "linux":
        command = (
            '#!/bin/bash\n'
            '# Install RustDesk Agent for OpenRMM\n\n'
            'echo "Downloading RustDesk..."\n'
            f'curl -sL https://rmmapp.derfwins.com/downloads/rustdesk-1.4.6-x86_64.deb -o /tmp/rustdesk.deb\n'
            'echo "Installing..."\n'
            f'sudo dpkg -i /tmp/rustdesk.deb || sudo apt-get install -f -y\n\n'
            'echo "Configuring server..."\n'
            f'rustdesk --config-server {server}\n'
            f'rustdesk --relay-server {relay}\n'
            f'rustdesk --key {server_key}\n'
            'PEER_ID=$(rustdesk --get-id 2>/dev/null)\n'
            'echo "RustDesk Peer ID: $PEER_ID"\n'
            'echo "Register this ID in OpenRMM to enable remote access."\n'
        )

    else:  # macos
        command = (
            f'brew install --cask rustdesk && '
            f'rustdesk --config-server {server} && '
            f'rustdesk --relay-server {relay} && '
            f'rustdesk --key {server_key}\n'
        )

    return {
        "os_type": os_type.lower(),
        "command": command,
        "server": server,
        "relay_server": relay,
        "server_key": server_key,
        "download_url": "https://github.com/rustdesk/rustdesk/releases/latest",
    }


@router.post("/install-push/")
async def push_install_to_agent(
    agent_id: str = Query(..., description="OpenRMM agent ID"),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Push RustDesk install command to an agent via WebSocket."""
    from v2.models.agent import Agent
    from v2.routers.ws_state import agent_connections, lookup_agent_id
    import time

    # Look up agent
    agent_uuid = await lookup_agent_id(agent_id)
    if not agent_uuid:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Get agent platform and stored password
    result = await db.execute(select(Agent).where(Agent.agent_id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        try:
            result = await db.execute(select(Agent).where(Agent.id == int(agent_id)))
            agent = result.scalar_one_or_none()
        except (ValueError, TypeError):
            pass
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found in database")

    # Check agent is connected via WebSocket
    agent_ws = agent_connections.get(agent_uuid)
    if not agent_ws:
        raise HTTPException(status_code=503, detail="Agent is not connected via WebSocket")

    # Determine OS type
    plat = (agent.plat or "windows").lower()
    os_type = "windows" if plat == "windows" else "linux" if plat == "linux" else "macos"

    # Get server config
    server = RUSTDESK_SERVER
    relay = RUSTDESK_RELAY_SERVER
    server_key = RUSTDESK_PUBLIC_KEY
    try:
        key_path = os.path.join(RUSTDESK_DATA_DIR, "id_ed25519.pub")
        if os.path.exists(key_path):
            with open(key_path, "r") as f:
                server_key = f.read().strip()
    except Exception:
        pass

    # Use stored password or generate one for unattended access
    password = getattr(agent, 'rustdesk_password', None) or ''.join(
        secrets.choice(string.ascii_letters + string.digits) for _ in range(12)
    )

    # Generate silent install command based on OS
    # Uses a two-step approach for Windows: write PS script to temp file, then execute it.
    # This avoids cmd.exe command line length limits and quoting nightmares.
    if os_type == "windows":
        ps_script = f"""
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = 'Stop'
$server = '{server}'
$relay = '{relay}'
$key = '{server_key}'
$password = '{password}'

function Log($msg) {{ Write-Host "[RUSTDESK-INSTALL] $msg" }}

function Find-RustDesk {{
    $paths = @(
        'C:\\Program Files\\RustDesk\\rustdesk.exe',
        'C:\\Program Files (x86)\\RustDesk\\rustdesk.exe',
        "$env:LOCALAPPDATA\\RustDesk\\rustdesk.exe",
        "$env:ProgramFiles\\RustDesk\\rustdesk.exe"
    )
    foreach ($p in $paths) {{ if (Test-Path $p) {{ return $p }} }}
    $found = Get-Command rustdesk.exe -ErrorAction SilentlyContinue
    if ($found) {{ return $found.Source }}
    $search = Get-ChildItem 'C:\\Program Files' -Filter 'rustdesk.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($search) {{ return $search.FullName }}
    $search2 = Get-ChildItem 'C:\\ProgramData' -Filter 'rustdesk.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($search2) {{ return $search2.FullName }}
    return $null
}}

Log '=== RustDesk Install Starting ==='
$rd = Find-RustDesk
if ($rd) {{
    Log "RustDesk found at: $rd - checking service..."
    $svc = Get-Service -Name 'RustDesk' -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq 'Running') {{ Log 'RustDesk service already running' }}
    else {{ Log 'Starting RustDesk service...'; Start-Process $rd -ArgumentList '--service' -WindowStyle Hidden; Start-Sleep -Seconds 5 }}
}} else {{
    Log 'RustDesk not found, downloading installer...'
    $tmpFile = "$env:TEMP\\rustdesk-setup.exe"
    try {{
        Invoke-WebRequest -Uri 'https://rmmapp.derfwins.com/downloads/rustdesk-1.4.6-x86_64.exe' -OutFile $tmpFile -UseBasicParsing
        Log "Downloaded ($(Get-Item $tmpFile).Length bytes)"
    }} catch {{
        Log "ERROR: Download failed: $($_.Exception.Message)"; exit 1
    }}
    Log 'Installing RustDesk silently...'
    try {{
        $proc = Start-Process -FilePath $tmpFile -ArgumentList '/S' -Wait -PassThru
        Log "Installer exit code: $($proc.ExitCode)"
    }} catch {{
        Log "ERROR: Install failed: $($_.Exception.Message)"; exit 1
    }}
    Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    $rd = Find-RustDesk
    if ($rd) {{
        Log "RustDesk installed at: $rd"
        Start-Process $rd -ArgumentList '--service' -WindowStyle Hidden; Start-Sleep -Seconds 8
    }} else {{
        Log 'ERROR: RustDesk binary not found after install - trying PATH'
        $rd = 'rustdesk.exe'
    }}
}}

Log 'Configuring RustDesk with server/relay/key/password...'
try {{
    Log 'Setting server...'; & $rd --config-server $server 2>&1 | ForEach-Object {{ Log "  $_" }}
    Log 'Setting relay...'; & $rd --relay-server $relay 2>&1 | ForEach-Object {{ Log "  $_" }}
    Log 'Setting key...'; & $rd --key $key 2>&1 | ForEach-Object {{ Log "  key: set" }}
    Log 'Setting password...'; & $rd --password $password 2>&1 | ForEach-Object {{ Log "  password: set" }}
}} catch {{
    Log "WARNING: Config error (may need service restart): $($_.Exception.Message)"
}}

Log 'Restarting RustDesk service...'
Stop-Process -Name 'rustdesk' -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Start-Process $rd -ArgumentList '--service' -WindowStyle Hidden
Start-Sleep -Seconds 5

Log 'Getting peer ID...'
try {{
    $peerId = (& $rd --get-id 2>&1).Trim()
    if ($peerId -match '^\\d{{6,}}$') {{
        Log "RUSTDESK_PEER_ID=$peerId"; Log "RustDesk complete. Peer ID: $peerId"
    }} else {{
        Log "Got unexpected peer ID: '$peerId'"
    }}
}} catch {{
    Log "Could not get peer ID: $($_.Exception.Message)"
}}
Log '=== RustDesk Install Finished ==='
"""
        # Write PS script to temp file and execute it — avoids cmd.exe line length limits
        import base64
        # Encode the script as Base64 UTF-16LE for -EncodedCommand
        ps_bytes = ps_script.strip().encode('utf-16-le')
        encoded = base64.b64encode(ps_bytes).decode('ascii')
        # But -EncodedCommand can be too long for cmd.exe.
        # Instead: write script to a temp .ps1 file, then execute it.
        # Use PowerShell to write the file and run it in a single short command.
        # First encode the script content for the Set-Content step.
        script_b64 = base64.b64encode(ps_script.strip().encode('utf-8')).decode('ascii')
        # Split into chunks to stay under cmd.exe's ~8191 char limit
        chunk_size = 4000
        chunks = [script_b64[i:i+chunk_size] for i in range(0, len(script_b64), chunk_size)]
        # Build a short command that decodes and writes the script to a temp file, then runs it
        setup_lines = [
            "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12",
            f"$b64 = '{chunks[0]}'",
        ]
        for chunk in chunks[1:]:
            setup_lines.append(f"$b64 += '{chunk}'")
        setup_lines.extend([
            "$script = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($b64))",
            "$script | Set-Content -Path $env:TEMP\\openrmm-rustdesk-install.ps1 -Encoding UTF8",
            "powershell -NoProfile -ExecutionPolicy Bypass -File $env:TEMP\\openrmm-rustdesk-install.ps1",
            "Remove-Item $env:TEMP\\openrmm-rustdesk-install.ps1 -Force -ErrorAction SilentlyContinue",
        ])
        # Join with ; for a single-line PowerShell command
        command = f'powershell -NoProfile -ExecutionPolicy Bypass -Command "{";".join(setup_lines)}"'
    elif os_type == "linux":
        command = (
            'set -e; '
            'RD="rustdesk"; '
            f'echo "[RUSTDESK-INSTALL] Downloading RustDesk..."; '
            f'curl -sL https://github.com/rustdesk/rustdesk/releases/latest/download/rustdesk-1.3.9-x86_64.deb -o /tmp/rustdesk.deb; '
            f'echo "[RUSTDESK-INSTALL] Installing..."; '
            f'sudo dpkg -i /tmp/rustdesk.deb || sudo apt-get install -f -y; '
            f'echo "[RUSTDESK-INSTALL] Configuring server..."; '
            f'$RD --config-server {server}; '
            f'$RD --relay-server {relay}; '
            f'$RD --key {server_key}; '
            f'$RD --password {password}; '
            f'echo "[RUSTDESK-INSTALL] Starting service..."; '
            f'sudo systemctl enable rustdesk 2>/dev/null; sudo systemctl start rustdesk 2>/dev/null || true; '
            f'sleep 3; '
            f'PEER_ID=$($RD --get-id 2>/dev/null); '
            f'echo "[RUSTDESK-INSTALL] RUSTDESK_PEER_ID=$PEER_ID"; '
            f'echo "[RUSTDESK-INSTALL] Done"'
        )
    else:  # macos
        command = (
            f'brew install --cask rustdesk && '
            f'rustdesk --config-server {server} && '
            f'rustdesk --relay-server {relay} && '
            f'rustdesk --key {server_key} && '
            f'rustdesk --password {password} && '
            f'PEER_ID=$(rustdesk --get-id) && '
            f'echo "RUSTDESK_PEER_ID=$PEER_ID"'
        )

    # Send command to agent via WebSocket
    session_id = f"rustdesk_install_{int(time.time())}"

    try:
        await agent_ws.send_json({
            "type": "run_command",
            "command": command,
            "timeout": 600,  # 10 minutes - RustDesk download+install takes time
            "session_id": session_id,
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send command: {e}")

    # Note: The agent will auto-report its RustDesk peer ID and password
    # via heartbeat after installation. No need to parse command output here.

    return {
        "status": "sent",
        "session_id": session_id,
        "os_type": os_type,
        "agent_id": agent_id,
        "hostname": agent.hostname,
        "password": password,
        "command_preview": command[:200],
    }


@router.get("/status/")
async def get_rustdesk_status(
    agent_id: str = Query(None, description="OpenRMM agent ID to check"),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check if a device's RustDesk peer is registered and online."""
    from v2.models.agent import Agent

    result = {
        "installed": False,
        "peer_id": None,
        "peer_online": False,
        "peer_info": None,
        "has_password": False,
    }

    # Look up agent and its rustdesk_id
    if agent_id:
        agent = None
        try:
            result_q = await db.execute(select(Agent).where(Agent.agent_id == agent_id))
            agent = result_q.scalar_one_or_none()
        except Exception:
            pass
        if not agent:
            try:
                result_q = await db.execute(select(Agent).where(Agent.id == int(agent_id)))
                agent = result_q.scalar_one_or_none()
            except (ValueError, TypeError):
                pass

        if agent:
            result["has_password"] = bool(agent.rustdesk_password and agent.rustdesk_password.strip())
            if agent.rustdesk_id:
                result["installed"] = True
                result["peer_id"] = agent.rustdesk_id

    # Check hbbs peer database for online status
    try:
        db_path = os.path.join(RUSTDESK_DATA_DIR, "db_v2.sqlite3")
        if os.path.exists(db_path):
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            try:
                cursor.execute("SELECT id, info, status FROM peer")
                all_peers = cursor.fetchall()
                for peer in all_peers:
                    peer_id = peer[0]
                    peer_info = peer[1] if len(peer) > 1 else ""
                    peer_status = peer[2] if len(peer) > 2 else ""
                    if result["peer_id"] and peer_id == result["peer_id"]:
                        result["peer_online"] = True
                        result["peer_info"] = peer_info
                        break
            except sqlite3.OperationalError:
                logger.warning("Could not query peer table in RustDesk DB")
            conn.close()
    except Exception as e:
        logger.error(f"Failed to check RustDesk peer status: {e}")

    return result


@router.get("/peers/")
async def list_peers(current_user=Depends(get_current_user)):
    """List online RustDesk peers by reading hbbs SQLite database."""
    peers = []
    try:
        db_path = os.path.join(RUSTDESK_DATA_DIR, "db_v2.sqlite3")
        if os.path.exists(db_path):
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            try:
                cursor.execute("SELECT id, info, status FROM peer")
                for row in cursor.fetchall():
                    peers.append({
                        "id": row["id"],
                        "info": row["info"] if "info" in row.keys() else "",
                        "status": row["status"] if "status" in row.keys() else "unknown",
                    })
            except sqlite3.OperationalError:
                logger.warning("Could not query peer table in RustDesk DB")
            conn.close()
    except Exception as e:
        logger.error(f"Failed to read RustDesk peers from DB: {e}")

    return {"peers": peers}


@router.get("/download-agent/")
async def download_agent(
    os_type: str = Query("windows", description="windows, linux, or macos"),
):
    """Redirect to the latest RustDesk client download."""
    downloads = {
        "windows": "https://rmmapp.derfwins.com/downloads/rustdesk-1.4.6-x86_64.exe",
        "linux": "https://rmmapp.derfwins.com/downloads/rustdesk-1.4.6-x86_64.deb",
        "macos": "https://rmmapp.derfwins.com/downloads/rustdesk-1.4.6.dmg",
    }
    url = downloads.get(os_type.lower(), downloads["windows"])
    return RedirectResponse(url=url)
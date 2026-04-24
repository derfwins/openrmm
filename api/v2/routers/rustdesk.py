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
        "client_url": f"rustdesk://{rustdesk_peer_id}@{RUSTDESK_SERVER}?password={password}",
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
            f'$InstallDir = "C:\\Program Files\\RustDesk"\n'
            f'New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null\n\n'
            f'Write-Host "Downloading RustDesk..." -ForegroundColor Cyan\n'
            f'Invoke-WebRequest -Uri "https://github.com/rustdesk/rustdesk/releases/latest/download/rustdesk-1.3.9-x86_64.exe" '
            f'-OutFile "$env:TEMP\\rustdesk-setup.exe" -UseBasicParsing\n\n'
            f'Write-Host "Installing RustDesk..." -ForegroundColor Cyan\n'
            f'Start-Process -FilePath "$env:TEMP\\rustdesk-setup.exe" '
            f'-ArgumentList "/S" -Wait\n\n'
            f'Write-Host "Configuring server..." -ForegroundColor Cyan\n'
            f'$rustdeskPath = "C:\\Program Files\\RustDesk\\rustdesk.exe"\n'
            f'& $rustdeskPath --config-server {server}\n'
            f'& $rustdeskPath --relay-server {relay}\n'
            f'& $rustdeskPath --key {server_key}\n'
            f'$peerId = & $rustdeskPath --get-id\n'
            f'Write-Host "RustDesk Peer ID: $peerId" -ForegroundColor Green\n'
            f'Write-Host "Register this ID in OpenRMM to enable remote access." -ForegroundColor Yellow\n'
        )

    elif os_type.lower() == "linux":
        command = (
            f'#!/bin/bash\n'
            f'# Install RustDesk Agent for OpenRMM\n\n'
            f'echo "Downloading RustDesk..."\n'
            f'curl -sL https://github.com/rustdesk/rustdesk/releases/latest/download/rustdesk-1.3.9-x86_64.deb -o /tmp/rustdesk.deb\n'
            f'sudo dpkg -i /tmp/rustdesk.deb || sudo apt-get install -f -y\n\n'
            f'echo "Configuring server..."\n'
            f'rustdesk --config-server {server}\n'
            f'rustdesk --relay-server {relay}\n'
            f'rustdesk --key {server_key}\n'
            f'PEER_ID=$(rustdesk --get-id)\n'
            f'echo "RustDesk Peer ID: $PEER_ID"\n'
            f'echo "Register this ID in OpenRMM to enable remote access."\n'
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
    # On Windows, the agent uses subprocess.run(shell=True) which runs via cmd.exe,
    # so we must wrap PowerShell commands with powershell -Command
    if os_type == "windows":
        ps_command = (
            f'$tmpFile = "$env:TEMP\\rustdesk-setup.exe"; '
            f'Write-Host "Downloading RustDesk..."; '
            f'Invoke-WebRequest -Uri "https://github.com/rustdesk/rustdesk/releases/latest/download/rustdesk-1.3.9-x86_64.exe" -OutFile $tmpFile -UseBasicParsing; '
            f'Write-Host "Installing RustDesk silently..."; '
            f'Start-Process -FilePath $tmpFile -ArgumentList "/S" -Wait; '
            f'$rd = "C:\\Program Files\\RustDesk\\rustdesk.exe"; '
            f'& $rd --config-server {server}; '
            f'& $rd --relay-server {relay}; '
            f'& $rd --key {server_key}; '
            f'& $rd --password {password}; '
            f'$peerId = & $rd --get-id; '
            f'Write-Host "RUSTDESK_PEER_ID=$peerId"; '
            f'Write-Host "RustDesk installed. Peer ID: $peerId, Password: {password}"'
        )
        command = f'powershell -NoProfile -Command "{ps_command}"'
    elif os_type == "linux":
        command = (
            f'curl -sL https://github.com/rustdesk/rustdesk/releases/latest/download/rustdesk-1.3.9-x86_64.deb -o /tmp/rustdesk.deb && '
            f'sudo dpkg -i /tmp/rustdesk.deb || sudo apt-get install -f -y && '
            f'rustdesk --config-server {server} && '
            f'rustdesk --relay-server {relay} && '
            f'rustdesk --key {server_key} && '
            f'rustdesk --password {password} && '
            f'PEER_ID=$(rustdesk --get-id) && '
            f'echo "RUSTDESK_PEER_ID=$PEER_ID" && '
            f'echo "RustDesk installed. Peer ID: $PEER_ID, Password: {password}"'
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
        "windows": "https://github.com/rustdesk/rustdesk/releases/latest/download/rustdesk-1.3.9-x86_64.exe",
        "linux": "https://github.com/rustdesk/rustdesk/releases/latest/download/rustdesk-1.3.9-x86_64.deb",
        "macos": "https://github.com/rustdesk/rustdesk/releases/latest/download/rustdesk-1.3.9.dmg",
    }
    url = downloads.get(os_type.lower(), downloads["windows"])
    return RedirectResponse(url=url)
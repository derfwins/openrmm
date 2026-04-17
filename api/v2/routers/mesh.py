"""MeshCentral integration - agent download and remote access.

Provides seamless remote access without users knowing MeshCentral exists behind the scenes.
"""
import os
import logging
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse, JSONResponse
import httpx

router = APIRouter(prefix="/mesh/api")
logger = logging.getLogger(__name__)

# MeshCentral configuration from environment
MESH_SERVER_URL = os.environ.get("MESH_SERVER_URL", "https://rmmapp.derfwins.com")
MESH_INTERNAL_URL = os.environ.get("MESH_INTERNAL_URL", "http://meshcentral:4430")
MESH_LOGIN_TOKEN = os.environ.get("MESH_LOGIN_TOKEN_KEY", "")
MESH_MESH_ID = os.environ.get("MESH_MESH_ID", "")


@router.get("/download-agent/")
async def download_agent(
    os_type: str = Query("windows", description="windows, windows32, linux"),
):
    """Download MeshCentral agent installer with server config baked in.
    
    Uses the meshid-based download so the agent knows which server/group to connect to.
    Authenticates to MeshCentral using the admin login token.
    """
    # Map OS type to MeshCentral agent ID
    agent_ids = {
        "windows": 3,       # Windows x64
        "windows32": 4,     # Windows x86
        "linux64": 6,       # Linux x64
        "linux": 5,         # Linux x86 (script installer)
    }
    os_key = os_type.lower()
    agent_id = agent_ids.get(os_key, 3)
    
    # Build download URL with meshid - this bakes the server URL and group into the agent
    if MESH_MESH_ID and os_key != "linux":
        download_url = f"{MESH_INTERNAL_URL}/meshagents?id={agent_id}&meshid={MESH_MESH_ID}&installflags=0"
    else:
        # Fallback to generic agent
        download_url = f"{MESH_INTERNAL_URL}/meshagents?id={agent_id}&installflags=0"
    
    headers = {}
    if MESH_LOGIN_TOKEN:
        headers["Cookie"] = f"login={MESH_LOGIN_TOKEN}"
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.get(download_url, follow_redirects=True, headers=headers)
            
            if resp.status_code == 401 and MESH_MESH_ID:
                # meshid endpoint failed, try generic with cookie auth
                logger.warning("meshid download returned 401, trying generic agent")
                generic_url = f"{MESH_INTERNAL_URL}/meshagents?id={agent_id}&installflags=0"
                resp = await client.get(generic_url, follow_redirects=True, headers=headers)
            
            if resp.status_code != 200:
                raise Exception(f"Agent download failed: {resp.status_code}")
            
            filename = "meshagent.exe" if os_key != "linux" else "meshinstall.sh"
            return StreamingResponse(
                iter([resp.content]),
                media_type="application/octet-stream",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'}
            )
        except Exception as e:
            logger.error(f"Agent download failed: {e}")
            return JSONResponse(
                status_code=500,
                content={"error": f"Failed to download MeshCentral agent: {str(e)}"}
            )


@router.get("/install-command/")
def get_install_command(
    os_type: str = Query("windows", description="windows or linux"),
):
    """Get the command to install MeshCentral agent via OpenRMM."""
    download_url = f"{MESH_SERVER_URL}/mesh/api/download-agent/?os_type={os_type}"
    
    if os_type.lower() == "windows":
        return {
            "os_type": "windows",
            "command": (
                f'powershell -Command "& {{ '
                f'Invoke-WebRequest -Uri \\"{download_url}\\" -OutFile \\"$env:TEMP\\MeshAgent.exe\\" -UseBasicParsing; '
                f'Start-Process -FilePath \\"$env:TEMP\\MeshAgent.exe\\" -ArgumentList \\"/quiet\\" -Wait; '
                f'Remove-Item \\"$env:TEMP\\MeshAgent.exe\\" -Force'
                f' }}"'
            ),
            "instructions": "Agent will automatically connect to OpenRMM's remote access server.",
        }
    else:
        return {
            "os_type": "linux",
            "command": (
                f'curl -sL {download_url} -o /tmp/meshinstall.sh && '
                f'chmod +x /tmp/meshinstall.sh && '
                f'sudo /tmp/meshinstall.sh {MESH_SERVER_URL}/mesh/'
            ),
            "instructions": "Agent will automatically connect to OpenRMM's remote access server.",
        }


@router.get("/agent-install-command/")
def get_agent_install_command(
    os_type: str = Query("windows", description="windows or linux"),
):
    """Unauthenticated endpoint for agent self-enrollment."""
    return get_install_command(os_type)


@router.get("/mesh-config/")
def get_mesh_config():
    """Return MeshCentral mesh configuration for agent .msh file.
    
    This endpoint provides the MeshID, ServerID, and other values
    needed by the MeshAgent .msh config file to connect to the
    correct server and device group.
    """
    import json
    
    mesh_id_raw = MESH_MESH_ID  # mesh//JzDM... format
    if not mesh_id_raw:
        return JSONResponse(status_code=500, content={"error": "Mesh meshid not configured"})
    
    # Convert meshid to hex format for .msh file
    # The meshid after "mesh//" is a custom base64 encoding
    # @ replaces + and $ replaces /
    encoded = mesh_id_raw.replace("mesh//", "")
    import base64
    std_b64 = encoded.replace("@", "+").replace("$", "/")
    # Add padding
    padding = 4 - len(std_b64) % 4
    if padding != 4:
        std_b64 += "=" * padding
    try:
        decoded = base64.b64decode(std_b64)
        mesh_id_hex = "0x" + decoded.hex().upper()
    except Exception:
        mesh_id_hex = ""
    
    # ServerID comes from MeshCentral's DatabaseIdentifier
    # This is configured in the .env file or fetched from MeshCentral
    server_id = os.environ.get("MESH_SERVER_ID", "e17f9401175107713c3f378b5dcd90c6063a49f3bc58d2cb95bb1b5d8553c63a65d7cbe38b0d929f099f66fe310edbbe")
    
    return {
        "mesh_id_hex": mesh_id_hex,
        "server_id": server_id,
        "mesh_name": "Managed Devices",
        "mesh_type": 2,
        "mesh_server": f"wss://rmmapp.derfwins.com/meshagents",
    }


@router.get("/download-configured-agent/")
async def download_configured_agent():
    """Download the pre-configured MeshCentral agent with meshid baked in."""
    agent_path = "/app/agent/meshagent_configured.exe"
    if not os.path.exists(agent_path):
        return JSONResponse(status_code=404, content={"error": "Configured agent not found"})
    
    from fastapi.responses import FileResponse
    return FileResponse(
        agent_path,
        media_type="application/octet-stream",
        filename="MeshAgent.exe",
    )


@router.get("/sso-token/")
async def get_sso_token():
    """Generate a MeshCentral SSO login token for embedding in OpenRMM UI.
    
    Returns a URL that auto-logs the user into MeshCentral.
    """
    if not MESH_LOGIN_TOKEN:
        return JSONResponse(status_code=500, content={"error": "MeshCentral login token not configured"})
    
    # Use meshctrl to generate a login token
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            # Generate a one-time login token via MeshCentral API
            # The login token allows iframe embedding without separate login
            url = f"{MESH_INTERNAL_URL}/logintokens"
            headers = {"Cookie": f"login={MESH_LOGIN_TOKEN}"}
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                return {"url": f"{MESH_SERVER_URL}/mesh/?token={resp.json().get('token', '')}"}
        except Exception as e:
            logger.error(f"SSO token generation failed: {e}")
    
    return JSONResponse(status_code=500, content={"error": "Failed to generate SSO token"})
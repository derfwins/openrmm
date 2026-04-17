"""MeshCentral integration - agent download and remote access.

Provides seamless remote access without users knowing MeshCentral exists behind the scenes.
"""
import os
import base64
import hashlib
import json
import secrets
import time
import logging
from fastapi import APIRouter, Query, Depends
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
import httpx

from v2.auth import get_current_user

router = APIRouter(prefix="/mesh/api")
logger = logging.getLogger(__name__)

# MeshCentral configuration from environment
MESH_SERVER_URL = os.environ.get("MESH_SERVER_URL", "https://rmmapp.derfwins.com")
MESH_INTERNAL_URL = os.environ.get("MESH_INTERNAL_URL", "http://meshcentral:4430")
MESH_LOGIN_TOKEN = os.environ.get("MESH_LOGIN_TOKEN_KEY", "")
MESH_MESH_ID = os.environ.get("MESH_MESH_ID", "")
# LoginCookieEncryptionKey from MeshCentral's meshcentral.db
MESH_COOKIE_KEY = os.environ.get("MESH_COOKIE_KEY", "1a41dc53b3670b84a3e5e7f2ee028fc496cff5e8ad2c5e2ea201e86ce326abe69ae9300ffdc47af65e5589cffbd53460ea1218fa5c90d9a2c868d24dd4b87021c505e3c0e200a2b1082277bfd601a474")


def encode_mesh_cookie(key_hex: str, username: str, action: int = 3, 
                       expire: int = 0, once: str = "", 
                       viewmode: int = 0, gotodeviceid: str = "") -> str:
    """Encode a MeshCentral login cookie.
    
    MeshCentral uses AES-256-CBC + SHA3-384 to sign and encrypt cookies.
    The key is hex-encoded: key[0:48] = SHA3-384 signing, key[48:] = AES encryption.
    Output is base64 with @ replacing + and $ replacing /.
    """
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    from cryptography.hazmat.primitives import padding as sym_padding
    
    key = bytes.fromhex(key_hex)
    sign_key = key[0:48]
    enc_key = key[48:]
    
    # Build cookie JSON
    cookie = {"a": action, "u": username, "time": int(time.time())}
    if expire:
        cookie["expire"] = expire
    if once:
        cookie["once"] = once
    if viewmode:
        cookie["viewmode"] = viewmode
    if gotodeviceid:
        cookie["gotodeviceid"] = gotodeviceid
    
    msg = json.dumps(cookie, separators=(',', ':')).encode()
    
    # SHA3-384 hash of signing key + message
    h = hashlib.sha3_384()
    h.update(sign_key)
    msg = h.digest() + msg
    
    # AES-256-CBC encrypt
    iv = secrets.token_bytes(16)
    padder = sym_padding.PKCS7(128).padder()
    padded = padder.update(msg) + padder.finalize()
    
    cipher = Cipher(algorithms.AES(enc_key), modes.CBC(iv))
    encryptor = cipher.encryptor()
    encrypted = encryptor.update(padded) + encryptor.finalize()
    
    # Base64 with MeshCentral's custom altchars (@ for +, $ for /)
    # Then hex-encode since MeshCentral CookieEncoding is set to "hex"
    result_b64 = base64.b64encode(iv + encrypted, altchars=b"@$")
    result_hex = result_b64.hex()
    return result_hex


@router.get("/download-agent/")
async def download_agent(
    os_type: str = Query("windows", description="windows, windows32, linux"),
):
    """Download MeshCentral agent installer with server config baked in."""
    agent_ids = {"windows": 3, "windows32": 4, "linux64": 6, "linux": 5}
    os_key = os_type.lower()
    agent_id = agent_ids.get(os_key, 3)
    
    if MESH_MESH_ID and os_key != "linux":
        download_url = f"{MESH_INTERNAL_URL}/meshagents?id={agent_id}&meshid={MESH_MESH_ID}&installflags=0"
    else:
        download_url = f"{MESH_INTERNAL_URL}/meshagents?id={agent_id}&installflags=0"
    
    headers = {}
    if MESH_LOGIN_TOKEN:
        headers["Cookie"] = f"login={MESH_LOGIN_TOKEN}"
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.get(download_url, follow_redirects=True, headers=headers)
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
            return JSONResponse(status_code=500, content={"error": str(e)})


@router.get("/download-configured-agent/")
async def download_configured_agent():
    """Download the pre-configured MeshCentral agent with meshid baked in."""
    agent_path = "/app/agent/meshagent_configured.exe"
    if not os.path.exists(agent_path):
        return JSONResponse(status_code=404, content={"error": "Configured agent not found"})
    return FileResponse(agent_path, media_type="application/octet-stream", filename="MeshAgent.exe")


@router.get("/install-command/")
def get_install_command(
    os_type: str = Query("windows", description="windows or linux"),
):
    """Get the command to install MeshCentral agent via OpenRMM."""
    download_url = f"{MESH_SERVER_URL}/mesh/api/download-agent/?os_type={os_type}"
    if os_type.lower() == "windows":
        return {"os_type": "windows", "command": f'powershell -Command "Invoke-WebRequest -Uri \\"{download_url}\\" -OutFile \\"$env:TEMP\\MeshAgent.exe\\" -UseBasicParsing; Start-Process -FilePath \\"$env:TEMP\\MeshAgent.exe\\" -ArgumentList \\"/quiet\\" -Wait"'}
    else:
        return {"os_type": "linux", "command": f'curl -sL {download_url} | sudo bash'}


@router.get("/agent-install-command/")
def get_agent_install_command(
    os_type: str = Query("windows", description="windows or linux"),
):
    """Unauthenticated endpoint for agent self-enrollment."""
    return get_install_command(os_type)


@router.get("/mesh-config/")
def get_mesh_config():
    """Return MeshCentral mesh configuration for agent .msh file."""
    mesh_id_raw = MESH_MESH_ID
    if not mesh_id_raw:
        return JSONResponse(status_code=500, content={"error": "Mesh meshid not configured"})
    encoded = mesh_id_raw.replace("mesh//", "")
    std_b64 = encoded.replace("@", "+").replace("$", "/")
    padding = 4 - len(std_b64) % 4
    if padding != 4:
        std_b64 += "=" * padding
    try:
        decoded = base64.b64decode(std_b64)
        mesh_id_hex = "0x" + decoded.hex().upper()
    except Exception:
        mesh_id_hex = ""
    server_id = os.environ.get("MESH_SERVER_ID", "e17f9401175107713c3f378b5dcd90c6063a49f3bc58d2cb95bb1b5d8553c63a65d7cbe38b0d929f099f66fe310edbbe")
    return {
        "mesh_id_hex": mesh_id_hex,
        "server_id": server_id,
        "mesh_name": "Managed Devices",
        "mesh_type": 2,
        "mesh_server": f"wss://rmmapp.derfwins.com/meshagents",
    }


@router.get("/token/")
async def get_mesh_token(current_user=Depends(get_current_user)):
    """Generate a MeshCentral login token for the authenticated OpenRMM user.
    
    Creates an encrypted MeshCentral cookie that auto-logs the user in.
    """
    try:
        cookie = encode_mesh_cookie(
            MESH_COOKIE_KEY,
            username="admin",
            action=3,  # 3 = full login
            expire=int(time.time()) + 3600,  # 1 hour
            once=secrets.token_hex(16),  # single-use
        )
        return {
            "token": cookie,
            "url": f"{MESH_SERVER_URL}/mesh/?login={cookie}",
        }
    except Exception as e:
        logger.error(f"MeshCentral token generation failed: {e}")
        return JSONResponse(status_code=500, content={"error": f"Failed to generate token: {str(e)}"})


@router.get("/session/")
async def get_mesh_session(
    device_id: str = Query(..., description="MeshCentral device node ID"),
    viewmode: int = Query(12, description="12=desktop, 11=terminal, 13=files"),
    current_user=Depends(get_current_user),
):
    """Get a direct MeshCentral session URL for a specific device.
    
    Returns a URL with an encrypted cookie that opens MeshCentral directly
    to the specified device with the requested view mode.
    """
    try:
        cookie = encode_mesh_cookie(
            MESH_COOKIE_KEY,
            username="admin",
            action=3,
            expire=int(time.time()) + 300,  # 5 minutes for direct link
            once=secrets.token_hex(16),
            viewmode=viewmode,
            gotodeviceid=device_id,
        )
        session_url = f"{MESH_SERVER_URL}/mesh/?login={cookie}"
        return {"url": session_url}
    except Exception as e:
        logger.error(f"MeshCentral session URL generation failed: {e}")
        return JSONResponse(status_code=500, content={"error": f"Failed to generate session: {str(e)}"})


@router.get("/sso-token/")
async def get_sso_token(current_user=Depends(get_current_user)):
    """Generate a MeshCentral SSO login token for iframe embedding."""
    return await get_mesh_token(current_user)
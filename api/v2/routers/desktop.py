"""WebSocket Desktop Relay - Browser <-> Server <-> Agent (Screen Sharing + Input)"""

import asyncio
import uuid
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError, jwt
from sqlalchemy import select

from v2.config import settings
from v2.database import AsyncSessionLocal
from v2.models.agent import Agent
from v2.models.user import User
from v2.routers.terminal import agent_connections, verify_token, lookup_agent_id

logger = logging.getLogger(__name__)
router = APIRouter()

# Desktop sessions: session_id -> { "browser_ws": WebSocket, "agent_id": str }
desktop_sessions: dict[str, dict] = {}


@router.websocket("/ws/desktop/{agent_id}/")
async def desktop_ws(websocket: WebSocket, agent_id: str, token: str = Query(...)):
    """Browser connects here for a remote desktop session."""
    user = await verify_token(token)
    if not user:
        await websocket.accept()
        await websocket.close(code=4001, reason="Unauthorized")
        return

    agent_uuid = await lookup_agent_id(agent_id)
    if not agent_uuid:
        await websocket.accept()
        await websocket.close(code=4004, reason="Agent not found")
        return

    agent_ws = agent_connections.get(agent_uuid)
    if not agent_ws:
        await websocket.accept()
        await websocket.close(code=4003, reason="Agent offline")
        return

    await websocket.accept()

    session_id = str(uuid.uuid4())
    desktop_sessions[session_id] = {
        "browser_ws": websocket,
        "agent_id": agent_uuid,
    }

    # Tell agent to start screen capture
    try:
        await agent_ws.send_json({
            "type": "desktop_start",
            "session_id": session_id,
        })
    except Exception:
        await websocket.close(code=4005, reason="Failed to reach agent")
        desktop_sessions.pop(session_id, None)
        return

    logger.info(f"Desktop session {session_id} started for agent {agent_uuid}")

    # Relay browser input to agent
    try:
        while True:
            # Desktop uses binary for frame data, JSON for control messages
            data = await websocket.receive()
            
            if "text" in data:
                # JSON control message (mouse, keyboard, clipboard, settings)
                try:
                    msg = data["text"]
                    import json
                    parsed = json.loads(msg)
                    msg_type = parsed.get("type")
                    
                    if msg_type in ("mouse", "keyboard", "clipboard", "desktop_settings", "desktop_stop"):
                        agent_ws = agent_connections.get(agent_uuid)
                        if agent_ws:
                            parsed["session_id"] = session_id
                            await agent_ws.send_json(parsed)
                        else:
                            await websocket.send_json({"type": "error", "message": "Agent disconnected"})
                            break
                except Exception as e:
                    logger.warning(f"Desktop WS: parse error: {e}")
            elif "bytes" in data:
                # Binary data (e.g., file transfer chunks) - relay to agent
                agent_ws = agent_connections.get(agent_uuid)
                if agent_ws:
                    # Prepend session_id as JSON header then binary
                    header = json.dumps({"session_id": session_id, "type": "binary"}).encode()
                    length = len(header).to_bytes(4, "big")
                    await agent_ws.send(length + header + data["bytes"])

    except WebSocketDisconnect:
        logger.info(f"Browser disconnected from desktop {session_id}")
    except Exception as e:
        logger.error(f"Desktop session {session_id} error: {e}")
    finally:
        desktop_sessions.pop(session_id, None)
        # Notify agent to stop capture
        agent_ws = agent_connections.get(agent_uuid)
        if agent_ws:
            try:
                await agent_ws.send_json({"type": "desktop_stop", "session_id": session_id})
            except Exception:
                pass


async def relay_desktop_frame(agent_id: str, session_id: str, data: bytes):
    """Called from agent_ws handler to relay a desktop frame to the browser."""
    session = desktop_sessions.get(session_id)
    if session and session.get("browser_ws"):
        try:
            await session["browser_ws"].send_bytes(data)
        except Exception:
            pass


async def relay_desktop_json(agent_id: str, session_id: str, data: dict):
    """Called from agent_ws handler to relay JSON from agent to browser."""
    import json
    session = desktop_sessions.get(session_id)
    if session and session.get("browser_ws"):
        try:
            await session["browser_ws"].send_json(data)
        except Exception:
            pass


def register_desktop_handlers():
    """Patch desktop message handlers into the existing agent_ws handler.
    
    This must be called after terminal.py is loaded so agent_connections is available.
    We monkey-patch by adding desktop handling to the agent_ws message loop.
    """
    # This is handled by importing relay functions in terminal.py's agent_ws handler
    pass
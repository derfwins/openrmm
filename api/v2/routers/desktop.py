"""WebRTC Remote Desktop — Signaling Relay + TURN Credentials

Browser connects to /ws/desktop/{agent_id}/ for WebRTC signaling.
Backend relays SDP offers/answers and ICE candidates between agent and browser.
Also provides REST endpoint for TURN credentials.
"""

import asyncio
import hmac
import hashlib
import base64
import time
import uuid
import logging
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from pydantic import BaseModel
from typing import Optional

from v2.routers.ws_state import agent_connections, desktop_sessions, verify_token, lookup_agent_id
from v2.auth import get_current_user
from v2.models.user import User
from v2.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

# TURN server configuration
TURN_HOST = settings.TURN_HOST
TURN_SHARED_SECRET = settings.TURN_SHARED_SECRET


def generate_turn_credentials(user_id: str, ttl: int = 86400):
    """Generate TOT-based TURN credentials per RTC5766."""
    timestamp = int(time.time()) + ttl
    username = f"{timestamp}:{user_id}"
    hmac_obj = hmac.new(TURN_SHARED_SECRET.encode(), username.encode(), hashlib.sha1)
    password = base64.b64encode(hmac_obj.digest()).decode()
    return {
        "username": username,
        "password": password,
        "urls": [
            f"turn:{TURN_HOST}:3478?transport=udp",
            f"turn:{TURN_HOST}:3478?transport=tcp",
            f"turns:{TURN_HOST}:5349?transport=tcp",
        ]
    }


class TurnCredentialsResponse(BaseModel):
    username: str
    password: str
    urls: list[str]


@router.get("/desktop/turn-credentials/", response_model=TurnCredentialsResponse)
async def get_turn_credentials(user: User = Depends(get_current_user)):
    """REST endpoint for browser to fetch TURN credentials before connecting."""
    creds = generate_turn_credentials(str(user.id))
    return TurnCredentialsResponse(**creds)


@router.websocket("/ws/desktop/{agent_id}/")
async def desktop_ws(websocket: WebSocket, agent_id: str, token: str = Query(...)):
    """Browser connects here for WebRTC remote desktop signaling.

    Flow:
    1. Browser authenticates, backend sends TURN credentials + waits for agent to start
    2. Agent receives webrtc_start, creates PeerConnection + offer, sends offer via agent WS
    3. Backend relays offer to browser
    4. Browser creates answer, sends back via this WS
    5. ICE candidates trickle both ways
    6. WebRTC connection established — video/audio go peer-to-peer or via TURN
    """
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

    # Store browser WS in desktop_sessions so agent messages can find it
    desktop_sessions[session_id] = {
        "browser_ws": websocket,
        "agent_id": agent_uuid,
    }

    # Generate TURN credentials for this user
    turn_creds = generate_turn_credentials(str(user.id))

    # Send session info + TURN credentials to browser
    await websocket.send_json({
        "type": "session_start",
        "session_id": session_id,
        "turn": turn_creds,
    })

    # Tell agent to start WebRTC session
    await agent_ws.send_json({
        "type": "webrtc_start",
        "session_id": session_id,
        "turn": turn_creds,
    })

    logger.info(f"Desktop session {session_id} started for agent {agent_uuid}")

    # Keepalive task
    async def keepalive():
        try:
            while True:
                await asyncio.sleep(30)
                try:
                    await websocket.send_json({"type": "ping"})
                except Exception:
                    break
        except asyncio.CancelledError:
            pass

    keepalive_task = asyncio.create_task(keepalive())

    try:
        while True:
            data = await websocket.receive()

            if "text" in data:
                try:
                    parsed = json.loads(data["text"])
                except json.JSONDecodeError:
                    logger.warning("Desktop WS: invalid JSON from browser")
                    continue

                msg_type = parsed.get("type")
                logger.debug(f"Desktop WS browser msg: {msg_type}")

                if msg_type == "webrtc_answer":
                    # Browser sent SDP answer — relay to agent
                    agent_ws = agent_connections.get(agent_uuid)
                    if agent_ws:
                        parsed["session_id"] = session_id
                        await agent_ws.send_json(parsed)
                    else:
                        await websocket.send_json({"type": "error", "message": "Agent disconnected"})
                        break

                elif msg_type == "webrtc_ice":
                    # Browser sent ICE candidate — relay to agent
                    agent_ws = agent_connections.get(agent_uuid)
                    if agent_ws:
                        parsed["session_id"] = session_id
                        await agent_ws.send_json(parsed)

                elif msg_type == "desktop_stop":
                    # Browser wants to stop
                    agent_ws = agent_connections.get(agent_uuid)
                    if agent_ws:
                        parsed["session_id"] = session_id
                        await agent_ws.send_json(parsed)
                    break

                elif msg_type == "ping":
                    pass  # browser keepalive response

            elif "bytes" in data and data["bytes"]:
                # Binary data is no longer used in WebRTC mode
                # (all video goes over WebRTC, not WebSocket)
                logger.debug(f"Desktop WS: unexpected binary frame ({len(data['bytes'])} bytes)")

    except WebSocketDisconnect:
        logger.info(f"Browser disconnected from desktop session {session_id}")
    except Exception as e:
        logger.error(f"Desktop session {session_id} error: {e}", exc_info=True)
    finally:
        keepalive_task.cancel()
        desktop_sessions.pop(session_id, None)
        # Notify agent to stop
        agent_ws = agent_connections.get(agent_uuid)
        if agent_ws:
            try:
                await agent_ws.send_json({"type": "webrtc_stop", "session_id": session_id})
            except Exception:
                pass
"""WebSocket Desktop Relay - Browser <-> Server <-> Agent (Binary H.264 + Input)

Protocol:
  Agent → Server → Browser: Binary frames with 5-byte header
    Byte 0: Frame type (0x01=H.264 keyframe, 0x02=H.264 delta, 0x03=cursor,
                          0x04=clipboard, 0x05=JSON config)
    Bytes 1-4: Payload length (big endian uint32)
    Bytes 5+: Raw binary payload

  Browser → Server → Agent: Binary frames with 5-byte header
    Byte 0: Frame type (0x10=mouse, 0x11=keyboard, 0x12=clipboard, 0x13=settings)
    Bytes 1-4: Payload length (big endian uint32)
    Bytes 5+: Raw binary payload

  Both sides also accept JSON text frames for control messages (desktop_start,
  desktop_stop, etc.).
"""

import asyncio
import struct
import uuid
import logging
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from v2.routers.ws_state import agent_connections, desktop_sessions, verify_token, lookup_agent_id

logger = logging.getLogger(__name__)
router = APIRouter()

# Frame types from agent
FRAME_H264_KEY = 0x01
FRAME_H264_DELTA = 0x02
FRAME_CURSOR = 0x03
FRAME_CLIPBOARD = 0x04
FRAME_CONFIG = 0x05

# Frame types from browser
FRAME_MOUSE = 0x10
FRAME_KEYBOARD = 0x11
FRAME_CLIPBOARD_OUT = 0x12
FRAME_SETTINGS = 0x13

FRAME_NAMES = {
    0x01: "H264_KEY", 0x02: "H264_DELTA", 0x03: "CURSOR",
    0x04: "CLIPBOARD", 0x05: "CONFIG",
    0x10: "MOUSE", 0x11: "KEYBOARD", 0x12: "CLIPBOARD_OUT", 0x13: "SETTINGS",
}


def _frame_type_name(ftype: int) -> str:
    return FRAME_NAMES.get(ftype, f"UNKNOWN_0x{ftype:02x}")


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

    # Keepalive task — send ping every 30s to prevent Cloudflare timeout
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

    # Relay browser input to agent
    try:
        while True:
            data = await websocket.receive()

            if "text" in data:
                # JSON control message
                try:
                    parsed = json.loads(data["text"])
                    msg_type = parsed.get("type")

                    if msg_type == "desktop_stop":
                        agent_ws = agent_connections.get(agent_uuid)
                        if agent_ws:
                            parsed["session_id"] = session_id
                            await agent_ws.send_json(parsed)
                        break
                    elif msg_type == "desktop_settings":
                        # Convert to binary settings frame for agent
                        agent_ws = agent_connections.get(agent_uuid)
                        if agent_ws:
                            parsed["session_id"] = session_id
                            payload = json.dumps(parsed).encode("utf-8")
                            header = struct.pack("!BI", FRAME_SETTINGS, len(payload))
                            await agent_ws.send(header + payload)
                    elif msg_type == "ping":
                        pass  # ignore browser pings
                    elif msg_type in ("mouse", "keyboard", "clipboard"):
                        # Legacy JSON input — forward as-is with session_id
                        agent_ws = agent_connections.get(agent_uuid)
                        if agent_ws:
                            parsed["session_id"] = session_id
                            await agent_ws.send_json(parsed)
                except json.JSONDecodeError:
                    logger.warning(f"Desktop WS: invalid JSON from browser")
                except Exception as e:
                    logger.warning(f"Desktop WS: control message error: {e}")

            elif "bytes" in data and data["bytes"]:
                # Binary input frame from browser — relay directly to agent
                raw = data["bytes"]
                if len(raw) >= 5:
                    ftype = raw[0]
                    logger.debug(f"Desktop WS: browser binary frame type={_frame_type_name(ftype)} len={len(raw)}")

                agent_ws = agent_connections.get(agent_uuid)
                if agent_ws:
                    try:
                        # Send raw binary frame directly — agent handle_binary_input_frame()
                        # expects the 5-byte header format with NO session_id prefix
                        await agent_ws.send_bytes(raw)
                    except Exception as e:
                        logger.error(f"Desktop WS: failed to relay binary to agent: {e}", exc_info=True)
                        break
                else:
                    await websocket.send_json({"type": "error", "message": "Agent disconnected"})
                    break

    except WebSocketDisconnect:
        logger.info(f"Browser disconnected from desktop {session_id}")
    except Exception as e:
        logger.error(f"Desktop session {session_id} error: {e}")
    finally:
        keepalive_task.cancel()
        desktop_sessions.pop(session_id, None)
        # Notify agent to stop capture
        agent_ws = agent_connections.get(agent_uuid)
        if agent_ws:
            try:
                await agent_ws.send_json({"type": "desktop_stop", "session_id": session_id})
            except Exception:
                pass


async def relay_desktop_frame(agent_id: str, session_id: str, data: bytes):
    """Called from agent_ws handler to relay a binary desktop frame to the browser.

    `data` is the raw binary frame with the 5-byte header (type + length + payload).
    We forward it as-is — the browser parses it.
    """
    session = desktop_sessions.get(session_id)
    if session and session.get("browser_ws"):
        try:
            await session["browser_ws"].send_bytes(data)
        except Exception:
            pass


async def relay_desktop_json(agent_id: str, session_id: str, data: dict):
    """Called from agent_ws handler to relay JSON from agent to browser."""
    session = desktop_sessions.get(session_id)
    if session and session.get("browser_ws"):
        try:
            await session["browser_ws"].send_json(data)
        except Exception:
            pass
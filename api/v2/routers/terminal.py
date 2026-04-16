"""WebSocket Terminal Relay - Browser <-> Server <-> Agent"""

import asyncio
import uuid
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from v2.routers.ws_state import agent_connections, terminal_sessions, desktop_sessions, pending_sessions, verify_token, lookup_agent_id
from v2.routers.desktop import relay_desktop_frame, relay_desktop_json
from v2.database import AsyncSessionLocal
from v2.models.agent import Agent
from v2.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/agent/{agent_id}/")
async def agent_ws(websocket: WebSocket, agent_id: str):
    """Agent connects here persistently. Server sends commands like terminal_start."""
    try:
        await websocket.accept()
        agent_connections[agent_id] = websocket
        logger.warning(f"AGENT WS: {agent_id} connected, total: {len(agent_connections)}")
        print(f"AGENT WS: {agent_id} connected, total: {len(agent_connections)}", flush=True)

        # Start a keepalive task to prevent Cloudflare timeout (100s)
        async def keepalive():
            try:
                while True:
                    await asyncio.sleep(30)
                    try:
                        await websocket.send_json({"type": "ping"})
                        logger.warning(f"Keepalive ping sent to {agent_id}")
                    except Exception as e:
                        logger.warning(f"Keepalive ping failed for {agent_id}: {e}")
                        break
            except asyncio.CancelledError:
                pass

        keepalive_task = asyncio.create_task(keepalive())

        try:
            while True:
                data = await websocket.receive_json()
                msg_type = data.get("type")
                logger.warning(f"Agent {agent_id} sent: {msg_type}")

                if msg_type == "output":
                    # Relay output to browser
                    session_id = data.get("session_id")
                    session = terminal_sessions.get(session_id)
                    if session and session.get("browser_ws"):
                        try:
                            await session["browser_ws"].send_json(data)
                            logger.warning(f"RELAY: output to browser, session={session_id}, len={len(data.get('data',''))}")
                        except Exception as e:
                            logger.error(f"RELAY FAIL: {e}")
                    else:
                        logger.warning(f"RELAY MISS: no browser for session {session_id}, sessions={list(terminal_sessions.keys())}")

                elif msg_type == "exit":
                    session_id = data.get("session_id")
                    session = terminal_sessions.get(session_id)
                    if session and session.get("browser_ws"):
                        try:
                            await session["browser_ws"].send_json(data)
                        except Exception:
                            pass
                    # Cleanup session
                    terminal_sessions.pop(session_id, None)
                    pending_sessions.pop(session_id, None)
                    logger.warning(f"Terminal session {session_id} exited")

                elif msg_type == "pong":
                    logger.info(f"Pong from agent {agent_id}")

                elif msg_type == "resize":
                    pass

                # --- Desktop relay messages ---
                elif msg_type == "desktop_frame":
                    # Agent sent a screen frame (base64 in JSON)
                    session_id = data.get("session_id")
                    import base64
                    frame_data = data.get("frame")
                    if frame_data and session_id:
                        try:
                            raw = base64.b64decode(frame_data)
                            await relay_desktop_frame(agent_id, session_id, raw)
                        except Exception as e:
                            logger.warning(f"Desktop frame relay error: {e}")

                elif msg_type == "desktop_info":
                    # Agent sent screen info (resolution, monitors)
                    session_id = data.get("session_id")
                    if session_id:
                        await relay_desktop_json(agent_id, session_id, data)

                elif msg_type == "desktop_stopped":
                    session_id = data.get("session_id")
                    if session_id:
                        await relay_desktop_json(agent_id, session_id, data)
                        desktop_sessions.pop(session_id, None)

        except WebSocketDisconnect:
            logger.warning(f"AGENT WS: {agent_id} disconnected")
        except Exception as e:
            logger.error(f"AGENT WS: {agent_id} error: {e}")
            print(f"AGENT WS ERROR: {agent_id} {e}", flush=True)
        finally:
            keepalive_task.cancel()
            if agent_connections.get(agent_id) == websocket:
                del agent_connections[agent_id]
            logger.warning(f"AGENT WS: {agent_id} removed, remaining: {len(agent_connections)}")
            # Clean up any sessions for this agent
            to_remove = [sid for sid, s in terminal_sessions.items() if s.get("agent_id") == agent_id]
            for sid in to_remove:
                session = terminal_sessions.pop(sid, None)
                pending_sessions.pop(sid, None)
                if session and session.get("browser_ws"):
                    try:
                        await session["browser_ws"].send_json({"type": "exit", "code": -1, "message": "Agent disconnected"})
                    except Exception:
                        pass
    except Exception as e:
        print(f"AGENT WS FATAL: {agent_id} {type(e).__name__}: {e}", flush=True)
        logger.error(f"AGENT WS FATAL: {agent_id} {type(e).__name__}: {e}")


@router.websocket("/ws/terminal/{agent_id}/")
async def terminal_ws(websocket: WebSocket, agent_id: str, token: str = Query(...)):
    """Browser connects here for an interactive terminal session."""
    # Verify auth
    user = await verify_token(token)
    if not user:
        await websocket.accept()
        await websocket.close(code=4001, reason="Unauthorized")
        return

    # Look up agent UUID from database ID
    agent_uuid = await lookup_agent_id(agent_id)
    if not agent_uuid:
        await websocket.accept()
        await websocket.close(code=4004, reason="Agent not found")
        return

    # Check agent is connected
    agent_ws = agent_connections.get(agent_uuid)
    if not agent_ws:
        await websocket.accept()
        await websocket.close(code=4003, reason="Agent offline")
        return

    await websocket.accept()

    # Create terminal session
    session_id = str(uuid.uuid4())
    terminal_sessions[session_id] = {
        "browser_ws": websocket,
        "agent_id": agent_uuid,
    }

    # Tell agent to start a terminal
    try:
        await agent_ws.send_json({
            "type": "terminal_start",
            "session_id": session_id,
            "cols": 80,
            "rows": 24,
        })
    except Exception:
        await websocket.close(code=4005, reason="Failed to reach agent")
        terminal_sessions.pop(session_id, None)
        return

    logger.info(f"Terminal session {session_id} started for agent {agent_uuid}")

    # Relay browser input to agent
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            logger.warning(f"TERMINAL WS: browser sent {msg_type}: {repr(data.get('data',''))[:50]}")

            if msg_type == "input":
                agent_ws = agent_connections.get(agent_uuid)
                if agent_ws:
                    try:
                        await agent_ws.send_json({
                            "type": "input",
                            "session_id": session_id,
                            "data": data.get("data", ""),
                        })
                        logger.warning(f"TERMINAL WS: relayed input to agent, len={len(data.get('data',''))}")
                    except Exception:
                        break
                else:
                    await websocket.send_json({"type": "exit", "code": -1, "message": "Agent disconnected"})
                    break

            elif msg_type == "resize":
                agent_ws = agent_connections.get(agent_uuid)
                if agent_ws:
                    try:
                        await agent_ws.send_json({
                            "type": "resize",
                            "session_id": session_id,
                            "cols": data.get("cols", 80),
                            "rows": data.get("rows", 24),
                        })
                    except Exception:
                        pass

    except WebSocketDisconnect:
        logger.info(f"Browser disconnected from terminal {session_id}")
    except Exception as e:
        logger.error(f"Terminal session {session_id} error: {e}")
    finally:
        terminal_sessions.pop(session_id, None)
        pending_sessions.pop(session_id, None)
        # Notify agent to kill the shell
        agent_ws = agent_connections.get(agent_uuid)
        if agent_ws:
            try:
                await agent_ws.send_json({"type": "terminal_kill", "session_id": session_id})
            except Exception:
                pass
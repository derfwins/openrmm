"""WebSocket Terminal Relay - Browser <-> Server <-> Agent"""

import asyncio
import uuid
import logging
import json
from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from v2.routers.ws_state import (
    agent_connections, terminal_sessions, desktop_sessions,
    pending_sessions, verify_token, lookup_agent_id,
    browser_connections, broadcast_to_browsers,
)

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

        # Notify browsers that this agent came online
        await broadcast_to_browsers({
            "type": "agent_status",
            "channel": "agents",
            "data": {"agent_id": agent_id, "status": "online"},
        })

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
                data = await websocket.receive()

                if "text" in data:
                    # JSON message
                    try:
                        parsed = json.loads(data["text"])
                    except json.JSONDecodeError:
                        continue
                    msg_type = parsed.get("type")
                    logger.warning(f"Agent {agent_id} sent: {msg_type}")
                elif "bytes" in data and data["bytes"]:
                    # Binary frames no longer used — WebRTC handles media transport
                    logger.debug(f"Agent {agent_id}: unexpected binary frame ({len(data['bytes'])} bytes)")
                    continue
                else:
                    continue

                # --- Handle JSON messages ---
                # NOTE: use `parsed` (the parsed JSON dict), NOT `data` (the raw WS receive dict)
                if msg_type == "output":
                    # Relay output to browser
                    session_id = parsed.get("session_id")
                    session = terminal_sessions.get(session_id)
                    if session and session.get("browser_ws"):
                        try:
                            await session["browser_ws"].send_json(parsed)
                            logger.warning(f"RELAY: output to browser, session={session_id}, len={len(parsed.get('data',''))}")
                        except Exception as e:
                            logger.error(f"RELAY FAIL: {e}")
                    else:
                        logger.warning(f"RELAY MISS: no browser for session {session_id}, sessions={list(terminal_sessions.keys())}")

                elif msg_type == "command_result":
                    # Agent completed a run_command — relay to browser terminal if connected
                    session_id = parsed.get("session_id")
                    output = parsed.get("output", "")
                    success = parsed.get("success", None)
                    return_code = parsed.get("return_code", None)
                    # Always log command results for debugging
                    logger.warning(f"CMD_RESULT session={session_id} success={success} rc={return_code} output_len={len(output)}")
                    if output:
                        # Log output for visibility
                        logger.warning(f"CMD_OUTPUT: {output[:2000]}")
                    session = terminal_sessions.get(session_id)
                    if session and session.get("browser_ws"):
                        try:
                            await session["browser_ws"].send_json(parsed)
                        except Exception:
                            pass

                elif msg_type == "exit":
                    session_id = parsed.get("session_id")
                    session = terminal_sessions.get(session_id)
                    if session and session.get("browser_ws"):
                        try:
                            await session["browser_ws"].send_json(parsed)
                        except Exception:
                            pass
                    # Cleanup session
                    terminal_sessions.pop(session_id, None)
                    pending_sessions.pop(session_id, None)
                    logger.warning(f"Terminal session {session_id} exited")

                elif msg_type == "pong":
                    logger.info(f"Pong from agent {agent_id}")
                elif msg_type == "restart_agent":
                    logger.warning(f"Agent {agent_id} acknowledges restart")

                # --- Script execution results ---
                elif msg_type == "script_result":
                    session_id = parsed.get("session_id", "")
                    status = "completed" if parsed.get("success") else "failed"
                    output = parsed.get("output", "")
                    return_code = parsed.get("return_code")
                    logger.info(f"Script result session={session_id} status={status}")
                    # Update database record
                    try:
                        async with AsyncSessionLocal() as db:
                            from v2.models.script import ScriptExecution
                            result = await db.execute(select(ScriptExecution).where(ScriptExecution.session_id == session_id))
                            execution = result.scalar_one_or_none()
                            if execution:
                                execution.status = status
                                execution.output = output[:50000]
                                execution.return_code = return_code
                                execution.completed_at = datetime.utcnow()
                                await db.commit()
                    except Exception as e:
                        logger.error(f"Failed to update script execution: {e}")
                    # Relay to browser if connected
                    session = terminal_sessions.get(session_id)
                    if session and session.get("browser_ws"):
                        try:
                            await session["browser_ws"].send_json(parsed)
                        except Exception:
                            pass

                # --- Package management results ---
                elif msg_type in ("package_search_result", "package_install_result", "package_uninstall_result", "package_list_result"):
                    session_id = parsed.get("session_id", "")
                    success = parsed.get("success", False)
                    logger.info(f"Package result type={msg_type} session={session_id} success={success}")
                    # Update PackageExecution for install results
                    if msg_type == "package_install_result":
                        try:
                            async with AsyncSessionLocal() as db:
                                from v2.models.package import PackageExecution
                                result = await db.execute(select(PackageExecution).where(PackageExecution.session_id == session_id))
                                execution = result.scalar_one_or_none()
                                if execution:
                                    execution.status = "completed" if success else "failed"
                                    execution.output = parsed.get("output", "")[:50000]
                                    execution.return_code = parsed.get("return_code")
                                    execution.completed_at = datetime.utcnow()
                                    await db.commit()
                        except Exception as e:
                            logger.error(f"Failed to update package execution: {e}")
                    # Relay to browser if connected
                    session = terminal_sessions.get(session_id)
                    if session and session.get("browser_ws"):
                        try:
                            await session["browser_ws"].send_json(parsed)
                        except Exception:
                            pass

                elif msg_type == "resize":
                    pass

                # --- WebRTC signaling relay messages ---
                elif msg_type == "webrtc_offer":
                    # Agent sent SDP offer — relay to browser via desktop session
                    session_id = parsed.get("session_id")
                    logger.warning(f"webrtc_offer from agent {agent_id}, session_id={session_id}, desktop_sessions keys={list(desktop_sessions.keys())}")
                    session = desktop_sessions.get(session_id)
                    logger.warning(f"webrtc_offer: session_id={session_id}, session_found={bool(session)}, browser_ws_found={bool(session and session.get('browser_ws'))}")
                    if session and session.get("browser_ws"):
                        try:
                            await session["browser_ws"].send_json(parsed)
                            logger.warning(f"Relayed webrtc_offer to browser session {session_id}")
                        except Exception as e:
                            logger.warning(f"Failed to relay webrtc_offer: {e}")
                    else:
                        logger.warning(f"webrtc_offer: no desktop session found for session_id={session_id}, available={list(desktop_sessions.keys())}")

                elif msg_type == "webrtc_ice":
                    # Agent sent ICE candidate — relay to browser
                    session_id = parsed.get("session_id")
                    logger.warning(f"webrtc_ice from agent {agent_id}, session_id={session_id}")
                    session = desktop_sessions.get(session_id)
                    if session and session.get("browser_ws"):
                        try:
                            await session["browser_ws"].send_json(parsed)
                        except Exception as e:
                            logger.warning(f"Failed to relay webrtc_ice: {e}")

                elif msg_type == "webrtc_stopped":
                    # Agent stopped WebRTC session
                    session_id = parsed.get("session_id")
                    session = desktop_sessions.get(session_id)
                    if session and session.get("browser_ws"):
                        try:
                            await session["browser_ws"].send_json(parsed)
                        except Exception:
                            pass
                    desktop_sessions.pop(session_id, None)

                elif msg_type == "webrtc_error":
                    # Agent reported WebRTC error
                    session_id = parsed.get("session_id")
                    session = desktop_sessions.get(session_id)
                    if session and session.get("browser_ws"):
                        try:
                            await session["browser_ws"].send_json(parsed)
                        except Exception:
                            pass

                elif msg_type == "webrtc_log":
                    # Agent sent diagnostic log (for debugging)
                    logger.warning(f"[WebRTC Log] session={parsed.get('session_id')}: {parsed.get('message')}")
                    # Also relay to browser for console visibility
                    session_id = parsed.get("session_id")
                    session = desktop_sessions.get(session_id)
                    if session and session.get("browser_ws"):
                        try:
                            await session["browser_ws"].send_json(parsed)
                        except Exception:
                            pass

                # --- Legacy desktop messages (kept for backward compat during transition) ---
                elif msg_type == "desktop_frame":
                    # Legacy base64 JPEG — no longer relayed (WebRTC handles video)
                    logger.debug(f"Ignored legacy desktop_frame from agent {agent_id}")

                elif msg_type == "desktop_info":
                    # Legacy screen info — no longer relayed
                    logger.debug(f"Ignored legacy desktop_info from agent {agent_id}")

                elif msg_type == "desktop_stopped":
                    session_id = parsed.get("session_id")
                    if session_id:
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

            # Notify browsers that this agent went offline
            await broadcast_to_browsers({
                "type": "agent_status",
                "channel": "agents",
                "data": {"agent_id": agent_id, "status": "offline"},
            })

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


# === General Browser WebSocket ===

@router.websocket("/ws/")
async def browser_ws(websocket: WebSocket, token: str = Query(...)):
    """General browser WebSocket for real-time updates (agent status changes, etc.).

    Authenticated via JWT token in query string.
    Server pushes agent status updates, new alerts, etc.
    Browser can subscribe to channels by sending JSON messages.
    """
    # Must accept first, then check auth — FastAPI doesn't support
    # rejecting WebSocket upgrade before accept (would give HTTP 403)
    await websocket.accept()

    # Verify auth
    user = await verify_token(token)
    if not user:
        await websocket.close(code=1008, reason="Invalid or expired token")
        return

    # Register this browser connection
    conn_entry = (user.id, websocket)
    browser_connections.append(conn_entry)

    logger.info(f"Browser WS connected: user={user.username}, total browsers={len(browser_connections)}")

    # Send initial connection confirmation
    await websocket.send_json({
        "type": "connected",
        "channel": "system",
        "data": {"message": "Connected to OpenRMM real-time updates"},
        "timestamp": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    })

    try:
        while True:
            data = await websocket.receive()

            if "text" in data:
                try:
                    parsed = json.loads(data["text"])
                except json.JSONDecodeError:
                    continue

                msg_type = parsed.get("type", "")

                if msg_type == "ping":
                    # Browser keepalive — respond with pong
                    await websocket.send_json({"type": "pong", "channel": "system", "data": None, "timestamp": ""})
                elif msg_type == "subscribe":
                    # Browser wants to subscribe to a channel
                    # For now, all browsers get all updates
                    channel = parsed.get("channel", "")
                    logger.debug(f"Browser WS: user={user.username} subscribed to {channel}")
                else:
                    logger.debug(f"Browser WS: unknown message type={msg_type}")

            elif "bytes" in data:
                continue  # ignore binary
            else:
                continue

    except WebSocketDisconnect:
        logger.info(f"Browser WS disconnected: user={user.username}")
    except Exception as e:
        logger.warning(f"Browser WS error: user={user.username}, error={e}")
    finally:
        # Clean up
        try:
            browser_connections.remove(conn_entry)
        except ValueError:
            pass
        logger.info(f"Browser WS cleanup: user={user.username}, remaining={len(browser_connections)}")
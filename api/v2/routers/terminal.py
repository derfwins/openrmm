"""WebSocket Terminal Relay - Browser <-> Server <-> Agent"""

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

logger = logging.getLogger("terminal")
router = APIRouter()

# In-memory session storage
# agent_connections: agent_id -> WebSocket (persistent agent connection)
agent_connections: dict[str, WebSocket] = {}
# terminal_sessions: session_id -> { "browser_ws": WebSocket, "agent_id": str }
terminal_sessions: dict[str, dict] = {}
# pending_sessions: session_id -> asyncio.Event (browser waits for agent to join)
pending_sessions: dict[str, asyncio.Event] = {}


async def verify_token(token: str) -> User | None:
    """Verify JWT token and return user."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            return None
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(User).where(User.id == int(user_id)))
            user = result.scalar_one_or_none()
            if user and user.is_active and not user.block_dashboard_login:
                return user
    except JWTError:
        pass
    return None


async def lookup_agent_id(agent_db_id: str) -> str | None:
    """Look up agent's UUID by database ID."""
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Agent).where(Agent.id == int(agent_db_id)))
            agent = result.scalar_one_or_none()
            if agent:
                return agent.agent_id
    except Exception:
        pass
    return None


@router.websocket("/ws/agent/{agent_id}/")
async def agent_ws(websocket: WebSocket, agent_id: str):
    """Agent connects here persistently. Server sends commands like terminal_start."""
    await websocket.accept()
    agent_connections[agent_id] = websocket
    logger.info(f"Agent {agent_id} connected via WebSocket")

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "output":
                # Relay output to browser
                session_id = data.get("session_id")
                session = terminal_sessions.get(session_id)
                if session and session.get("browser_ws"):
                    try:
                        await session["browser_ws"].send_json(data)
                    except Exception:
                        pass

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
                logger.info(f"Terminal session {session_id} exited")

            elif msg_type == "resize":
                # Agent acknowledges resize, no action needed
                pass

    except WebSocketDisconnect:
        logger.info(f"Agent {agent_id} disconnected")
    except Exception as e:
        logger.error(f"Agent {agent_id} error: {e}")
    finally:
        if agent_connections.get(agent_id) == websocket:
            del agent_connections[agent_id]
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


@router.websocket("/ws/terminal/{agent_id}/")
async def terminal_ws(websocket: WebSocket, agent_id: str, token: str = Query(...)):
    """Browser connects here for an interactive terminal session."""
    # Verify auth
    user = await verify_token(token)
    if not user:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    # Look up agent UUID from database ID
    agent_uuid = await lookup_agent_id(agent_id)
    if not agent_uuid:
        await websocket.close(code=4004, reason="Agent not found")
        return

    # Check agent is connected
    agent_ws = agent_connections.get(agent_uuid)
    if not agent_ws:
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

            if msg_type == "input":
                agent_ws = agent_connections.get(agent_uuid)
                if agent_ws:
                    try:
                        await agent_ws.send_json({
                            "type": "input",
                            "session_id": session_id,
                            "data": data.get("data", ""),
                        })
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
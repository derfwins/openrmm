"""Shared state and utilities for WebSocket relay (terminal + desktop)."""

from jose import JWTError, jwt
from sqlalchemy import select

from v2.config import settings
from v2.database import AsyncSessionLocal
from v2.models.agent import Agent
from v2.models.user import User

# In-memory session storage
# agent_connections: agent_id -> WebSocket (persistent agent connection)
agent_connections: dict[str, object] = {}

# Terminal sessions: session_id -> { "browser_ws": WebSocket, "agent_id": str }
terminal_sessions: dict[str, dict] = {}

# Pending sessions: session_id -> asyncio.Event
pending_sessions: dict[str, object] = {}

# Desktop sessions: session_id -> { "browser_ws": WebSocket, "agent_id": str }
desktop_sessions: dict[str, dict] = {}


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
    """Look up agent's UUID by database ID. If already a UUID, return as-is."""
    if '-' in agent_db_id and len(agent_db_id) > 20:
        return agent_db_id
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Agent).where(Agent.id == int(agent_db_id)))
            agent = result.scalar_one_or_none()
            if agent:
                return agent.agent_id
    except Exception:
        pass
    return None
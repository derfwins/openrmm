"""Shared state for WebSocket relay (terminal + desktop)."""

# In-memory session storage
# agent_connections: agent_id -> WebSocket (persistent agent connection)
agent_connections: dict[str, object] = {}

# Terminal sessions: session_id -> { "browser_ws": WebSocket, "agent_id": str }
terminal_sessions: dict[str, dict] = {}

# Desktop sessions: session_id -> { "browser_ws": WebSocket, "agent_id": str }
desktop_sessions: dict[str, dict] = {}
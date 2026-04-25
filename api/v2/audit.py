"""Audit logging utility — call log_action() from any route to record events."""
from sqlalchemy.ext.asyncio import AsyncSession
from v2.models.audit import AuditLog


async def log_action(
    db: AsyncSession,
    username: str,
    action: str,
    resource_type: str = None,
    resource_id: str = None,
    description: str = None,
    ip_address: str = None,
):
    """Create an audit log entry. Call this from route handlers.

    Actions: login, logout, create, update, delete, restart, run_command, etc.
    Resource types: agent, client, site, script, user, etc.
    """
    entry = AuditLog(
        username=username,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id else None,
        description=description,
        ip_address=ip_address,
    )
    db.add(entry)
    # Don't commit here — let the route's transaction commit include it
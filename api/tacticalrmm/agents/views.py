"""Agent management API views"""
import secrets
from datetime import datetime, timezone

from django.http import JsonResponse
from django.urls import path
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator

from .models import Agent, AgentCommand, AgentService


@method_decorator(csrf_exempt, name="dispatch")
class AgentListView(View):
    """GET /api/agents/ - List all agents"""

    def get(self, request):
        agents = Agent.objects.all()
        data = [
            {
                "id": str(a.id),
                "agent_id": a.agent_id,
                "hostname": a.hostname,
                "site_id": a.site_id,
                "client_id": a.client_id,
                "version": a.version,
                "plat": a.plat,
                "goarch": a.goarch,
                "status": a.status,
                "last_seen": a.last_seen.isoformat() if a.last_seen else None,
                "first_seen": a.first_seen.isoformat() if a.first_seen else None,
                "monitoring_type": a.monitoring_type,
                "description": a.description,
                "mesh_node_id": a.mesh_node_id,
                "is_maintenance": a.is_maintenance,
                "cpu_model": a.cpu_model,
                "cpu_cores": a.cpu_cores,
                "total_ram": a.total_ram,
                "os_name": a.os_name,
                "os_version": a.os_version,
                "public_ip": a.public_ip,
                "local_ip": a.local_ip,
                "logged_in_user": a.logged_in_user,
            }
            for a in agents
        ]
        return JsonResponse(data, safe=False)


@method_decorator(csrf_exempt, name="dispatch")
class AgentDetailView(View):
    """GET /api/agents/:id/ - Agent detail"""

    def get(self, request, agent_id):
        try:
            a = Agent.objects.get(id=agent_id)
        except Agent.DoesNotExist:
            return JsonResponse({"error": "Agent not found"}, status=404)

        return JsonResponse({
            "id": str(a.id),
            "agent_id": a.agent_id,
            "hostname": a.hostname,
            "site_id": a.site_id,
            "client_id": a.client_id,
            "version": a.version,
            "plat": a.plat,
            "goarch": a.goarch,
            "status": a.status,
            "last_seen": a.last_seen.isoformat() if a.last_seen else None,
            "first_seen": a.first_seen.isoformat() if a.first_seen else None,
            "monitoring_type": a.monitoring_type,
            "description": a.description,
            "mesh_node_id": a.mesh_node_id,
            "is_maintenance": a.is_maintenance,
            "cpu_model": a.cpu_model,
            "cpu_cores": a.cpu_cores,
            "total_ram": a.total_ram,
            "os_name": a.os_name,
            "os_version": a.os_version,
            "public_ip": a.public_ip,
            "local_ip": a.local_ip,
            "logged_in_user": a.logged_in_user,
        })


@method_decorator(csrf_exempt, name="dispatch")
class AgentCommandsView(View):
    """POST /api/agents/:id/commands/ - Send command to agent"""

    def post(self, request, agent_id):
        import json
        try:
            a = Agent.objects.get(id=agent_id)
        except Agent.DoesNotExist:
            return JsonResponse({"error": "Agent not found"}, status=404)

        body = json.loads(request.body)
        command = body.get("command", "")
        shell = body.get("shell", "powershell")
        timeout = body.get("timeout", 300)
        run_by = body.get("run_by", "")

        cmd = AgentCommand.objects.create(
            agent=a,
            command=command,
            shell=shell,
            status="pending",
            timeout=timeout,
            run_by=run_by,
        )

        # TODO: Publish command to NATS for agent to pick up
        return JsonResponse({
            "id": str(cmd.id),
            "agent_id": str(a.id),
            "command": cmd.command,
            "shell": cmd.shell,
            "status": cmd.status,
            "timeout": cmd.timeout,
            "created_at": cmd.created_at.isoformat(),
        }, status=201)

    def get(self, request, agent_id):
        """GET - List pending/recent commands for agent"""
        try:
            a = Agent.objects.get(id=agent_id)
        except Agent.DoesNotExist:
            return JsonResponse({"error": "Agent not found"}, status=404)

        cmds = AgentCommand.objects.filter(agent=a)[:50]
        data = [
            {
                "id": str(c.id),
                "command": c.command,
                "shell": c.shell,
                "status": c.status,
                "output": c.output,
                "run_by": c.run_by,
                "timeout": c.timeout,
                "created_at": c.created_at.isoformat(),
                "completed_at": c.completed_at.isoformat() if c.completed_at else None,
            }
            for c in cmds
        ]
        return JsonResponse(data, safe=False)


@method_decorator(csrf_exempt, name="dispatch")
class AgentHistoryView(View):
    """GET /api/agents/:id/history/ - Command history"""

    def get(self, request, agent_id):
        try:
            a = Agent.objects.get(id=agent_id)
        except Agent.DoesNotExist:
            return JsonResponse({"error": "Agent not found"}, status=404)

        cmds = AgentCommand.objects.filter(agent=a).order_by("-created_at")[:100]
        data = [
            {
                "id": str(c.id),
                "command": c.command,
                "shell": c.shell,
                "status": c.status,
                "output": c.output[:500] if c.output else "",
                "run_by": c.run_by,
                "created_at": c.created_at.isoformat(),
                "completed_at": c.completed_at.isoformat() if c.completed_at else None,
            }
            for c in cmds
        ]
        return JsonResponse(data, safe=False)


@method_decorator(csrf_exempt, name="dispatch")
class AgentEnrollView(View):
    """POST /api/agents/enroll/ - Agent enrollment endpoint"""

    def post(self, request):
        import json
        body = json.loads(request.body)

        hostname = body.get("hostname", "unknown")
        platform = body.get("platform", "unknown")
        goarch = body.get("goarch", "amd64")
        agent_type = body.get("agent_type", "server")
        client_id = body.get("client", "")
        site_id = body.get("site", "")

        # Generate unique agent ID and secret
        agent_id = f"agent-{secrets.token_hex(12)}"
        secret = secrets.token_urlsafe(32)

        agent = Agent.objects.create(
            agent_id=agent_id,
            hostname=hostname,
            plat=platform,
            goarch=goarch,
            monitoring_type=agent_type,
            client_id=int(client_id) if client_id else None,
            site_id=int(site_id) if site_id else None,
            status="online",
            secret=secret,
            last_seen=datetime.now(timezone.utc),
            last_heartbeat=datetime.now(timezone.utc),
        )

        return JsonResponse({
            "agent_id": agent.agent_id,
            "secret": agent.secret,
            "hostname": agent.hostname,
            "status": agent.status,
        }, status=201)


@method_decorator(csrf_exempt, name="dispatch")
class AgentHeartbeatView(View):
    """POST /api/agents/heartbeat/ - Agent heartbeat"""

    def post(self, request):
        import json
        body = json.loads(request.body)
        agent_id = body.get("agent_id", "")

        try:
            agent = Agent.objects.get(agent_id=agent_id)
        except Agent.DoesNotExist:
            return JsonResponse({"error": "Agent not found"}, status=404)

        now = datetime.now(timezone.utc)
        agent.status = "online"
        agent.last_seen = now
        agent.last_heartbeat = now

        # Update any provided fields
        for field in ["hostname", "version", "operating_system", "plat", "goarch",
                       "cpu_model", "cpu_cores", "total_ram", "os_name", "os_version",
                       "public_ip", "local_ip", "logged_in_user"]:
            if field in body and body[field] is not None:
                setattr(agent, field, body[field])

        agent.save()
        return JsonResponse({"status": "ok"})


urlpatterns = [
    path("", AgentListView.as_view(), name="agent-list"),
    path("<uuid:agent_id>/", AgentDetailView.as_view(), name="agent-detail"),
    path("<uuid:agent_id>/commands/", AgentCommandsView.as_view(), name="agent-commands"),
    path("<uuid:agent_id>/history/", AgentHistoryView.as_view(), name="agent-history"),
    path("enroll/", AgentEnrollView.as_view(), name="agent-enroll"),
    path("heartbeat/", AgentHeartbeatView.as_view(), name="agent-heartbeat"),
]
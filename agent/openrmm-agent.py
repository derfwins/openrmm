#!/usr/bin/env python3
"""OpenRMM Agent - Reports system info and heartbeats to the RMM server."""

import argparse
import json
import logging
import os
import platform
import signal
import socket
import sys
import time
import uuid
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError

# Config
AGENT_VERSION = "0.2.1"
HEARTBEAT_INTERVAL = 30
BACKOFF_MAX = 60
ID_FILE = Path(os.path.expanduser("~")) / ".openrmm-agent-id"

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("agent.log"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger("openrmm-agent")

# State
running = True
backoff = 1


def signal_handler(sig, frame):
    global running
    log.info("Shutdown signal received")
    running = False


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


def get_agent_id() -> str:
    if ID_FILE.exists():
        return ID_FILE.read_text().strip()
    agent_id = str(uuid.uuid4())
    ID_FILE.write_text(agent_id)
    return agent_id


def get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return ""


def get_public_ip() -> str:
    for url in ["https://api.ipify.org", "https://ifconfig.me"]:
        try:
            req = Request(url, headers={"User-Agent": "OpenRMM-Agent/0.2.0"})
            return urlopen(req, timeout=5).read().decode().strip()
        except Exception:
            continue
    return ""


def get_system_info() -> dict:
    info = {
        "hostname": socket.gethostname(),
        "version": AGENT_VERSION,
        "operating_system": platform.system(),
        "plat": platform.system().lower(),
        "goarch": platform.machine(),
        "os_name": platform.system(),
        "os_version": platform.version(),
        "public_ip": get_public_ip(),
        "local_ip": get_local_ip(),
        "cpu_model": "",
        "cpu_cores": 0,
        "total_ram": 0,
        "logged_in_user": "",
        "disks_json": "[]",
        "memory_json": "{}",
        "uptime_seconds": 0,
        "logged_in_users": "[]",
        "running_processes": 0,
        "cpu_percent": 0.0,
    }

    try:
        import psutil
        info["cpu_cores"] = psutil.cpu_count(logical=True) or 0
        mem = psutil.virtual_memory()
        info["total_ram"] = mem.total
        info["logged_in_user"] = os.getlogin() if hasattr(os, "getlogin") else ""

        # CPU model
        if platform.system() == "Linux":
            try:
                with open("/proc/cpuinfo") as f:
                    for line in f:
                        if "model name" in line:
                            info["cpu_model"] = line.split(":")[1].strip()
                            break
            except Exception:
                pass
        else:
            info["cpu_model"] = platform.processor()

        # Enhanced monitoring fields
        # Disks
        disks = []
        for part in psutil.disk_partitions():
            try:
                usage = psutil.disk_usage(part.mountpoint)
                disks.append({
                    "drive": part.mountpoint,
                    "total_gb": round(usage.total / (1024**3), 2),
                    "used_gb": round(usage.used / (1024**3), 2),
                    "free_gb": round(usage.free / (1024**3), 2),
                    "percent": usage.percent,
                })
            except Exception:
                continue
        info["disks_json"] = json.dumps(disks)

        # Memory
        info["memory_json"] = json.dumps({
            "total_gb": round(mem.total / (1024**3), 2),
            "used_gb": round(mem.used / (1024**3), 2),
            "available_gb": round(mem.available / (1024**3), 2),
            "percent": mem.percent,
        })

        # Uptime
        info["uptime_seconds"] = int(time.time() - psutil.boot_time())

        # Logged in users (unique)
        try:
            users = list(set(u.name for u in psutil.users()))
            info["logged_in_users"] = json.dumps(users)
        except Exception:
            pass

        # Running processes
        try:
            info["running_processes"] = len(psutil.pids())
        except Exception:
            pass

        # CPU percent
        info["cpu_percent"] = psutil.cpu_percent(interval=1)

        # Services
        try:
            services = []
            for svc in psutil.win_service_iter() if platform.system() == "Windows" else []:
                try:
                    services.append({"name": svc.name(), "display_name": svc.display_name(), "status": svc.status(), "start_type": svc.start_type()})
                except Exception:
                    continue
            # Limit to 200 services to keep payload reasonable
            info["services_json"] = json.dumps(services[:200])
        except Exception:
            # Non-Windows or psutil without win_service_iter
            try:
                # Linux: parse systemctl
                import subprocess
                result = subprocess.run(["systemctl", "list-units", "--type=service", "--no-pager", "--no-legend"], capture_output=True, text=True, timeout=10)
                services = []
                for line in result.stdout.strip().split("\n")[:200]:
                    parts = line.split()
                    if len(parts) >= 4:
                        services.append({"name": parts[0], "display_name": " ".join(parts[4:]), "status": parts[2], "start_type": parts[3] if len(parts) > 3 else ""})
                info["services_json"] = json.dumps(services)
            except Exception:
                pass

    except ImportError:
        log.warning("psutil not installed - limited system info")

    return info


def heartbeat(server: str, agent_id: str, info: dict) -> dict | None:
    """Send heartbeat, return response dict or None on failure."""
    payload = {"agent_id": agent_id, **info}
    url = f"{server.rstrip('/')}/agents/heartbeat/"
    try:
        data = json.dumps(payload).encode()
        req = Request(url, data=data, headers={"Content-Type": "application/json", "User-Agent": "OpenRMM-Agent/0.2.0"})
        resp = urlopen(req, timeout=10)
        result = json.loads(resp.read())
        log.info("Heartbeat OK: %s", result.get("status"))
        return result
    except URLError as e:
        log.error("Heartbeat failed: %s", e)
        return None
    except Exception as e:
        log.error("Heartbeat error: %s", e)
        return None


def auto_update(server: str, current_version: str, latest_version: str) -> None:
    """Download and apply agent update if available."""
    if latest_version == current_version:
        return
    log.info("Update available: %s -> %s, downloading...", current_version, latest_version)
    try:
        url = f"{server.rstrip('/')}/agents/download/openrmm-agent.py"
        req = Request(url, headers={"User-Agent": "OpenRMM-Agent/0.2.0"})
        new_code = urlopen(req, timeout=30).read()
        # Verify it's valid Python by checking for our marker
        if b"AGENT_VERSION" not in new_code:
            log.error("Downloaded file doesn't look like a valid agent")
            return
        # Write to temp file first
        script_path = os.path.abspath(__file__)
        tmp_path = script_path + ".new"
        with open(tmp_path, "wb") as f:
            f.write(new_code)
        # Replace current script
        backup_path = script_path + ".bak"
        if os.path.exists(backup_path):
            os.remove(backup_path)
        os.rename(script_path, backup_path)
        os.rename(tmp_path, script_path)
        log.info("Update applied: %s -> %s. Restarting...", current_version, latest_version)
        # Restart self
        os.execv(sys.executable, [sys.executable] + sys.argv)
    except Exception as e:
        log.error("Auto-update failed: %s", e)
        # Restore backup if exists
        script_path = os.path.abspath(__file__)
        backup_path = script_path + ".bak"
        if os.path.exists(backup_path):
            try:
                os.rename(backup_path, script_path)
                log.info("Restored from backup")
            except Exception:
                pass


def main():
    parser = argparse.ArgumentParser(description="OpenRMM Agent")
    parser.add_argument("--server", required=True, help="RMM server URL (e.g. https://rmm.derfwins.com)")
    parser.add_argument("--client-id", type=int, required=True, help="Client ID")
    parser.add_argument("--site-id", type=int, required=True, help="Site ID")
    parser.add_argument("--agent-type", default="server", choices=["server", "workstation"])
    args = parser.parse_args()

    agent_id = get_agent_id()
    log.info("OpenRMM Agent v%s starting", AGENT_VERSION)
    log.info("Agent ID: %s", agent_id)
    log.info("Server: %s", args.server)

    global backoff

    while running:
        info = get_system_info()
        result = heartbeat(args.server, agent_id, info)
        if result:
            backoff = 1
            # Check for auto-update
            update_ver = result.get("update_available")
            if update_ver:
                auto_update(args.server, AGENT_VERSION, update_ver)
        else:
            log.warning("Next retry in %ds", backoff)
            time.sleep(backoff)
            backoff = min(backoff * 2, BACKOFF_MAX)
            continue

        # Wait for next heartbeat
        for _ in range(HEARTBEAT_INTERVAL):
            if not running:
                break
            time.sleep(1)

    log.info("Agent stopped")


if __name__ == "__main__":
    main()
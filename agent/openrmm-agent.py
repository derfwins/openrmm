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
AGENT_VERSION = "0.1.0"
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
            req = Request(url, headers={"User-Agent": "openrmm-agent"})
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
    }

    try:
        import psutil
        info["cpu_cores"] = psutil.cpu_count(logical=True) or 0
        info["total_ram"] = psutil.virtual_memory().total
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
    except ImportError:
        log.warning("psutil not installed - limited system info")

    return info


def heartbeat(server: str, agent_id: str, info: dict) -> bool:
    payload = {"agent_id": agent_id, **info}
    url = f"{server.rstrip('/')}/agents/heartbeat/"
    try:
        data = json.dumps(payload).encode()
        req = Request(url, data=data, headers={"Content-Type": "application/json"})
        resp = urlopen(req, timeout=10)
        result = json.loads(resp.read())
        log.info("Heartbeat OK: %s", result.get("status"))
        return True
    except URLError as e:
        log.error("Heartbeat failed: %s", e)
        return False
    except Exception as e:
        log.error("Heartbeat error: %s", e)
        return False


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
        if heartbeat(args.server, agent_id, info):
            backoff = 1
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
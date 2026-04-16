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
AGENT_VERSION = "0.5.1"
HEARTBEAT_INTERVAL = 30
BACKOFF_MAX = 60
ID_FILE = Path(os.path.expanduser("~")) / ".openrmm-agent-id"

# Logging - use absolute path for reliability after os.execv()
LOG_DIR = Path(os.path.dirname(os.path.abspath(__file__)))
LOG_FILE = LOG_DIR / "agent.log"
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(str(LOG_FILE)),
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
        # Restart self - use subprocess on Windows (os.execv unreliable), execv on Unix
        if platform.system() == "Windows":
            import subprocess
            subprocess.Popen(
                [sys.executable] + sys.argv,
                cwd=os.path.dirname(os.path.abspath(__file__)),
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
            )
            sys.exit(0)
        else:
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


def ws_agent_loop(server: str, agent_id: str):
    """Persistent WebSocket connection to server for terminal relay."""
    try:
        import websockets
        log.info("websockets library loaded successfully")
    except ImportError:
        log.warning("websockets not installed - remote terminal unavailable. Install with: pip install websockets")
        return

    ws_backoff = 1
    while running:
        try:
            import asyncio
            asyncio.run(ws_agent_connect(server, agent_id))
            # Clean disconnect — wait a bit before reconnecting
            ws_backoff = 1
            time.sleep(2)
        except KeyboardInterrupt:
            break
        except Exception as e:
            log.error("WebSocket error: %s, retrying in %ds", e, ws_backoff)
            time.sleep(ws_backoff)
            ws_backoff = min(ws_backoff * 2, 60)
            continue
    log.info("WebSocket loop exiting")


async def ws_agent_connect(server: str, agent_id: str):
    """Connect to server WebSocket and handle terminal sessions."""
    import asyncio
    import websockets
    import threading
    import subprocess
    import queue

    # Build WS URL from server HTTP URL
    ws_url = server.replace("https://", "wss://").replace("http://", "ws://")
    ws_url = f"{ws_url.rstrip('/')}/ws/agent/{agent_id}/"

    log.info("Connecting to WebSocket: %s", ws_url)
    async with websockets.connect(
        ws_url,
        additional_headers={"User-Agent": "OpenRMM-Agent"},
        ping_interval=30,
        ping_timeout=10,
        close_timeout=5,
    ) as ws:
        log.info("WebSocket connected to server")

        # Track active terminal sessions: session_id -> { proc, input_queue, output_queue }
        sessions: dict = {}

        async def send_output_loop():
            """Send terminal output from subprocess to WebSocket."""
            while True:
                for sid, sess in list(sessions.items()):
                    try:
                        output = sess["output_queue"].get_nowait()
                        await ws.send(json.dumps(output))
                        if output.get("type") == "exit":
                            del sessions[sid]
                    except Exception:
                        pass
                await asyncio.sleep(0.05)  # 50ms poll interval

        # Start output sender
        send_task = asyncio.create_task(send_output_loop())

        try:
            async for message in ws:
                try:
                    data = json.loads(message)
                    msg_type = data.get("type")
                    log.info("WS received: %s", msg_type)

                    if msg_type == "terminal_start":
                        session_id = data["session_id"]
                        log.info("Terminal session started: %s", session_id)
                        input_q: queue.Queue = queue.Queue()
                        output_q: queue.Queue = queue.Queue()

                        # Determine shell - use powershell on Windows for better interactive support
                        if platform.system() == "Windows":
                            cmd = ["powershell.exe", "-NoLogo", "-NoExit", "-Command", "-"]
                            creationflags = subprocess.CREATE_NEW_PROCESS_GROUP
                        else:
                            cmd = ["/bin/bash", "-i"]
                            creationflags = 0

                        proc = subprocess.Popen(
                            cmd,
                            stdin=subprocess.PIPE,
                            stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT,
                            bufsize=0,
                            creationflags=creationflags,
                        )

                        sessions[session_id] = {
                            "proc": proc,
                            "input_queue": input_q,
                            "output_queue": output_q,
                        }

                        # Read output in a thread
                        def read_output(p=proc, sid=session_id, oq=output_q):
                            try:
                                while p.poll() is None:
                                    chunk = p.stdout.read(4096)
                                    if chunk:
                                        oq.put({"type": "output", "session_id": sid, "data": chunk.decode(errors="replace")})
                                # Process exited
                                oq.put({"type": "exit", "session_id": sid, "code": p.returncode})
                            except Exception as e:
                                oq.put({"type": "exit", "session_id": sid, "code": -1, "message": str(e)})

                        t = threading.Thread(target=read_output, daemon=True)
                        t.start()

                        # Write input in a thread
                        def write_input(p=proc, iq=input_q):
                            try:
                                while p.poll() is None:
                                    try:
                                        inp = iq.get(timeout=0.5)
                                        if inp.get("type") == "input":
                                            p.stdin.write(inp["data"].encode())
                                            p.stdin.flush()
                                    except queue.Empty:
                                        continue
                            except Exception:
                                pass

                        t2 = threading.Thread(target=write_input, daemon=True)
                        t2.start()

                    elif msg_type == "input":
                        session_id = data.get("session_id")
                        sess = sessions.get(session_id)
                        if sess:
                            sess["input_queue"].put(data)

                    elif msg_type == "terminal_kill":
                        session_id = data.get("session_id")
                        sess = sessions.get(session_id)
                        if sess:
                            try:
                                sess["proc"].terminate()
                            except Exception:
                                pass
                            sessions.pop(session_id, None)

                    elif msg_type == "ping":
                        await ws.send(json.dumps({"type": "pong"}))
                        log.debug("Sent pong")

                    elif msg_type == "resize":
                        pass  # TODO

                except Exception as e:
                    log.error("WebSocket message error: %s", e)
        finally:
            send_task.cancel()
            # Kill all terminal sessions
            for sid, sess in sessions.items():
                try:
                    sess["proc"].terminate()
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

    # Start WebSocket connection in background thread
    import threading
    ws_thread = threading.Thread(target=ws_agent_loop, args=(args.server, agent_id), daemon=True)
    ws_thread.start()

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
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
import base64
import io
import struct

# Config
AGENT_VERSION = "0.9.2"
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


# --- Screen Capture & Input Simulation ---

def _init_screen_capture_windows():
    """Initialize Windows screen capture. Tries mss+av (H.264) first, falls back to JPEG."""
    import ctypes
    import ctypes.wintypes

    user32 = ctypes.windll.user32
    gdi32 = ctypes.windll.gdi32
    kernel32 = ctypes.windll.kernel32
    advapi32 = ctypes.windll.advapi32

    def _enable_privilege(name):
        """Enable a Windows privilege for the current process."""
        try:
            token = ctypes.c_void_p()
            advapi32.OpenProcessToken(kernel32.GetCurrentProcess(), 0x0028, ctypes.byref(token))
            luid = ctypes.create_string_buffer(8)
            advapi32.LookupPrivilegeValueW(None, name, luid)
            tp = ctypes.create_string_buffer(16)  # LUID + Attributes
            ctypes.memmove(tp, luid, 8)
            struct.pack_into('I', tp, 8, 2)  # SE_PRIVILEGE_ENABLED
            advapi32.AdjustTokenPrivileges(token, False, tp, 0, None, None)
            kernel32.CloseHandle(token)
        except Exception:
            pass

    # Detect H.264 encoding availability
    has_mss = False
    has_av = False
    try:
        import mss
        has_mss = True
    except ImportError:
        pass
    try:
        import av
        has_av = True
    except ImportError:
        pass

    h264_available = has_mss and has_av
    log.info("Screen capture: mss=%s av=%s h264=%s", has_mss, has_av, h264_available)

    # --- Legacy BitBlt/PIL fallback (JPEG mode) ---
    SRCCOPY = 0x00CC0020
    DIB_RGB_COLORS = 0
    BI_RGB = 0

    class BITMAPINFOHEADER(ctypes.Structure):
        _fields_ = [
            ("biSize", ctypes.wintypes.DWORD),
            ("biWidth", ctypes.wintypes.LONG),
            ("biHeight", ctypes.wintypes.LONG),
            ("biPlanes", ctypes.wintypes.WORD),
            ("biBitCount", ctypes.wintypes.WORD),
            ("biCompression", ctypes.wintypes.DWORD),
            ("biSizeImage", ctypes.wintypes.DWORD),
            ("biXPelsPerMeter", ctypes.wintypes.LONG),
            ("biYPelsPerMeter", ctypes.wintypes.LONG),
            ("biClrUsed", ctypes.wintypes.DWORD),
            ("biClrImportant", ctypes.wintypes.DWORD),
        ]

    class BITMAPINFO(ctypes.Structure):
        _fields_ = [
            ("bmiHeader", BITMAPINFOHEADER),
            ("bmiColors", ctypes.c_uint32 * 3),
        ]

    # Determine legacy capture method
    capture_method = "unknown"
    test_winsta = user32.OpenWindowStationW("WinSta0", False, 0x0037)
    if test_winsta:
        old_winsta = user32.GetProcessWindowStation()
        if user32.SetProcessWindowStation(test_winsta):
            test_desktop = user32.OpenDesktopW("Default", 0, False, 0x003f)
            if test_desktop:
                old_desktop = user32.GetThreadDesktop(kernel32.GetCurrentThreadId())
                if user32.SetThreadDesktop(test_desktop):
                    capture_method = "bitblt_interactive"
                    user32.SetThreadDesktop(old_desktop)
                user32.CloseDesktop(test_desktop)
            user32.SetProcessWindowStation(old_winsta)
        user32.CloseWindowStation(test_winsta)

    if capture_method == "unknown":
        try:
            from PIL import ImageGrab
            _test = ImageGrab.grab()
            _test.close()
            capture_method = "pil_imagegrab"
        except Exception:
            pass

    if capture_method == "unknown":
        hdc = user32.GetDC(0)
        if hdc:
            width = user32.GetSystemMetrics(0)
            height = user32.GetSystemMetrics(1)
            if width > 0 and height > 0:
                hdc_mem = gdi32.CreateCompatibleDC(hdc)
                hbitmap = gdi32.CreateCompatibleBitmap(hdc, width, height)
                gdi32.SelectObject(hdc_mem, hbitmap)
                if gdi32.BitBlt(hdc_mem, 0, 0, width, height, hdc, 0, 0, SRCCOPY):
                    capture_method = "bitblt_current"
                gdi32.DeleteObject(hbitmap)
                gdi32.DeleteDC(hdc_mem)
            user32.ReleaseDC(0, hdc)

    if capture_method == "unknown":
        capture_method = "printwindow"

    log.info("Legacy capture method: %s", capture_method)

    # --- H.264 encoder state (lazily initialized per session) ---
    _h264_state = {}  # Populated by capture_init_h264

    def capture_init_h264(fps=30, quality_crf=23):
        """Initialize mss + av H.264 capture session. Returns (width, height) or raises."""
        import mss
        import av as av_mod
        import numpy as np
        nonlocal _h264_state

        # When running as SYSTEM, switch to interactive desktop
        old_winsta = None
        old_desktop = None
        if platform.system() == "Windows":
            try:
                old_winsta = user32.GetProcessWindowStation()
                winsta = user32.OpenWindowStationW("WinSta0", False, 0x0037)
                if winsta:
                    user32.SetProcessWindowStation(winsta)
                    desktop = user32.OpenDesktopW("Default", 0, False, 0x003f)
                    if desktop:
                        old_desktop = user32.GetThreadDesktop(kernel32.GetCurrentThreadId())
                        user32.SetThreadDesktop(desktop)
                        log.info("H.264: switched to interactive desktop")
            except Exception as e:
                log.warning("H.264: desktop switch failed: %s", e)

        sct = mss.mss()
        monitor = sct.monitors[0] if sct.monitors else None
        if not monitor:
            raise RuntimeError("No monitor found by mss")

        w = monitor['width']
        h = monitor['height']

        # Create an in-memory container; we encode to raw H.264 packets
        # Use a pipe to get raw packets without container overhead
        import subprocess as sp
        # We'll use av's Codec approach for direct packet access
        codec = av_mod.Codec('h264', 'w')
        stream = codec.create()
        stream.width = w
        stream.height = h
        stream.pix_fmt = 'yuv420p'
        stream.options = {
            'preset': 'ultrafast',
            'tune': 'zerolatency',
            'crf': str(quality_crf),
        }
        # Need a container for stream.encode() - use null format
        container = av_mod.open('/dev/null', 'w', format='null')
        vstream = container.add_stream('h264', rate=fps)
        vstream.width = w
        vstream.height = h
        vstream.pix_fmt = 'yuv420p'
        vstream.options = {
            'preset': 'ultrafast',
            'tune': 'zerolatency',
            'crf': str(quality_crf),
        }

        _h264_state = {
            'sct': sct,
            'monitor': monitor,
            'container': container,
            'stream': vstream,
            'width': w,
            'height': h,
            'frame_count': 0,
            'gop_size': 30,  # Keyframe every 30 frames
        }
        return w, h

    def capture_frame_h264():
        """Capture one frame and encode as H.264. Returns (frame_type, bytes) or None.
        frame_type: 0x01=keyframe, 0x02=delta"""
        import numpy as np
        state = _h264_state
        if not state:
            return None

        try:
            img = state['sct'].grab(state['monitor'])
            # mss returns BGRA raw pixels
            arr = np.frombuffer(img.raw, dtype=np.uint8).reshape(
                (img.height, img.width, 4)
            )
            import av as av_mod
            frame = av_mod.VideoFrame.from_ndarray(arr, format='bgra')
            packets = state['stream'].encode(frame)

            state['frame_count'] += 1

            result = b''
            is_keyframe = False
            for pkt in packets:
                if pkt.is_keyframe:
                    is_keyframe = True
                result += bytes(pkt)

            if not result:
                return None

            ftype = 0x01 if is_keyframe else 0x02
            return (ftype, result)
        except Exception as e:
            log.error("H.264 capture error: %s", e)
            return None

    def capture_flush_h264():
        """Flush remaining encoded packets from the H.264 encoder."""
        state = _h264_state
        if not state:
            return []
        try:
            packets = state['stream'].encode()
            results = []
            for pkt in packets:
                results.append((0x02, bytes(pkt)))  # Flush is always delta
            return results
        except Exception:
            return []

    def capture_cleanup_h264():
        """Release H.264 capture resources."""
        nonlocal _h264_state
        state = _h264_state
        if state:
            try:
                state['container'].close()
            except Exception:
                pass
            try:
                state['sct'].close()
            except Exception:
                pass
            # Restore original desktop
            if platform.system() == "Windows":
                try:
                    if state.get('old_desktop'):
                        user32.SetThreadDesktop(state['old_desktop'])
                    if state.get('old_winsta'):
                        user32.SetProcessWindowStation(state['old_winsta'])
                except Exception:
                    pass
        _h264_state = {}

    # --- Screen capture helper (runs in user session) ---
    _capture_helper_running = False
    _capture_pipe_name = "OpenRMM_Capture_" + str(uuid.uuid4())[:8]

    def _start_capture_helper():
        """Spawn a capture helper process in the user's interactive session."""
        nonlocal _capture_helper_running
        if _capture_helper_running:
            return True

        try:
            advapi32 = ctypes.windll.advapi32
            wtsapi32 = ctypes.windll.wtsapi32
            userenv = ctypes.windll.userenv

            # Enable required privileges
            _enable_privilege("SeIncreaseQuotaPrivilege")
            _enable_privilege("SeAssignPrimaryTokenPrivilege")

            # Get the active console session ID
            session_id = kernel32.WTSGetActiveConsoleSessionId()
            if session_id == 0xFFFFFFFF:
                log.error("No active console session")
                return False

            # Get user token from the session
            user_token = ctypes.c_void_p()
            if not wtsapi32.WTSQueryUserToken(session_id, ctypes.byref(user_token)):
                log.error("WTSQueryUserToken failed: %d", ctypes.get_last_error())
                return False

            try:
                # Write the helper script
                import tempfile
                helper_path = os.path.join(tempfile.gettempdir(), 'openrmm_capture_helper.py')
                pipe_name = _capture_pipe_name
                with open(helper_path, 'w') as f:
                    f.write(CAPTURE_HELPER_SCRIPT.format(pipe_name=pipe_name))

                # Launch helper as user
                cmd = f'pythonw.exe "{helper_path}"'
                cmd_buf = ctypes.create_unicode_buffer(cmd)

                # Set up STARTUPINFO
                si = _create_startup_info()
                pi = ctypes.create_string_buffer(16)  # PROCESS_INFORMATION

                # Create the environment block for the user
                env_block = ctypes.c_void_p()
                userenv.CreateEnvironmentBlock(ctypes.byref(env_block), user_token, False)

                success = advapi32.CreateProcessAsUserW(
                    user_token, None, cmd_buf, None, None,
                    False,  # don't inherit handles
                    0x04000000,  # CREATE_NO_WINDOW
                    env_block,  # use user's environment
                    None, si, pi
                )

                if env_block.value:
                    userenv.DestroyEnvironmentBlock(env_block)

                if not success:
                    log.error("CreateProcessAsUserW failed: %d", ctypes.get_last_error())
                    return False

                hproc = struct.unpack_from('I', pi, 0)[0]
                hthread = struct.unpack_from('I', pi, 4)[0]
                kernel32.CloseHandle(hthread)
                kernel32.CloseHandle(hproc)

                # Wait briefly for the helper to start its pipe server
                import time
                time.sleep(1.0)
                _capture_helper_running = True
                log.info("Capture helper started in session %d (pipe=%s)", session_id, pipe_name)
                return True

            finally:
                kernel32.CloseHandle(user_token)
        except Exception as e:
            log.error("Failed to start capture helper: %s", e, exc_info=True)
            return False

    def _create_startup_info():
        """Create STARTUPINFOW structure for CreateProcessAsUserW."""
        # STARTUPINFOW is 104 bytes on x64
        si = ctypes.create_string_buffer(104)
        struct.pack_into('I', si, 0, 104)  # cb = sizeof(STARTUPINFOW)
        # wShowWindow = SW_HIDE (offset 48, 2 bytes)
        struct.pack_into('H', si, 48, 0)
        # dwFlags = STARTF_USESHOWWINDOW (offset 44, 4 bytes)
        struct.pack_into('I', si, 44, 1)
        return si

    def capture_screen(quality=55):
        """Capture screen via helper process in user session. Returns (jpeg_bytes, w, h)."""
        if not _capture_helper_running:
            if not _start_capture_helper():
                return None, 0, 0

        try:
            import win32pipe
            import win32file
            pipe_path = f'\\\\.\\pipe\\{_capture_pipe_name}'
            handle = win32file.CreateFile(
                pipe_path,
                win32file.GENERIC_READ | win32file.GENERIC_WRITE,
                0, None, win32file.OPEN_EXISTING, 0, None
            )
            # Send capture request: "CAPTURE quality\n"
            win32file.WriteFile(handle, f'CAPTURE {quality}\n'.encode())
            # Read response: 4-byte width + 4-byte height + JPEG data
            result = b''
            while True:
                _, data = win32file.ReadFile(handle, 65536)
                if not data:
                    break
                result += data
                if len(data) < 65536:
                    break
            win32file.CloseHandle(handle)

            if len(result) < 8:
                return None, 0, 0
            w, h = struct.unpack('II', result[:8])
            jpeg = result[8:]
            return jpeg, w, h
        except Exception as e:
            log.error("capture_screen pipe error: %s", e)
            return None, 0, 0

    # The helper script that runs in the user's interactive session
    CAPTURE_HELPER_SCRIPT = '''
import ctypes
import struct
import io
import sys
import time
import win32pipe
import win32file
import win32event

PIPE_NAME = "\\\\\\\\.\\\\pipe\\\\{pipe_name}"

def capture_screen(quality=55):
    """Capture screen using mss and return as JPEG."""
    try:
        import mss
        import numpy as np
        from PIL import Image
        sct = mss.mss()
        monitor = sct.monitors[0] if sct.monitors else None
        if not monitor:
            return None, 0, 0
        img = sct.grab(monitor)
        arr = np.frombuffer(img.raw, dtype=np.uint8).reshape((img.height, img.width, 4))
        rgb_arr = arr[:, :, [2, 1, 0]]
        pil_img = Image.fromarray(rgb_arr, 'RGB')
        out = io.BytesIO()
        pil_img.save(out, format='JPEG', quality=quality)
        return out.getvalue(), img.width, img.height
    except Exception as e:
        sys.stderr.write(f"capture error: {{e}}\\n")
        return None, 0, 0

def main():
    # Create named pipe server
    pipe = win32pipe.CreateNamedPipe(
        PIPE_NAME,
        win32pipe.PIPE_ACCESS_DUPLEX,
        win32pipe.PIPE_TYPE_BYTE | win32pipe.PIPE_READMODE_BYTE | win32pipe.PIPE_WAIT,
        1,  # max instances
        65536,  # out buffer
        65536,  # in buffer
        5000,  # timeout ms
        None
    )

    while True:
        try:
            win32pipe.ConnectNamedPipe(pipe, None)

            # Read request
            _, data = win32file.ReadFile(pipe, 256)
            request = data.decode('utf-8', errors='ignore').strip()

            if request.startswith('CAPTURE'):
                parts = request.split()
                quality = int(parts[1]) if len(parts) > 1 else 55
                jpeg, w, h = capture_screen(quality)
                if jpeg and w > 0:
                    header = struct.pack('II', w, h)
                    win32file.WriteFile(pipe, header + jpeg)
                else:
                    win32file.WriteFile(pipe, struct.pack('II', 0, 0))

            win32pipe.DisconnectNamedPipe(pipe)
        except Exception:
            time.sleep(0.1)

main()
'''

    return capture_screen, h264_available, capture_init_h264, capture_frame_h264, capture_flush_h264, capture_cleanup_h264


def _init_screen_capture_linux():
    """Initialize Linux screen capture. Tries mss+av (H.264) first, falls back to JPEG."""
    has_mss = False
    has_av = False
    try:
        import mss
        has_mss = True
    except ImportError:
        pass
    try:
        import av
        has_av = True
    except ImportError:
        pass

    h264_available = has_mss and has_av
    log.info("Screen capture: mss=%s av=%s h264=%s", has_mss, has_av, h264_available)

    _h264_state = {}

    def capture_init_h264(fps=30, quality_crf=23):
        """Initialize mss + av H.264 capture session. Returns (width, height) or raises."""
        import mss
        import av as av_mod
        nonlocal _h264_state

        sct = mss.mss()
        monitor = sct.monitors[0] if sct.monitors else None
        if not monitor:
            raise RuntimeError("No monitor found by mss")

        w = monitor['width']
        h = monitor['height']

        container = av_mod.open('/dev/null', 'w', format='null')
        vstream = container.add_stream('h264', rate=fps)
        vstream.width = w
        vstream.height = h
        vstream.pix_fmt = 'yuv420p'
        vstream.options = {
            'preset': 'ultrafast',
            'tune': 'zerolatency',
            'crf': str(quality_crf),
        }

        _h264_state = {
            'sct': sct,
            'monitor': monitor,
            'container': container,
            'stream': vstream,
            'width': w,
            'height': h,
            'frame_count': 0,
            'gop_size': 30,
            'old_winsta': old_winsta,
            'old_desktop': old_desktop,
        }
        return w, h

    def capture_frame_h264():
        """Capture one frame and encode as H.264. Returns (frame_type, bytes) or None."""
        import numpy as np
        state = _h264_state
        if not state:
            return None
        try:
            img = state['sct'].grab(state['monitor'])
            arr = np.frombuffer(img.raw, dtype=np.uint8).reshape(
                (img.height, img.width, 4)
            )
            import av as av_mod
            frame = av_mod.VideoFrame.from_ndarray(arr, format='bgra')
            packets = state['stream'].encode(frame)
            state['frame_count'] += 1
            is_keyframe = (state['frame_count'] % state['gop_size'] == 1)
            result = b''
            for pkt in packets:
                result += bytes(pkt)
            if not result:
                return None
            return (0x01 if is_keyframe else 0x02, result)
        except Exception as e:
            log.error("H.264 capture error: %s", e)
            return None

    def capture_flush_h264():
        state = _h264_state
        if not state:
            return []
        try:
            packets = state['stream'].encode()
            return [(0x02, bytes(pkt)) for pkt in packets]
        except Exception:
            return []

    def capture_cleanup_h264():
        nonlocal _h264_state
        state = _h264_state
        if state:
            try:
                state['container'].close()
            except Exception:
                pass
            try:
                state['sct'].close()
            except Exception:
                pass
        _h264_state = {}

    def capture_screen(quality=55):
        """Capture screen and return JPEG bytes (legacy fallback)."""
        try:
            import subprocess
            result = subprocess.run(
                ['xdotool', 'selectdesktop'],
                capture_output=True, text=True, timeout=2
            )
            result = subprocess.run(
                ['import', '-window', 'root', '-resize', '50%', '-quality', str(quality), 'jpg:-'],
                capture_output=True, timeout=3
            )
            if result.returncode == 0 and result.stdout:
                dim_result = subprocess.run(
                    ['xdpyinfo'], capture_output=True, text=True, timeout=2
                )
                w, h = 1920, 1080
                for line in dim_result.stdout.split('\n'):
                    if 'dimensions:' in line:
                        parts = line.split('dimensions:')[1].strip().split('x')
                        if len(parts) >= 2:
                            w, h = int(parts[0]), int(parts[1].split()[0])
                return result.stdout, w, h
        except Exception as e:
            log.debug("Linux screen capture failed: %s", e)

        try:
            from PIL import ImageGrab
            img = ImageGrab.grab()
            buf = io.BytesIO()
            img.save(buf, format='JPEG', quality=quality)
            return buf.getvalue(), img.width, img.height
        except Exception as e:
            log.debug("PIL screen capture failed: %s", e)

        return None, 0, 0

    return capture_screen, h264_available, capture_init_h264, capture_frame_h264, capture_flush_h264, capture_cleanup_h264


def _init_input_windows():
    """Initialize Windows input simulation via SendInput."""
    import ctypes
    import ctypes.wintypes

    user32 = ctypes.windll.user32

    # SendInput constants
    INPUT_MOUSE = 0
    INPUT_KEYBOARD = 1
    MOUSEEVENTF_MOVE = 0x0001
    MOUSEEVENTF_LEFTDOWN = 0x0002
    MOUSEEVENTF_LEFTUP = 0x0004
    MOUSEEVENTF_RIGHTDOWN = 0x0008
    MOUSEEVENTF_RIGHTUP = 0x0010
    MOUSEEVENTF_MIDDLEDOWN = 0x0020
    MOUSEEVENTF_MIDDLEUP = 0x0040
    MOUSEEVENTF_WHEEL = 0x0800
    MOUSEEVENTF_ABSOLUTE = 0x8000
    KEYEVENTF_KEYUP = 0x0002
    KEYEVENTF_UNICODE = 0x0004

    class MOUSEINPUT(ctypes.Structure):
        _fields_ = [
            ("dx", ctypes.wintypes.LONG),
            ("dy", ctypes.wintypes.LONG),
            ("mouseData", ctypes.wintypes.DWORD),
            ("dwFlags", ctypes.wintypes.DWORD),
            ("time", ctypes.wintypes.DWORD),
            ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
        ]

    class KEYBDINPUT(ctypes.Structure):
        _fields_ = [
            ("wVk", ctypes.wintypes.WORD),
            ("wScan", ctypes.wintypes.WORD),
            ("dwFlags", ctypes.wintypes.DWORD),
            ("time", ctypes.wintypes.DWORD),
            ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
        ]

    class INPUT_UNION(ctypes.Union):
        _fields_ = [
            ("mi", MOUSEINPUT),
            ("ki", KEYBDINPUT),
        ]

    class INPUT(ctypes.Structure):
        _fields_ = [
            ("type", ctypes.wintypes.DWORD),
            ("ii", INPUT_UNION),
        ]

    # Virtual key code map for common keys
    VK_MAP = {
        'Shift': 0x10, 'Control': 0x11, 'Alt': 0x12, 'Meta': 0x5B,
        'Enter': 0x0D, 'Tab': 0x09, 'Escape': 0x1B, 'Backspace': 0x08,
        'Delete': 0x2E, 'Insert': 0x2D, 'Home': 0x24, 'End': 0x23,
        'PageUp': 0x21, 'PageDown': 0x22,
        'ArrowUp': 0x26, 'ArrowDown': 0x28, 'ArrowLeft': 0x25, 'ArrowRight': 0x27,
        'F1': 0x70, 'F2': 0x71, 'F3': 0x72, 'F4': 0x73,
        'F5': 0x74, 'F6': 0x75, 'F7': 0x76, 'F8': 0x77,
        'F9': 0x78, 'F10': 0x79, 'F11': 0x7A, 'F12': 0x7B,
        'CapsLock': 0x14, 'NumLock': 0x90, 'ScrollLock': 0x91,
        ' ': 0x20, 'Space': 0x20,
    }

    extra = ctypes.pointer(ctypes.c_ulong(0))

    def send_mouse(action, x, y, button=0, delta=0):
        """Send mouse input to Windows."""
        width = user32.GetSystemMetrics(0)
        height = user32.GetSystemMetrics(1)
        if width == 0 or height == 0:
            return

        # Convert to absolute coordinates (0-65535 range)
        abs_x = int(x * 65535 / width)
        abs_y = int(y * 65535 / height)

        if action == 'move':
            inp = INPUT(type=INPUT_MOUSE, ii=INPUT_UNION(mi=MOUSEINPUT(
                dx=abs_x, dy=abs_y, mouseData=0,
                dwFlags=MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE,
                time=0, dwExtraInfo=extra,
            )))
            user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))

        elif action == 'down':
            flag = {0: MOUSEEVENTF_LEFTDOWN, 1: MOUSEEVENTF_MIDDLEDOWN, 2: MOUSEEVENTF_RIGHTDOWN}.get(button, MOUSEEVENTF_LEFTDOWN)
            # Move first, then click
            move_inp = INPUT(type=INPUT_MOUSE, ii=INPUT_UNION(mi=MOUSEINPUT(
                dx=abs_x, dy=abs_y, mouseData=0,
                dwFlags=MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE,
                time=0, dwExtraInfo=extra,
            )))
            click_inp = INPUT(type=INPUT_MOUSE, ii=INPUT_UNION(mi=MOUSEINPUT(
                dx=abs_x, dy=abs_y, mouseData=0,
                dwFlags=flag | MOUSEEVENTF_ABSOLUTE,
                time=0, dwExtraInfo=extra,
            )))
            inputs = (INPUT * 2)(move_inp, click_inp)
            user32.SendInput(2, inputs, ctypes.sizeof(INPUT))

        elif action == 'up':
            flag = {0: MOUSEEVENTF_LEFTUP, 1: MOUSEEVENTF_MIDDLEUP, 2: MOUSEEVENTF_RIGHTUP}.get(button, MOUSEEVENTF_LEFTUP)
            inp = INPUT(type=INPUT_MOUSE, ii=INPUT_UNION(mi=MOUSEINPUT(
                dx=abs_x, dy=abs_y, mouseData=0,
                dwFlags=flag | MOUSEEVENTF_ABSOLUTE,
                time=0, dwExtraInfo=extra,
            )))
            user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))

        elif action == 'wheel':
            inp = INPUT(type=INPUT_MOUSE, ii=INPUT_UNION(mi=MOUSEINPUT(
                dx=abs_x, dy=abs_y, mouseData=int(delta),
                dwFlags=MOUSEEVENTF_WHEEL | MOUSEEVENTF_ABSOLUTE,
                time=0, dwExtraInfo=extra,
            )))
            user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))

    def send_keyboard(action, key, code='', shift=False, ctrl=False, alt=False, meta=False):
        """Send keyboard input to Windows."""
        # Determine VK code
        vk = VK_MAP.get(key, 0)
        if vk == 0 and len(key) == 1:
            # Single character - use Unicode input
            inp = INPUT(type=INPUT_KEYBOARD, ii=INPUT_UNION(ki=KEYBDINPUT(
                wVk=0, wScan=ord(key),
                dwFlags=KEYEVENTF_UNICODE if action == 'down' else (KEYEVENTF_UNICODE | KEYEVENTF_KEYUP),
                time=0, dwExtraInfo=extra,
            )))
            user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))
            return

        if vk == 0:
            return  # Unknown key

        flags = KEYEVENTF_KEYUP if action == 'up' else 0
        inp = INPUT(type=INPUT_KEYBOARD, ii=INPUT_UNION(ki=KEYBDINPUT(
            wVk=vk, wScan=0, dwFlags=flags,
            time=0, dwExtraInfo=extra,
        )))
        user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))

    return send_mouse, send_keyboard


def _init_input_linux():
    """Initialize Linux input simulation via xdotool."""
    def send_mouse(action, x, y, button=0, delta=0):
        try:
            import subprocess
            if action == 'move':
                subprocess.run(['xdotool', 'mousemove', str(x), str(y)], timeout=2)
            elif action == 'down':
                btn_map = {0: 1, 1: 2, 2: 3}
                subprocess.run(['xdotool', 'mousemove', str(x), str(y), 'click', str(btn_map.get(button, 1))], timeout=2)
            elif action == 'up':
                pass  # xdotool click handles up+down together
            elif action == 'wheel':
                btn = 5 if delta > 0 else 4
                subprocess.run(['xdotool', 'click', str(btn)], timeout=2)
        except Exception as e:
            log.debug("xdotool mouse failed: %s", e)

    def send_keyboard(action, key, code='', shift=False, ctrl=False, alt=False, meta=False):
        try:
            import subprocess
            if action == 'down':
                subprocess.run(['xdotool', 'key', '--clearmodifiers', key], timeout=2)
        except Exception as e:
            log.debug("xdotool keyboard failed: %s", e)

    return send_mouse, send_keyboard


# Initialize capture/input based on platform
capture_screen = None
send_mouse = None
send_keyboard = None
h264_available = False
capture_init_h264 = None
capture_frame_h264 = None
capture_flush_h264 = None
capture_cleanup_h264 = None

if platform.system() == "Windows":
    try:
        capture_screen, h264_available, capture_init_h264, capture_frame_h264, capture_flush_h264, capture_cleanup_h264 = _init_screen_capture_windows()
        send_mouse, send_keyboard = _init_input_windows()
        log.info("Windows screen capture and input simulation initialized (h264=%s)", h264_available)
    except Exception as e:
        log.warning("Failed to init Windows screen capture: %s", e)
elif platform.system() == "Linux":
    try:
        capture_screen, h264_available, capture_init_h264, capture_frame_h264, capture_flush_h264, capture_cleanup_h264 = _init_screen_capture_linux()
        send_mouse, send_keyboard = _init_input_linux()
        log.info("Linux screen capture and input simulation initialized (h264=%s)", h264_available)
    except Exception as e:
        log.warning("Failed to init Linux screen capture: %s", e)


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
            # Clean disconnect - wait a bit before reconnecting
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
                    # Handle both text (JSON) and binary frames
                    if isinstance(message, bytes):
                        # Binary frame from server - parse header
                        if len(message) < 5:
                            continue
                        # Skip binary frames for now (settings, etc.)
                        # They'll be handled by dedicated handlers later
                        log.debug("Received binary frame from server, len=%d", len(message))
                        continue
                    data = json.loads(message)
                    msg_type = data.get("type")
                    log.info("WS received: %s", msg_type)

                    if msg_type == "terminal_start":
                        session_id = data["session_id"]
                        cols = data.get("cols", 80)
                        rows = data.get("rows", 24)
                        log.info("Terminal session started: %s (%dx%d)", session_id, cols, rows)
                        input_q: queue.Queue = queue.Queue()
                        output_q: queue.Queue = queue.Queue()

                        # Use PTY for proper terminal emulation
                        pty_proc = None
                        proc = None

                        if platform.system() == "Windows":
                            # Windows ConPTY via winpty
                            try:
                                from winpty import PtyProcess
                                pty_proc = PtyProcess.spawn(
                                    'cmd.exe',
                                    dimensions=(rows, cols),
                                )
                                log.info("Started ConPTY session: %s (%dx%d)", session_id, cols, rows)
                            except ImportError:
                                log.warning("winpty not installed, falling back to subprocess")
                                proc = subprocess.Popen(
                                    ["cmd.exe"],
                                    stdin=subprocess.PIPE,
                                    stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT,
                                    bufsize=0,
                                    creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
                                )
                        else:
                            # Unix PTY via pty module
                            try:
                                import pty as pty_module
                                import os as os_module
                                master_fd, slave_fd = pty_module.openpty()
                                proc = subprocess.Popen(
                                    ["/bin/bash", "-i"],
                                    stdin=slave_fd,
                                    stdout=slave_fd,
                                    stderr=slave_fd,
                                    bufsize=0,
                                    preexec_fn=os_module.setsid,
                                )
                                os_module.close(slave_fd)
                                # Store master_fd for read/write
                                pty_proc = type('PtyWrapper', (), {
                                    'fd': master_fd,
                                    'pid': proc.pid,
                                    'isalive': lambda self: proc.poll() is None,
                                    'setwinsize': lambda self, c, r: None,
                                    'read': lambda self, n=4096: os_module.read(self.fd, n),
                                    'write': lambda self, s: os_module.write(self.fd, s if isinstance(s, bytes) else s.encode()),
                                    'terminate': lambda self: proc.terminate(),
                                    'wait': lambda self: proc.wait(),
                                })()
                                log.info("Started Unix PTY session: %s", session_id)
                            except Exception as e:
                                log.warning("PTY failed (%s), falling back to subprocess", e)
                                proc = subprocess.Popen(
                                    ["/bin/bash", "-i"],
                                    stdin=subprocess.PIPE,
                                    stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT,
                                    bufsize=0,
                                )

                        sessions[session_id] = {
                            "proc": proc,
                            "pty": pty_proc,
                            "input_queue": input_q,
                            "output_queue": output_q,
                            "cols": cols,
                            "rows": rows,
                        }

                        # Read output in a thread
                        def read_output(pty=pty_proc, p=proc, sid=session_id, oq=output_q):
                            try:
                                if pty:
                                    # PTY read
                                    while True:
                                        try:
                                            chunk = pty.read(4096)
                                            if chunk:
                                                if isinstance(chunk, bytes):
                                                    chunk = chunk.decode(errors='replace')
                                                oq.put({"type": "output", "session_id": sid, "data": chunk})
                                        except EOFError:
                                            break
                                        except OSError:
                                            break
                                        except Exception as e:
                                            if 'EOF' in str(e) or 'closed' in str(e):
                                                break
                                            oq.put({"type": "output", "session_id": sid, "data": f"\r\n[read error: {e}]\r\n"})
                                            break
                                elif p:
                                    # Subprocess fallback read
                                    while p.poll() is None:
                                        chunk = p.stdout.read(4096)
                                        if chunk:
                                            oq.put({"type": "output", "session_id": sid, "data": chunk.decode(errors="replace")})

                                exit_code = -1
                                if pty and hasattr(pty, 'exitstatus'):
                                    exit_code = pty.exitstatus or 0
                                elif p:
                                    exit_code = p.returncode or 0
                                oq.put({"type": "exit", "session_id": sid, "code": exit_code})
                            except Exception as e:
                                oq.put({"type": "exit", "session_id": sid, "code": -1, "message": str(e)})

                        t = threading.Thread(target=read_output, daemon=True)
                        t.start()

                        # Write input in a thread
                        def write_input(pty=pty_proc, p=proc, iq=input_q):
                            try:
                                while True:
                                    if pty and hasattr(pty, 'isalive') and not pty.isalive():
                                        break
                                    if p and p.poll() is not None:
                                        break
                                    try:
                                        inp = iq.get(timeout=0.5)
                                        if inp.get("type") == "input":
                                            if pty:
                                                pty.write(inp["data"])
                                            elif p and p.stdin:
                                                p.stdin.write(inp["data"].encode())
                                                p.stdin.flush()
                                    except queue.Empty:
                                        continue
                                    except EOFError:
                                        break
                            except Exception as e:
                                log.error("write_input error: %s", e)

                        t2 = threading.Thread(target=write_input, daemon=True)
                        t2.start()

                    elif msg_type == "input":
                        session_id = data.get("session_id")
                        sess = sessions.get(session_id)
                        if sess:
                            log.info("Terminal input received, len=%d", len(data.get("data","")))
                            sess["input_queue"].put(data)
                        else:
                            log.warning("Terminal input for unknown session %s", session_id)

                    elif msg_type == "terminal_kill":
                        session_id = data.get("session_id")
                        sess = sessions.get(session_id)
                        if sess:
                            try:
                                if sess.get("pty"):
                                    sess["pty"].terminate()
                                elif sess.get("proc"):
                                    sess["proc"].terminate()
                            except Exception:
                                pass
                            sessions.pop(session_id, None)

                    elif msg_type == "ping":
                        await ws.send(json.dumps({"type": "pong"}))
                        log.debug("Sent pong")

                    # --- Desktop session handling ---
                    elif msg_type == "desktop_start":
                        session_id = data.get("session_id")
                        use_h264 = False  # TODO: re-enable H.264 when WebCodecs is fixed
                        # use_h264 = capture_init_h264 is not None and capture_frame_h264 is not None
                        log.info("Desktop capture session started: %s (h264=%s)", session_id, use_h264)

                        # --- Binary WS frame helper ---
                        async def send_binary_frame(frame_type, payload):
                            """Send a binary frame: byte0=type, bytes1-4=len(BE), bytes5+=payload."""
                            header = struct.pack('!BI', frame_type, len(payload))
                            await ws.send(header + payload)

                        if capture_init_h264 is not None:
                            # --- H.264 streaming mode ---
                            try:
                                fps = data.get("fps", 30)
                                crf = data.get("quality", 23)
                                w, h = capture_init_h264(fps=fps, quality_crf=crf)
                                log.info("H.264 capture initialized: %dx%d @ %dfps crf=%d", w, h, fps, crf)
                            except Exception as e:
                                log.error("H.264 init failed: %s, falling back to JPEG", e)
                                # Fall through to JPEG path below
                                use_h264 = False

                            if use_h264:
                                # Send screen info as JSON binary frame (type 0x05)
                                info_json = json.dumps({
                                    "type": "desktop_info",
                                    "session_id": session_id,
                                    "width": w,
                                    "height": h,
                                    "monitors": 1,
                                    "encoding": "h264",
                                }).encode('utf-8')
                                await send_binary_frame(0x05, info_json)

                                desktop_config = {"fps": fps, "running": True, "crf": crf}

                                async def desktop_capture_loop_h264():
                                    consecutive_errors = 0
                                    while desktop_config["running"] and consecutive_errors < 5:
                                        frame_interval = 1.0 / max(desktop_config["fps"], 1)
                                        try:
                                            result = capture_frame_h264()
                                            if result:
                                                ftype, fbytes = result
                                                await send_binary_frame(ftype, fbytes)
                                                consecutive_errors = 0
                                            else:
                                                consecutive_errors += 1
                                        except Exception as e:
                                            log.error("H.264 capture error: %s", e)
                                            consecutive_errors += 1
                                        await asyncio.sleep(frame_interval)

                                    # Flush remaining packets
                                    for ftype, fbytes in capture_flush_h264():
                                        try:
                                            await send_binary_frame(ftype, fbytes)
                                        except Exception:
                                            pass

                                    capture_cleanup_h264()
                                    if consecutive_errors >= 5:
                                        log.error("H.264 capture failed 5 times, stopping")
                                    # Send stopped as JSON binary frame
                                    try:
                                        stopped_json = json.dumps({
                                            "type": "desktop_stopped",
                                            "session_id": session_id,
                                            "reason": "Capture failed" if consecutive_errors >= 5 else "Stopped",
                                        }).encode('utf-8')
                                        await send_binary_frame(0x05, stopped_json)
                                    except Exception:
                                        pass

                                capture_task = asyncio.create_task(desktop_capture_loop_h264())
                                sessions["_desktop_" + session_id] = {"task": capture_task, "config": desktop_config}

                        if not use_h264 and capture_screen:
                            # --- JPEG binary mode (fallback) ---
                            try:
                                _frame, w, h = capture_screen(quality=10)
                                log.info("Screen probe: %dx%d, frame=%s", w, h, "yes" if _frame else "none")
                            except Exception as e:
                                log.error("Screen probe failed: %s", e, exc_info=True)
                                _frame, w, h = None, 0, 0
                            if w > 0:
                                # Send desktop_info as binary config frame
                                info_json = json.dumps({
                                    "type": "desktop_info",
                                    "session_id": session_id,
                                    "width": w,
                                    "height": h,
                                    "monitors": 1,
                                    "encoding": "jpeg",
                                }).encode('utf-8')
                                await send_binary_frame(0x05, info_json)

                            desktop_config = {"quality": 55, "fps": 10, "running": True}

                            async def desktop_capture_loop_jpeg():
                                consecutive_errors = 0
                                while desktop_config["running"] and consecutive_errors < 5:
                                    frame_interval = 1.0 / max(desktop_config["fps"], 1)
                                    try:
                                        frame, w, h = capture_screen(quality=desktop_config["quality"])
                                        if frame and w > 0:
                                            # Send as binary keyframe (0x01) — it's a full JPEG
                                            await send_binary_frame(0x01, frame)
                                            consecutive_errors = 0
                                        else:
                                            consecutive_errors += 1
                                    except Exception as e:
                                        log.error("Desktop capture error: %s", e)
                                        consecutive_errors += 1
                                    await asyncio.sleep(frame_interval)
                                if consecutive_errors >= 5:
                                    log.error("Desktop capture failed 5 times, stopping")
                                try:
                                    await ws.send(json.dumps({
                                        "type": "desktop_stopped",
                                        "session_id": session_id,
                                        "reason": "Capture failed",
                                    }))
                                except Exception:
                                    pass

                            capture_task = asyncio.create_task(desktop_capture_loop_jpeg())
                            sessions["_desktop_" + session_id] = {"task": capture_task, "config": desktop_config}

                        if not use_h264 and not capture_screen:
                            await ws.send(json.dumps({
                                "type": "desktop_stopped",
                                "session_id": session_id,
                                "reason": "Screen capture not available on this platform",
                            }))

                    elif msg_type == "desktop_stop":
                        session_id = data.get("session_id")
                        log.info("Desktop capture session stopped: %s", session_id)
                        dsess = sessions.pop("_desktop_" + session_id, None)
                        if dsess:
                            if dsess.get("config"):
                                dsess["config"]["running"] = False
                            if dsess.get("task"):
                                dsess["task"].cancel()
                            # Cleanup H.264 resources if applicable
                            if capture_cleanup_h264:
                                try:
                                    capture_cleanup_h264()
                                except Exception:
                                    pass
                        await ws.send(json.dumps({
                            "type": "desktop_stopped",
                            "session_id": session_id,
                        }))

                    elif msg_type == "desktop_settings":
                        session_id = data.get("session_id")
                        dsess = sessions.get("_desktop_" + session_id)
                        if dsess and dsess.get("config"):
                            if data.get("quality"):
                                dsess["config"]["quality"] = data["quality"]
                            if data.get("fps"):
                                dsess["config"]["fps"] = data["fps"]
                        log.info("Desktop settings update: quality=%s fps=%s",
                                 data.get("quality"), data.get("fps"))

                    elif msg_type == "mouse":
                        if send_mouse:
                            send_mouse(
                                action=data.get("action", "move"),
                                x=data.get("x", 0),
                                y=data.get("y", 0),
                                button=data.get("button", 0),
                                delta=data.get("delta", 0),
                            )

                    elif msg_type == "keyboard":
                        if send_keyboard:
                            send_keyboard(
                                action=data.get("action", "down"),
                                key=data.get("key", ""),
                                code=data.get("code", ""),
                                shift=data.get("shift", False),
                                ctrl=data.get("ctrl", False),
                                alt=data.get("alt", False),
                                meta=data.get("meta", False),
                            )

                    elif msg_type == "restart_agent":
                        log.info("Restart command received, restarting...")
                        # Restart self
                        if platform.system() == "Windows":
                            import subprocess
                            subprocess.Popen(
                                [sys.executable] + sys.argv,
                                cwd=os.path.dirname(os.path.abspath(__file__)),
                                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
                            )
                        else:
                            os.execv(sys.executable, [sys.executable] + sys.argv)
                        sys.exit(0)

                    elif msg_type == "uninstall_agent":
                        log.info("Uninstall command received, removing agent...")
                        if platform.system() == "Windows":
                            # Remove scheduled task, then delete install dir
                            import subprocess
                            try:
                                subprocess.run(["schtasks", "/Delete", "/TN", "OpenRMM-Agent", "/F"], capture_output=True, timeout=10)
                            except Exception:
                                pass
                            # Self-delete in background
                            install_dir = os.path.dirname(os.path.abspath(__file__))
                            subprocess.Popen(
                                f'ping -n 3 127.0.0.1 >nul & rmdir /s /q "{install_dir}"',
                                shell=True, creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
                            )
                        else:
                            # Linux: stop service, remove files
                            try:
                                subprocess.run(["systemctl", "stop", "openrmm-agent"], capture_output=True, timeout=10)
                                subprocess.run(["systemctl", "disable", "openrmm-agent"], capture_output=True, timeout=10)
                            except Exception:
                                pass
                            install_dir = os.path.dirname(os.path.abspath(__file__))
                            subprocess.Popen(f'sleep 2 && rm -rf "{install_dir}" /etc/systemd/system/openrmm-agent.service', shell=True)
                        sys.exit(0)

                    elif msg_type == "resize":
                        session_id = data.get("session_id")
                        sess = sessions.get(session_id)
                        cols = data.get("cols", 80)
                        rows = data.get("rows", 24)
                        if sess and sess.get("pty"):
                            try:
                                sess["pty"].setwinsize(rows, cols)
                                log.info("Resized PTY %s to %dx%d", session_id, cols, rows)
                            except Exception as e:
                                log.debug("PTY resize failed: %s", e)

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


def auto_install_deps():
    """Auto-install required Python packages if missing."""
    import subprocess
    import sys

    required = {
        'psutil': 'psutil',
        'websockets': 'websockets>=12.0',
        'mss': 'mss>=9.0.0',
        'av': 'av>=12.0.0',
        'numpy': 'numpy>=1.24.0',
    }
    if platform.system() == "Windows":
        required['winpty'] = 'pywinpty>=2.0.0'
        required['win32api'] = 'pywin32>=306'

    missing = []
    for module, package in required.items():
        try:
            __import__(module)
        except ImportError:
            missing.append(package)

    if not missing:
        return

    log.info("Auto-installing missing packages: %s", ' '.join(missing))
    try:
        if platform.system() == "Windows":
            # Use Start-Process to avoid stderr crash with $ErrorActionPreference = "Stop"
            cmd = [sys.executable, '-m', 'pip', 'install'] + missing + ['--quiet']
            subprocess.Popen(cmd, creationflags=subprocess.CREATE_NEW_PROCESS_GROUP).wait()
        else:
            subprocess.run([sys.executable, '-m', 'pip', 'install'] + missing + ['--quiet'],
                         check=True, timeout=120)
        log.info("Auto-install complete")
    except Exception as e:
        log.warning("Auto-install failed (some features may be unavailable): %s", e)


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

    # Auto-install missing dependencies
    auto_install_deps()

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
"""WebRTC Remote Desktop Agent Module

Provides screen capture with a **layered capture strategy**:
  1. DXGI Desktop Duplication (via dxcam) — fastest, uses GPU-accelerated
     frame acquisition; works on physical machines and VMs with a WDDM driver
  2. BitBlt (GDI) via helper subprocess — works on physical machines and VMs
     with an active display
  3. RDP Loopback Session — for headless VMs: auto-spawns an RDP connection to
     localhost so the display adapter holds a real framebuffer, then BitBlt works
  4. Fallback black frames — if nothing else works

Signaling flows over the existing agent WebSocket connection:
- Backend sends webrtc_start -> agent creates PeerConnection + offer
- Agent sends webrtc_offer -> backend relays to browser
- Browser sends webrtc_answer -> backend relays to agent
- ICE candidates trickle both ways via webrtc_ice messages
- Input events flow over DataChannel "input"
"""

import asyncio
import json
import logging
import time
import io
import struct
import sys
import os
import subprocess
import fractions

try:
    from aiortc.contrib.media import MediaStreamTrack
except ImportError:
    MediaStreamTrack = object  # fallback so class definition doesn't crash

log = logging.getLogger("openrmm.webrtc")

# ──────────────────────────── VM Detection ────────────────────────────

def is_virtual_machine():
    """Detect if running inside a VM using WMI Win32_ComputerSystem.
    
    Common VM indicators in Manufacturer/Model:
      - Hyper-V: Manufacturer="Microsoft Corporation", Model="Virtual Machine"
      - VMware: Manufacturer="VMware, Inc.", Model="VMware Virtual Platform"
      - VirtualBox: Manufacturer="innotek GmbH", Model="VirtualBox"
      - KVM/QEMU: Manufacturer="QEMU", Model="Standard PC (Q35 + ICH9)"
      - Xen: Model starts with "Xen"
    """
    if sys.platform != "win32":
        return False
    
    try:
        import ctypes
        # Use WMI via COM to avoid subprocess overhead
        import pythoncom
        pythoncom.CoInitialize()
        try:
            import wmi
            c = wmi.WMI()
            for cs in c.Win32_ComputerSystem():
                mfr = (cs.Manufacturer or "").lower()
                model = (cs.Model or "").lower()
                vm_keywords = ["virtual", "vmware", "virtualbox", "kvm", "qemu", "xen", "hyper-v", "docker"]
                if any(kw in mfr or kw in model for kw in vm_keywords):
                    if "microsoft" in mfr and "surface" in model:
                        continue  # Surface devices have "Virtual" in some firmware strings
                    log.info(f"VM detected: Manufacturer={cs.Manufacturer}, Model={cs.Model}")
                    return True
            return False
        finally:
            pythoncom.CoUninitialize()
    except ImportError:
        # Fallback: use subprocess + PowerShell
        try:
            result = subprocess.run(
                ['powershell', '-Command',
                 'Get-WmiObject Win32_ComputerSystem | Select-Object Manufacturer,Model | ConvertTo-Json'],
                capture_output=True, text=True, timeout=10
            )
            data = json.loads(result.stdout)
            if isinstance(data, dict):
                mfr = (data.get("Manufacturer", "") or "").lower()
                model = (data.get("Model", "") or "").lower()
            else:
                mfr = model = ""
            vm_keywords = ["virtual", "vmware", "virtualbox", "kvm", "qemu", "xen", "hyper-v"]
            if any(kw in mfr or kw in model for kw in vm_keywords):
                log.info(f"VM detected (PS): Manufacturer={mfr}, Model={model}")
                return True
            return False
        except Exception as e:
            log.warning(f"VM detection failed: {e}")
            return False
    except Exception as e:
        log.warning(f"VM detection failed: {e}")
        return False


def test_bitblt_available():
    """Quick test: can BitBlt capture real (non-black) pixels?
    
    Returns True if capture works and produces non-trivial pixels.
    This catches the headless-VM case where BitBlt succeeds but returns
    an all-black framebuffer because no display adapter is active.
    """
    if sys.platform != "win32":
        return False
    
    try:
        import ctypes
        import ctypes.wintypes
        user32 = ctypes.windll.user32
        gdi32 = ctypes.windll.gdi32
        kernel32 = ctypes.windll.kernel32
        
        SRCCOPY = 0x00CC0020
        
        # Get screen dimensions
        w = user32.GetSystemMetrics(0)
        h = user32.GetSystemMetrics(1)
        if w <= 0 or h <= 0:
            log.info(f"BitBlt test: no screen dimensions ({w}x{h})")
            return False
        
        hdc = user32.GetDC(0)
        if not hdc:
            log.info("BitBlt test: GetDC failed")
            return False
        
        try:
            mem = gdi32.CreateCompatibleDC(hdc)
            bmp = gdi32.CreateCompatibleBitmap(hdc, w, h)
            old = gdi32.SelectObject(mem, bmp)
            
            kernel32.SetLastError(0)
            ret = gdi32.BitBlt(mem, 0, 0, w, h, hdc, 0, 0, SRCCOPY)
            err = kernel32.GetLastError()
            
            if not ret or err != 0:
                log.info(f"BitBlt test: BitBlt failed, ret={ret}, err={err}")
                gdi32.SelectObject(mem, old)
                gdi32.DeleteObject(bmp)
                gdi32.DeleteDC(mem)
                return False
            
            # Sample some pixels to check if they're real (not all black)
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
            
            bmi = BITMAPINFOHEADER()
            bmi.biSize = ctypes.sizeof(BITMAPINFOHEADER)
            bmi.biWidth = w
            bmi.biHeight = -h  # top-down
            bmi.biPlanes = 1
            bmi.biBitCount = 32  # BGRA
            
            buf = ctypes.create_string_buffer(w * h * 4)
            rows = gdi32.GetDIBits(mem, bmp, 0, h, buf, ctypes.byref(bmi), 0)
            
            gdi32.SelectObject(mem, old)
            gdi32.DeleteObject(bmp)
            gdi32.DeleteDC(mem)
            
            if rows == 0:
                log.info("BitBlt test: GetDIBits returned 0 rows")
                return False
            
            # Check if pixels are all black (or nearly so)
            import numpy as np
            arr = np.frombuffer(buf.raw[:w * h * 4], dtype=np.uint8).reshape(h, w, 4)
            # BGRA -> check RGB channels (skip alpha at index 3)
            rgb = arr[:, :, :3]
            max_val = rgb.max()
            non_zero = np.count_nonzero(rgb)
            total_pixels = w * h * 3
            
            is_all_black = (non_zero / total_pixels) < 0.001  # less than 0.1% non-zero
            
            if is_all_black:
                log.info(f"BitBlt test: capture works but pixels are all-black (max={max_val})")
                return False
            
            log.info(f"BitBlt test: SUCCESS - real pixels captured (max={max_val}, non-zero={non_zero}/{total_pixels})")
            return True
            
        finally:
            user32.ReleaseDC(0, hdc)
            
    except Exception as e:
        log.warning(f"BitBlt test exception: {e}")
        return False


def enumerate_sessions():
    """Enumerate all Windows Terminal Services sessions.

    Returns a list of dicts:
    [
        {
            "session_id": int,
            "session_name": str,        # e.g. "Console", "RDP-Tcp#0"
            "state": str,               # "Active", "Connected", "Disconnected", etc.
            "username": str,            # logged-on user or ""
            "client_name": str,         # RDP client name or ""
            "is_console": bool,         # True if this is the console session
        },
        ...
    ]
    """
    if sys.platform != "win32":
        return []

    import ctypes
    import ctypes.wintypes

    kernel32 = ctypes.windll.kernel32
    wtsapi32 = ctypes.windll.wtsapi32

    # WTS_SESSION_INFO structure
    class WTS_SESSION_INFO(ctypes.Structure):
        _fields_ = [
            ("SessionId", ctypes.wintypes.DWORD),
            ("pWinStationName", ctypes.c_wchar_p),
            ("State", ctypes.wintypes.INT),
        ]

    WTS_CURRENT_SERVER_HANDLE = ctypes.c_void_p(0)

    # WTS_CONNECTSTATE_CLASS enum values
    WTS_STATE_MAP = {
        0: "Inactive",
        1: "Active",
        2: "Connected",
        3: "Disconnected",
        4: "Listen",
        5: "Reset",
        6: "Down",
        7: "Init",
    }

    # Session info class constants for WTSQuerySessionInformationW
    WTSUserName = 5
    WTSClientName = 9

    ppSessionInfo = ctypes.c_void_p()
    pCount = ctypes.wintypes.DWORD()

    # Set up WTSEnumerateSessionsW
    wtsapi32.WTSEnumerateSessionsW.argtypes = [
        ctypes.c_void_p,       # hServer
        ctypes.wintypes.DWORD,  # Reserved
        ctypes.wintypes.DWORD,  # Version
        ctypes.POINTER(ctypes.c_void_p),  # ppSessionInfo
        ctypes.POINTER(ctypes.wintypes.DWORD),  # pCount
    ]
    wtsapi32.WTSEnumerateSessionsW.restype = ctypes.wintypes.BOOL

    # Set up WTSQuerySessionInformationW
    wtsapi32.WTSQuerySessionInformationW.argtypes = [
        ctypes.c_void_p,       # hServer
        ctypes.wintypes.DWORD,  # SessionId
        ctypes.wintypes.DWORD,  # WTSInfoClass
        ctypes.POINTER(ctypes.c_wchar_p),  # ppBuffer
        ctypes.POINTER(ctypes.wintypes.DWORD),  # pBytesReturned
    ]
    wtsapi32.WTSQuerySessionInformationW.restype = ctypes.wintypes.BOOL

    # Set up WTSFreeMemory
    wtsapi32.WTSFreeMemory.argtypes = [ctypes.c_void_p]
    wtsapi32.WTSFreeMemory.restype = None

    console_session_id = 0
    try:
        kernel32.WTSGetActiveConsoleSessionId.restype = ctypes.wintypes.UINT
        console_session_id = kernel32.WTSGetActiveConsoleSessionId()
    except Exception:
        pass

    if not wtsapi32.WTSEnumerateSessionsW(
        WTS_CURRENT_SERVER_HANDLE, 0, 1,
        ctypes.byref(ppSessionInfo), ctypes.byref(pCount)
    ):
        log.warning(f"WTSEnumerateSessionsW failed: {kernel32.GetLastError()}")
        return []

    results = []
    try:
        # Cast the buffer to an array of WTS_SESSION_INFO
        session_array = ctypes.cast(
            ppSessionInfo,
            ctypes.POINTER(WTS_SESSION_INFO * pCount.value)
        )

        for i in range(pCount.value):
            si = session_array.contents[i]
            session_id = si.SessionId
            session_name = si.pWinStationName or ""
            state = WTS_STATE_MAP.get(si.State, f"Unknown({si.State})")

            # Skip services (SessionId=0) and idle sessions
            if session_id == 0 or state in ("Listen", "Init", "Reset", "Down"):
                continue

            # Query username
            username = ""
            ppBuffer = ctypes.c_wchar_p()
            bytes_returned = ctypes.wintypes.DWORD()
            if wtsapi32.WTSQuerySessionInformationW(
                WTS_CURRENT_SERVER_HANDLE, session_id, WTSUserName,
                ctypes.byref(ppBuffer), ctypes.byref(bytes_returned)
            ):
                username = ppBuffer.value or ""
                wtsapi32.WTSFreeMemory(ppBuffer)

            # Query client name
            client_name = ""
            ppBuffer2 = ctypes.c_wchar_p()
            if wtsapi32.WTSQuerySessionInformationW(
                WTS_CURRENT_SERVER_HANDLE, session_id, WTSClientName,
                ctypes.byref(ppBuffer2), ctypes.byref(bytes_returned)
            ):
                client_name = ppBuffer2.value or ""
                wtsapi32.WTSFreeMemory(ppBuffer2)

            is_console = (session_id == console_session_id)

            results.append({
                "session_id": session_id,
                "session_name": session_name,
                "state": state,
                "username": username,
                "client_name": client_name,
                "is_console": is_console,
            })
    finally:
        wtsapi32.WTSFreeMemory(ppSessionInfo)

    # Sort: console first, then Active, then by session_id
    results.sort(key=lambda s: (0 if s["is_console"] else 1, 0 if s["state"] == "Active" else 1, s["session_id"]))
    return results


# ──────────────────────── RDP Loopback Session ────────────────────────

class RDPLoopbackSession:
    """Manages a persistent RDP loopback session for headless VMs.
    
    When no display adapter holds a real framebuffer (headless VM),
    BitBlt returns all-black. This class:
      1. Enables RDP loopback connections
      2. Stores credentials for localhost
      3. Launches mstsc.exe to connect to localhost
      4. Monitors and auto-reconnects the session
    """
    
    def __init__(self, username: str = "admin", password: str = ""):
        self._username = username
        self._password = password
        self._connected = False
        self._mstsc_pid = None
        self._watchdog_task = None
        self._rdp_task_name = "OpenRMM_RDP_Loopback"
    
    @property
    def is_connected(self):
        return self._connected
    
    def enable_loopback(self):
        """Ensure RDP loopback is allowed (AllowLoopback=1).
        
        Tries winreg first (requires admin/SYSTEM), falls back to PowerShell
        which may have different privileges in certain contexts.
        """
        # Try PowerShell first (more reliable privilege escalation)
        try:
            result = subprocess.run(
                ['powershell', '-Command',
                 'New-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server" '
                 '-Name "AllowLoopback" -Value 1 -PropertyType DWord -Force -ErrorAction Stop'],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0:
                log.info("RDP loopback enabled via PowerShell (AllowLoopback=1)")
                return True
            log.debug(f"PowerShell loopback enable failed: {result.stderr.strip()}")
        except Exception as e:
            log.debug(f"PowerShell loopback enable exception: {e}")
        
        # Fallback to winreg
        try:
            import winreg
            key_path = r"SYSTEM\CurrentControlSet\Control\Terminal Server"
            try:
                key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path, 0,
                                     winreg.KEY_READ | winreg.KEY_SET_VALUE)
                try:
                    value, _ = winreg.QueryValueEx(key, "AllowLoopback")
                    if value == 1:
                        log.info("RDP loopback already enabled")
                        return True
                except FileNotFoundError:
                    pass
                winreg.SetValueEx(key, "AllowLoopback", 0, winreg.REG_DWORD, 1)
                log.info("RDP loopback enabled via winreg (AllowLoopback=1)")
                return True
            except PermissionError:
                log.warning("winreg: permission denied for AllowLoopback (need admin/SYSTEM)")
                return False
            finally:
                try:
                    winreg.CloseKey(key)
                except Exception:
                    pass
        except Exception as e:
            log.warning(f"Failed to enable RDP loopback: {e}")
            return False
    
    def ensure_rdp_enabled(self):
        """Ensure RDP is enabled on this machine."""
        try:
            import winreg
            key_path = r"SYSTEM\CurrentControlSet\Control\Terminal Server"
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path, 0, winreg.KEY_READ)
            fDenyTS, _ = winreg.QueryValueEx(key, "fDenyTSConnections")
            winreg.CloseKey(key)
            if fDenyTS == 0:
                log.info("RDP is enabled (fDenyTSConnections=0)")
                return True
            else:
                # Enable RDP
                key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path, 0, winreg.KEY_SET_VALUE)
                winreg.SetValueEx(key, "fDenyTSConnections", 0, winreg.REG_DWORD, 0)
                winreg.CloseKey(key)
                # Also open firewall
                subprocess.run(
                    ['netsh', 'advfirewall', 'firewall', 'set', 'rule',
                     'group="remote desktop"', 'new', 'enable=Yes'],
                    capture_output=True, timeout=10
                )
                log.info("RDP enabled and firewall rule updated")
                return True
        except Exception as e:
            log.warning(f"Failed to ensure RDP enabled: {e}")
            return False
    
    def _configure_auto_logon(self):
        """Configure Windows auto-logon so a user session exists at boot.
        
        This ensures that even on a headless VM, Windows creates an interactive
        user session at startup, which is required for BitBlt/screen capture.
        """
        try:
            import winreg
            key_path = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
            try:
                key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path, 0,
                                     winreg.KEY_SET_VALUE)
                winreg.SetValueEx(key, "AutoAdminLogon", 0, winreg.REG_SZ, "1")
                winreg.SetValueEx(key, "DefaultUserName", 0, winreg.REG_SZ, self._username)
                winreg.SetValueEx(key, "DefaultPassword", 0, winreg.REG_SZ, self._password)
                winreg.CloseKey(key)
                log.info(f"Auto-logon configured for user '{self._username}'")
            except Exception:
                subprocess.run(
                    ['powershell', '-Command',
                     f'Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon" '
                     f'-Name "AutoAdminLogon" -Value "1" -Force; '
                     f'Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon" '
                     f'-Name "DefaultUserName" -Value "{self._username}" -Force; '
                     f'Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon" '
                     f'-Name "DefaultPassword" -Value "{self._password}" -Force'],
                    capture_output=True, text=True, timeout=10
                )
                log.info("Auto-logon configured via PowerShell")
        except Exception as e:
            log.warning(f"Failed to configure auto-logon: {e}")
    
    def store_credentials(self):
        """Store RDP credentials for localhost so mstsc auto-authenticates."""
        try:
            # Remove old entry first (ignore errors)
            subprocess.run(
                ['cmdkey', '/delete:TERMSRV/localhost'],
                capture_output=True, timeout=5
            )
            # Add new credential
            result = subprocess.run(
                ['cmdkey', '/generic:TERMSRV/localhost',
                 f'/user:{self._username}', f'/pass:{self._password}'],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0:
                log.info("RDP credentials stored for localhost")
                return True
            else:
                log.warning(f"cmdkey failed: {result.stderr.strip()}")
                return False
        except Exception as e:
            log.warning(f"Failed to store RDP credentials: {e}")
            return False
    
    def connect(self):
        """Launch mstsc.exe connecting to localhost via scheduled task.
        
        Strategy:
        1. Ensure RDP + loopback enabled
        2. Configure auto-logon (so a user session exists)
        3. Check if user session exists
        4. Launch mstsc via scheduled task (works with or without user session)
        5. Wait for RDP session to establish
        """
        if self._connected:
            return True
        
        log.info("Starting RDP loopback session...")
        
        # Step 1: Ensure RDP is enabled
        if not self.ensure_rdp_enabled():
            log.error("RDP not available on this machine")
            return False
        
        # Step 2: Enable loopback
        if not self.enable_loopback():
            log.error("Cannot enable RDP loopback")
            return False
        
        # Step 3: Always configure auto-logon (survives reboots)
        self._configure_auto_logon()
        
        # Step 4: Create RDP config file
        rdp_path = os.path.join(os.environ.get('PUBLIC', r'C:\Users\Public'), 'openrmm_loopback.rdp')
        try:
            with open(rdp_path, 'w') as f:
                f.write(
                    "full address:s:localhost\n"
                    "server port:i:3389\n"
                    "username:s:" + self._username + "\n"
                    "autoreconnection enabled:i:1\n"
                    "disable wallpaper:i:0\n"
                    "disable full window drag:i:0\n"
                    "disable menu anims:i:0\n"
                    "disable themes:i:0\n"
                    "desktopwidth:i:1920\n"
                    "desktopheight:i:1080\n"
                    "session bpp:i:32\n"
                    "compression:i:1\n"
                    "keyboardhook:i:2\n"
                    "audiocapturemode:i:0\n"
                    "videoplaybackmode:i:1\n"
                    "connection type:i:7\n"
                    "networkautodetect:i:1\n"
                    "bandwidthautodetect:i:1\n"
                    "displayconnectionbar:i:0\n"
                    "enableworkspacereconnect:i:1\n"
                    "allow font smoothing:i:1\n"
                    "allow desktop composition:i:1\n"
                    "disable window resizing:i:1\n"
                    "use multimon:i:0\n"
                    "redirectclipboard:i:0\n"
                    "redirectprinters:i:0\n"
                    "prompt for credentials:i:0\n"
                    "promptcredentialonce:i:0\n"
                    "negotiate security layer:i:1\n"
                    "authentication level:i:0\n"
                    "enablecredsspsupport:i:1\n"
                )
            log.info(f"Wrote RDP config to {rdp_path}")
        except Exception as e:
            log.warning(f"Failed to write RDP file: {e}")
        
        # Step 5: Try to launch mstsc
        launched = self._launch_mstsc(rdp_path)
        
        if launched:
            # Wait for RDP session to establish
            for i in range(20):
                time.sleep(1)
                if self._check_rdp_session_active():
                    self._connected = True
                    log.info(f"RDP loopback session established after {i+1}s")
                    return True
                log.debug(f"Waiting for RDP loopback... ({i+1}/20)")
            
            log.warning("RDP loopback session did not establish within 20s")
            return False
        else:
            log.error("Failed to launch mstsc")
            return False
    
    def _check_any_user_session(self):
        """Check if any user session (beyond Session 0) exists."""
        try:
            import ctypes
            import ctypes.wintypes
            kernel32 = ctypes.windll.kernel32
            wtsapi32 = ctypes.windll.wtsapi32
            
            kernel32.WTSGetActiveConsoleSessionId.restype = ctypes.wintypes.UINT
            session_id = kernel32.WTSGetActiveConsoleSessionId()
            if session_id != 0 and session_id != 0xFFFFFFFF:
                log.info(f"User session found: console session {session_id}")
                return True
            
            # Check via PowerShell for any active sessions
            result = subprocess.run(
                ['powershell', '-Command',
                 '(query session 2>&1) -match "Active"'],
                capture_output=True, text=True, timeout=10
            )
            if 'Active' in result.stdout:
                log.info("Active user session found via query session")
                return True
            
            return False
        except Exception:
            return False
    
    def _store_credentials_in_user_session(self):
        """Store RDP credentials in the user's context using scheduled task."""
        try:
            # Create a temporary script that runs cmdkey
            script_path = os.path.join(
                os.environ.get('PUBLIC', r'C:\Users\Public'), 'openrmm_store_creds.cmd'
            )
            with open(script_path, 'w') as f:
                f.write(f'@echo off\n')
                f.write(f'cmdkey /delete:TERMSRV/localhost 2>nul\n')
                f.write(f'cmdkey /generic:TERMSRV/localhost /user:{self._username} /pass:{self._password}\n')
            
            # Run as scheduled task in user session
            task_name = "OpenRMM_StoreCreds"
            # Delete existing task
            subprocess.run(
                ['schtasks', '/delete', '/tn', task_name, '/f'],
                capture_output=True, timeout=5
            )
            # Create task that runs as the user
            result = subprocess.run(
                ['schtasks', '/create', '/tn', task_name, '/tr', f'cmd /c "{script_path}"',
                 '/sc', 'once', '/st', '00:00', '/ru', self._username, '/rp', self._password,
                 '/it',  # Interactive - run only when user is logged on
                 '/f'],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0:
                # Run the task immediately
                subprocess.run(
                    ['schtasks', '/run', '/tn', task_name],
                    capture_output=True, timeout=10
                )
                time.sleep(2)
                log.info("RDP credentials stored in user context via scheduled task")
                # Clean up task
                subprocess.run(
                    ['schtasks', '/delete', '/tn', task_name, '/f'],
                    capture_output=True, timeout=5
                )
                return True
            else:
                log.warning(f"Failed to create cred storage task: {result.stderr.strip()}")
                # Try storing directly (works if current user matches RDP user)
                return self.store_credentials()
        except Exception as e:
            log.warning(f"Credential storage in user session failed: {e}")
            return self.store_credentials()
    
    def _launch_mstsc(self, rdp_path):
        """Launch mstsc.exe to connect to localhost.

        Always uses scheduled task approach — it works with or without
        an active user session, and doesn't require WTSQueryUserToken.
        """
        return self._launch_mstsc_via_task(rdp_path)
    
    def _launch_mstsc_via_task(self, rdp_path):
        """Launch mstsc.exe in the interactive user session.
        
        Strategy (in order):
        1. WTSQueryUserToken + CreateProcessAsUserW — run mstsc in user session
        2. Scheduled task with /it flag — forces interactive session
        3. Direct Popen — last resort for when already in user context
        """
        log.info("Launching mstsc in user session")
        
        # Store credentials first — try via scheduled task (runs in user context)
        self._store_credentials_via_task()
        
        # Primary approach: WTSQueryUserToken + CreateProcessAsUserW
        if self._check_any_user_session():
            log.info("User session found, launching via WTSQueryUserToken")
            result = self._launch_mstsc_in_user_session(rdp_path)
            if result:
                return True
            log.warning("WTSQueryUserToken launch failed, trying scheduled task")
        
        # Fallback: scheduled task with /it flag (interactive)
        return self._launch_mstsc_via_scheduled_task(rdp_path)
    
    def _store_credentials_via_task(self):
        """Store RDP credentials in the user's context using a scheduled task."""
        script_path = os.path.join(
            os.environ.get('PUBLIC', r'C:\Users\Public'), 'openrmm_store_creds.cmd'
        )
        with open(script_path, 'w') as f:
            f.write('@echo off\n')
            f.write(f'cmdkey /delete:TERMSRV/localhost 2>nul\n')
            f.write(f'cmdkey /generic:TERMSRV/localhost /user:{self._username} /pass:{self._password}\n')
        
        task_name = "OpenRMM_StoreCreds"
        subprocess.run(['schtasks', '/delete', '/tn', task_name, '/f'],
                       capture_output=True, timeout=5)
        result = subprocess.run(
            ['schtasks', '/create', '/tn', task_name,
             '/tr', f'cmd /c "{script_path}"',
             '/sc', 'once', '/st', '00:00',
             '/ru', self._username, '/rp', self._password,
             '/it',  # Interactive — run in user session
             '/rl', 'highest', '/f'],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            subprocess.run(['schtasks', '/run', '/tn', task_name],
                          capture_output=True, timeout=10)
            time.sleep(2)
            log.info("RDP credentials stored via scheduled task")
        else:
            log.warning(f"Failed to create cred task: {result.stderr.strip()}")
            self.store_credentials()  # Direct fallback
        subprocess.run(['schtasks', '/delete', '/tn', task_name, '/f'],
                       capture_output=True, timeout=5)
    
    def _launch_mstsc_via_scheduled_task(self, rdp_path):
        """Fallback: launch mstsc via scheduled task with /it flag."""
        log.info("Launching mstsc via scheduled task with /it flag")
        
        launcher_path = os.path.join(
            os.environ.get('PUBLIC', r'C:\Users\Public'), 'openrmm_rdp_launcher.cmd'
        )
        with open(launcher_path, 'w') as f:
            f.write('@echo off\n')
            f.write(f'cmdkey /delete:TERMSRV/localhost 2>nul\n')
            f.write(f'cmdkey /generic:TERMSRV/localhost /user:{self._username} /pass:{self._password}\n')
            f.write('timeout /t 3 /nobreak >nul\n')
            f.write(f'start "" mstsc "{rdp_path}"\n')
        
        # Create task with /it flag — runs in interactive user session
        task_name = "OpenRMM_RDPLoopback"
        subprocess.run(['schtasks', '/delete', '/tn', task_name, '/f'],
                       capture_output=True, timeout=5)
        result = subprocess.run(
            ['schtasks', '/create', '/tn', task_name,
             '/tr', f'cmd /c "{launcher_path}"',
             '/sc', 'onlogon',
             '/ru', self._username, '/rp', self._password,
             '/it',  # Interactive — run in user session when logged on
             '/rl', 'highest', '/f'],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0:
            log.warning(f"Failed to create onlogon task: {result.stderr.strip()}")
        
        # Also create a "run now" task with /it flag
        run_task_name = "OpenRMM_RDPLoopback_Run"
        subprocess.run(['schtasks', '/delete', '/tn', run_task_name, '/f'],
                       capture_output=True, timeout=5)
        result = subprocess.run(
            ['schtasks', '/create', '/tn', run_task_name,
             '/tr', f'cmd /c "{launcher_path}"',
             '/sc', 'once', '/st', '00:00',
             '/ru', self._username, '/rp', self._password,
             '/it',  # Interactive — crucial for mstsc to run in user session
             '/rl', 'highest', '/f'],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0:
            log.error(f"Failed to create run-now task: {result.stderr.strip()}")
            # Last resort: direct launch
            try:
                subprocess.Popen(['mstsc', rdp_path],
                    creationflags=0x00000008, close_fds=True)
                log.info("Launched mstsc directly as fallback")
                return True
            except Exception as e:
                log.error(f"Failed to launch mstsc directly: {e}")
                return False
        
        result = subprocess.run(['schtasks', '/run', '/tn', run_task_name],
                               capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            log.info("RDP loopback task triggered successfully")
            return True
        else:
            log.warning(f"schtasks /run failed: {result.stderr.strip()}")
            return False
    
    def _launch_mstsc_headless(self, rdp_path):
        """Launch mstsc when no user session exists (headless VM).
        
        Strategy: Enable auto-logon so Windows creates a user session at boot,
        then create a scheduled task that runs mstsc at user logon.
        Since the VM is already running, we trigger the auto-logon.
        """
        log.info("No user session detected — setting up headless RDP loopback")
        
        # Enable auto-logon for the user
        try:
            try:
                import winreg
                key_path = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
                key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path, 0,
                                     winreg.KEY_SET_VALUE)
                winreg.SetValueEx(key, "AutoAdminLogon", 0, winreg.REG_SZ, "1")
                winreg.SetValueEx(key, "DefaultUserName", 0, winreg.REG_SZ, self._username)
                winreg.SetValueEx(key, "DefaultPassword", 0, winreg.REG_SZ, self._password)
                winreg.CloseKey(key)
                log.info(f"Auto-logon configured for user '{self._username}'")
            except Exception:
                # Try PowerShell
                subprocess.run(
                    ['powershell', '-Command',
                     f'Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon" '
                     f'-Name "AutoAdminLogon" -Value "1" -Force; '
                     f'Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon" '
                     f'-Name "DefaultUserName" -Value "{self._username}" -Force; '
                     f'Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon" '
                     f'-Name "DefaultPassword" -Value "{self._password}" -Force'],
                    capture_output=True, text=True, timeout=10
                )
                log.info("Auto-logon configured via PowerShell")
        except Exception as e:
            log.warning(f"Failed to configure auto-logon: {e}")
        
        # Create a scheduled task that runs mstsc at user logon
        task_name = "OpenRMM_RDPLoopback"
        
        # Create a launcher script (more reliable than direct mstsc in schtasks)
        launcher_path = os.path.join(
            os.environ.get('PUBLIC', r'C:\Users\Public'), 'openrmm_rdp_launcher.cmd'
        )
        with open(launcher_path, 'w') as f:
            f.write('@echo off\n')
            f.write('timeout /t 5 /nobreak >nul\n')  # Wait 5s for desktop to initialize
            f.write(f'cmdkey /delete:TERMSRV/localhost 2>nul\n')
            f.write(f'cmdkey /generic:TERMSRV/localhost /user:{self._username} /pass:{self._password}\n')
            f.write(f'start "" mstsc "{rdp_path}"\n')
        
        # Delete existing task
        subprocess.run(
            ['schtasks', '/delete', '/tn', task_name, '/f'],
            capture_output=True, timeout=5
        )
        
        # Create task that runs at user logon
        result = subprocess.run(
            ['schtasks', '/create', '/tn', task_name,
             '/tr', f'cmd /c "{launcher_path}"',
             '/sc', 'onlogon',  # Run when user logs on
             '/ru', self._username, '/rp', self._password,
             '/it',  # Interactive (only when user is logged on)
             '/rl', 'highest',  # Run with highest privileges
             '/f'],
            capture_output=True, text=True, timeout=10
        )
        
        if result.returncode == 0:
            log.info(f"Created logon task '{task_name}' for RDP loopback")
        else:
            log.warning(f"Failed to create logon task: {result.stderr.strip()}")
            # Try without /it flag (may not be supported on all Windows versions)
            result = subprocess.run(
                ['schtasks', '/create', '/tn', task_name,
                 '/tr', f'cmd /c "{launcher_path}"',
                 '/sc', 'onlogon',
                 '/ru', self._username, '/rp', self._password,
                 '/rl', 'highest',
                 '/f'],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode != 0:
                log.error(f"Failed to create logon task (2nd attempt): {result.stderr.strip()}")
                return False
        
        # Now we need to trigger a user logon. On a headless VM, there's no
        # interactive session. The simplest approach: use tscon to connect
        # the console session, or use a scheduled task that runs NOW.
        # 
        # Alternative: We create a "run now" task that simulates a logon
        # by launching a process in the user's context.
        
        # Create a one-shot task that runs immediately as the user
        run_task_name = "OpenRMM_RDPLoopback_Run"
        subprocess.run(
            ['schtasks', '/delete', '/tn', run_task_name, '/f'],
            capture_output=True, timeout=5
        )
        result = subprocess.run(
            ['schtasks', '/create', '/tn', run_task_name,
             '/tr', f'cmd /c "{launcher_path}"',
             '/sc', 'once', '/st', '00:00',
             '/ru', self._username, '/rp', self._password,
             '/rl', 'highest',
             '/f'],
            capture_output=True, text=True, timeout=10
        )
        
        if result.returncode == 0:
            # Run it NOW
            result = subprocess.run(
                ['schtasks', '/run', '/tn', run_task_name],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0:
                log.info("RDP loopback launcher task started")
                
                # Wait a bit and then check if user session appeared
                for i in range(10):
                    time.sleep(1)
                    if self._check_any_user_session():
                        log.info(f"User session appeared after {i+1}s")
                        # Now launch mstsc in that session
                        return self._launch_mstsc_in_user_session(rdp_path)
                
                log.warning("User session did not appear from scheduled task")
                return False
            else:
                log.error(f"Failed to run launcher task: {result.stderr.strip()}")
                return False
        else:
            log.error(f"Failed to create launcher task: {result.stderr.strip()}")
            return False
    
    def _launch_mstsc_in_user_session(self, rdp_path):
        """Launch mstsc.exe in the interactive user session using WTSQueryUserToken."""
        import ctypes
        import ctypes.wintypes
        
        kernel32 = ctypes.windll.kernel32
        advapi32 = ctypes.windll.advapi32
        wtsapi32 = ctypes.windll.wtsapi32
        userenv = ctypes.windll.userenv
        
        try:
            # Find active user session
            kernel32.WTSGetActiveConsoleSessionId.restype = ctypes.wintypes.UINT
            console_session_id = kernel32.WTSGetActiveConsoleSessionId()
            
            hUserToken = ctypes.wintypes.HANDLE()
            target_session = None
            
            # Try console session then RDP session IDs
            for sid in [console_session_id, 1, 2, 3, 4, 5]:
                if sid == 0xFFFFFFFF or sid == 0:
                    continue
                if wtsapi32.WTSQueryUserToken(sid, ctypes.byref(hUserToken)):
                    target_session = sid
                    log.info(f"WTSQueryUserToken({sid}) succeeded for mstsc")
                    break
                else:
                    err = kernel32.GetLastError()
                    log.debug(f"WTSQueryUserToken({sid}) failed: {err}")
            
            if target_session is None:
                # If no user is logged in, we need to trigger one first
                # For a VM that boots headless, there may be no interactive session
                # In that case, we'll try creating a scheduled task that runs at logon
                log.error("No user session found for RDP loopback launch")
                return False
            
            try:
                # Duplicate token as primary
                MAXIMUM_ALLOWED = 0x2000000
                TOKEN_PRIMARY = 1
                SECURITY_DELEGATION = 3
                
                hDupToken = ctypes.wintypes.HANDLE()
                advapi32.DuplicateTokenEx.argtypes = [
                    ctypes.c_void_p, ctypes.wintypes.DWORD, ctypes.c_void_p,
                    ctypes.wintypes.DWORD, ctypes.wintypes.DWORD,
                    ctypes.POINTER(ctypes.wintypes.HANDLE)
                ]
                advapi32.DuplicateTokenEx.restype = ctypes.wintypes.BOOL
                
                if not advapi32.DuplicateTokenEx(
                    hUserToken, MAXIMUM_ALLOWED, None,
                    SECURITY_DELEGATION, TOKEN_PRIMARY,
                    ctypes.byref(hDupToken)
                ):
                    err = kernel32.GetLastError()
                    log.error(f"DuplicateTokenEx failed for mstsc: {err}")
                    return False
                
                try:
                    # Create environment block
                    lpEnvironment = ctypes.c_void_p()
                    env_ok = userenv.CreateEnvironmentBlock(
                        ctypes.byref(lpEnvironment), hDupToken, False
                    )
                    
                    # Set up process creation
                    class STARTUPINFOW(ctypes.Structure):
                        _fields_ = [
                            ("cb", ctypes.wintypes.DWORD),
                            ("lpReserved", ctypes.c_wchar_p),
                            ("lpDesktop", ctypes.c_wchar_p),
                            ("lpTitle", ctypes.c_wchar_p),
                            ("dwX", ctypes.wintypes.DWORD), ("dwY", ctypes.wintypes.DWORD),
                            ("dwXSize", ctypes.wintypes.DWORD), ("dwYSize", ctypes.wintypes.DWORD),
                            ("dwXCountChars", ctypes.wintypes.DWORD), ("dwYCountChars", ctypes.wintypes.DWORD),
                            ("dwFillAttribute", ctypes.wintypes.DWORD),
                            ("dwFlags", ctypes.wintypes.DWORD),
                            ("wShowWindow", ctypes.wintypes.WORD),
                            ("cbReserved2", ctypes.wintypes.WORD),
                            ("lpReserved2", ctypes.c_void_p),
                            ("hStdInput", ctypes.c_void_p),
                            ("hStdOutput", ctypes.c_void_p),
                            ("hStdError", ctypes.c_void_p),
                        ]
                    
                    class PROCESS_INFORMATION(ctypes.Structure):
                        _fields_ = [
                            ("hProcess", ctypes.c_void_p),
                            ("hThread", ctypes.c_void_p),
                            ("dwProcessId", ctypes.wintypes.DWORD),
                            ("dwThreadId", ctypes.wintypes.DWORD),
                        ]
                    
                    si = STARTUPINFOW()
                    si.cb = ctypes.sizeof(STARTUPINFOW)
                    si.lpDesktop = "WinSta0\\Default"
                    # Show window minimized so it doesn't disturb
                    si.dwFlags = 0x01  # STARTF_USESHOWWINDOW
                    si.wShowWindow = 6  # SW_MINIMIZE
                    
                    # Step 1: Store RDP credentials in user session via cmdkey
                    # This MUST run in the user's session so mstsc can find them
                    CREATE_NO_WINDOW = 0x08000000
                    CREATE_UNICODE_ENVIRONMENT = 0x00000400
                    
                    cmdkey_cmdline = f'cmdkey /generic:TERMSRV/localhost /user:{self._username} /pass:{self._password}'
                    pi_cmdkey = PROCESS_INFORMATION()
                    result_ck = advapi32.CreateProcessAsUserW(
                        hDupToken, None, cmdkey_cmdline,
                        None, None, False,
                        CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT,
                        lpEnvironment if env_ok else None,
                        None, ctypes.byref(si), ctypes.byref(pi_cmdkey),
                    )
                    
                    if result_ck:
                        log.info(f"cmdkey launched in user session: PID={pi_cmdkey.dwProcessId}")
                        # WaitForSingleObject expects a HANDLE
                        kernel32.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.wintypes.DWORD]
                        kernel32.WaitForSingleObject.restype = ctypes.wintypes.DWORD
                        kernel32.WaitForSingleObject(pi_cmdkey.hProcess, 5000)
                        kernel32.CloseHandle(pi_cmdkey.hThread)
                        kernel32.CloseHandle(pi_cmdkey.hProcess)
                        time.sleep(1)
                        log.info("cmdkey completed in user session")
                    else:
                        err = kernel32.GetLastError()
                        log.warning(f"cmdkey CreateProcessAsUserW failed: {err}")
                    
                    # Step 2: Launch mstsc connecting to localhost
                    pi = PROCESS_INFORMATION()
                    cmdline = f'mstsc "{rdp_path}"'
                    
                    advapi32.CreateProcessAsUserW.argtypes = [
                        ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_wchar_p,
                        ctypes.c_void_p, ctypes.c_void_p, ctypes.wintypes.BOOL,
                        ctypes.wintypes.DWORD, ctypes.c_void_p, ctypes.c_wchar_p,
                        ctypes.c_void_p, ctypes.c_void_p,
                    ]
                    advapi32.CreateProcessAsUserW.restype = ctypes.wintypes.BOOL
                    
                    result = advapi32.CreateProcessAsUserW(
                        hDupToken,
                        None,
                        cmdline,
                        None, None,
                        False,  # don't inherit handles
                        CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT,
                        lpEnvironment if env_ok else None,
                        None,
                        ctypes.byref(si),
                        ctypes.byref(pi),
                    )
                    
                    if not result:
                        err = kernel32.GetLastError()
                        log.error(f"CreateProcessAsUserW for mstsc failed: {err}")
                        return False
                    
                    self._mstsc_pid = pi.dwProcessId
                    log.info(f"mstsc launched: PID={pi.dwProcessId}")
                    
                    kernel32.CloseHandle(pi.hThread)
                    kernel32.CloseHandle(pi.hProcess)
                    return True
                    
                finally:
                    kernel32.CloseHandle(hDupToken)
            finally:
                kernel32.CloseHandle(hUserToken)
                
        except Exception as e:
            log.error(f"Failed to launch mstsc in user session: {e}", exc_info=True)
            return False
    
    def _check_rdp_session_active(self):
        """Check if an RDP session exists (beyond Session 0 console)."""
        try:
            import ctypes
            import ctypes.wintypes
            kernel32 = ctypes.windll.kernel32
            wtsapi32 = ctypes.windll.wtsapi32
            
            WTS_CURRENT_SERVER_HANDLE = ctypes.c_void_p(0)
            WTS_SESSION_INFO = ctypes.POINTER(ctypes.c_void_p)  # We'll use the API differently
            
            # Use PowerShell as a simpler approach
            result = subprocess.run(
                ['powershell', '-Command',
                 '(Get-WmiObject Win32_LogonSession | Where-Object {$_.LogonType -eq 10} | Measure-Object).Count'],
                capture_output=True, text=True, timeout=10
            )
            # LogonType 10 = RemoteInteractive (RDP)
            count = int(result.stdout.strip()) if result.stdout.strip().isdigit() else 0
            return count > 0
        except Exception:
            # Simpler check: enumerate sessions
            try:
                result = subprocess.run(
                    ['powershell', '-Command',
                     'query session | Select-String "rdp-tcp"'],
                    capture_output=True, text=True, timeout=10
                )
                return 'rdp-tcp' in result.stdout.lower()
            except Exception:
                return False
    
    async def start_watchdog(self):
        """Background task that monitors and reconnects the RDP loopback session."""
        self._watchdog_task = asyncio.create_task(self._watchdog_loop())
    
    async def _watchdog_loop(self):
        """Periodically check RDP session and reconnect if needed."""
        while True:
            try:
                await asyncio.sleep(30)  # Check every 30 seconds
                if self._connected and not self._check_rdp_session_active():
                    log.warning("RDP loopback session lost, reconnecting...")
                    self._connected = False
                    self.connect()
            except asyncio.CancelledError:
                break
            except Exception as e:
                log.warning(f"RDP watchdog error: {e}")
    
    def disconnect(self):
        """Terminate the RDP loopback session."""
        self._connected = False
        if self._watchdog_task:
            self._watchdog_task.cancel()
            self._watchdog_task = None
        
        if self._mstsc_pid:
            try:
                subprocess.run(
                    ['taskkill', '/PID', str(self._mstsc_pid), '/F'],
                    capture_output=True, timeout=5
                )
                log.info(f"Terminated mstsc PID {self._mstsc_pid}")
            except Exception:
                pass
            self._mstsc_pid = None
        
        # Clean up stored credentials
        try:
            subprocess.run(
                ['cmdkey', '/delete:TERMSRV/localhost'],
                capture_output=True, timeout=5
            )
        except Exception:
            pass


# ──────────────────────── Screen Capture ────────────────────────

import base64
_HELPER_B64 = "IyEvdXNyL2Jpbi9lbnYgcHl0aG9uMwoiIiJTY3JlZW4gY2FwdHVyZSBoZWxwZXIgZm9yIFdlYlJUQyAtIHNwYXduZWQgaW4gdGhlIHVzZXIncyBpbnRlcmFjdGl2ZSBzZXNzaW9uLgoKT3V0cHV0cyByYXcgUkdCIGZyYW1lcyBvdmVyIHN0ZG91dCBhczoKICBoZWFkZXI6IDggYnl0ZXMgKHdpZHRoOjQgTEUgdWludDMyLCBoZWlnaHQ6NCBMRSB1aW50MzIpCiAgZm9sbG93ZWQgYnkgcmF3IFJHQiBwaXhlbCBkYXRhICh3aWR0aCAqIGhlaWdodCAqIDMgYnl0ZXMpCiAgVGhpcyByZXBlYXRzIGZvciBlYWNoIGZyYW1lIHJlcXVlc3QuCgpSZWFkcyBhIHNpbmdsZSBieXRlIGZyb20gc3RkaW4gdG8gdHJpZ2dlciBlYWNoIGNhcHR1cmUgKGZsb3cgY29udHJvbCkuCk9uIGVycm9yOiB3cml0ZXMgd2lkdGg9MCwgaGVpZ2h0PTAgZm9sbG93ZWQgYnkgZXJyb3IgbWVzc2FnZSBieXRlcy4KClRoZSBwcm9jZXNzIGlzIGxhdW5jaGVkIHZpYSBXVFNRdWVyeVVzZXJUb2tlbiArIENyZWF0ZVByb2Nlc3NBc1VzZXJXIGZyb20gdGhlClNZU1RFTSBhZ2VudCwgc28gaXQgcnVucyBpbiB0aGUgaW50ZXJhY3RpdmUgZGVza3RvcCBzZXNzaW9uIGFuZCBjYW4gY2FwdHVyZSB0aGUgc2NyZWVuLgoiIiIKaW1wb3J0IHN5cywgc3RydWN0LCBjdHlwZXMsIGN0eXBlcy53aW50eXBlcywgb3MKCkxPR19GSUxFID0gcidDOlxVc2Vyc1xQdWJsaWNcaGVscGVyX2RlYnVnLmxvZycKCmRlZiBsb2cobXNnKToKICAgIHRyeToKICAgICAgICB3aXRoIG9wZW4oTE9HX0ZJTEUsICdhJykgYXMgZjoKICAgICAgICAgICAgaW1wb3J0IHRpbWUKICAgICAgICAgICAgZi53cml0ZShmJ3t0aW1lLnRpbWUoKTouMWZ9OiB7bXNnfVxuJykKICAgICAgICAgICAgZi5mbHVzaCgpCiAgICBleGNlcHQ6CiAgICAgICAgcGFzcwoKZGVmIG1haW4oKToKICAgIGxvZygnSGVscGVyIHN0YXJ0aW5nJykKICAgIHVzZXIzMiA9IGN0eXBlcy53aW5kbGwudXNlcjMyCiAgICBnZGkzMiA9IGN0eXBlcy53aW5kbGwuZ2RpMzIKICAgIGtlcm5lbDMyID0gY3R5cGVzLndpbmRsbC5rZXJuZWwzMgoKICAgIFNSQ0NPUFkgPSAweDAwQ0MwMDIwCgogICAgIyBTZXQgYmluYXJ5IG1vZGUgZm9yIHN0ZGluL3N0ZG91dAogICAgaW1wb3J0IG1zdmNydAogICAgbXN2Y3J0LnNldG1vZGUoc3lzLnN0ZGluLmZpbGVubygpLCBvcy5PX0JJTkFSWSkKICAgIG1zdmNydC5zZXRtb2RlKHN5cy5zdGRvdXQuZmlsZW5vKCksIG9zLk9fQklOQVJZKQogICAgbG9nKCdCaW5hcnkgbW9kZSBzZXQnKQoKICAgICMgLS0tIFdpbmRvdyBTdGF0aW9uIC8gRGVza3RvcCBzd2l0Y2hpbmcgLS0tCiAgICAjIEV2ZW4gd2hlbiBsYXVuY2hlZCB2aWEgQ3JlYXRlUHJvY2Vzc0FzVXNlclcgaW4gdGhlIGNvcnJlY3Qgc2Vzc2lvbiwKICAgICMgdGhlIHByb2Nlc3MgbWF5IG5vdCBiZSBhdHRhY2hlZCB0byB0aGUgcmlnaHQgd2luZG93IHN0YXRpb24vZGVza3RvcC4KICAgICMgRXhwbGljaXRseSBzd2l0Y2ggdG8gV2luU3RhMCBhbmQgdHJ5IERlZmF1bHQgdGhlbiBXaW5sb2dvbiBkZXNrdG9wcy4KICAgIHRyeToKICAgICAgICBXSU5TVEFfQUxMID0gMHgwMzdGCiAgICAgICAgREVTS1RPUF9BTEwgPSAweDAxRkYKCiAgICAgICAgIyBPcGVuIFdpblN0YTAgKHRoZSBpbnRlcmFjdGl2ZSB3aW5kb3cgc3RhdGlvbikKICAgICAgICB1c2VyMzIuT3BlbldpbmRvd1N0YXRpb25XLnJlc3R5cGUgPSBjdHlwZXMuY192b2lkX3AKICAgICAgICB1c2VyMzIuT3BlbldpbmRvd1N0YXRpb25XLmFyZ3R5cGVzID0gW2N0eXBlcy5jX3djaGFyX3AsIGN0eXBlcy5jX2Jvb2wsIGN0eXBlcy5jX3Vsb25nXQogICAgICAgIGhXaW5TdGEgPSB1c2VyMzIuT3BlbldpbmRvd1N0YXRpb25XKCJXaW5TdGEwIiwgRmFsc2UsIFdJTlNUQV9BTEwpCiAgICAgICAgaWYgaFdpblN0YToKICAgICAgICAgICAgbG9nKGYnT3BlbmVkIFdpblN0YTA6IHtoV2luU3RhfScpCiAgICAgICAgICAgIGlmIHVzZXIzMi5TZXRQcm9jZXNzV2luZG93U3RhdGlvbihoV2luU3RhKToKICAgICAgICAgICAgICAgIGxvZygnU2V0UHJvY2Vzc1dpbmRvd1N0YXRpb24oV2luU3RhMCkgT0snKQogICAgICAgICAgICBlbHNlOgogICAgICAgICAgICAgICAgbG9nKGYnU2V0UHJvY2Vzc1dpbmRvd1N0YXRpb24gZmFpbGVkOiB7a2VybmVsMzIuR2V0TGFzdEVycm9yKCl9JykKCiAgICAgICAgICAgICMgVHJ5IERlZmF1bHQgZGVza3RvcCBmaXJzdCAodXNlciBkZXNrdG9wKSwgdGhlbiBXaW5sb2dvbiAobG9naW4gc2NyZWVuKQogICAgICAgICAgICB1c2VyMzIuT3BlbkRlc2t0b3BXLnJlc3R5cGUgPSBjdHlwZXMuY192b2lkX3AKICAgICAgICAgICAgdXNlcjMyLk9wZW5EZXNrdG9wVy5hcmd0eXBlcyA9IFtjdHlwZXMuY193Y2hhcl9wLCBjdHlwZXMuY191bG9uZywgY3R5cGVzLmNfYm9vbCwgY3R5cGVzLmNfdWxvbmddCiAgICAgICAgICAgIGZvciBkZXNrX25hbWUgaW4gWyJEZWZhdWx0IiwgIldpbmxvZ29uIl06CiAgICAgICAgICAgICAgICBoRGVzayA9IHVzZXIzMi5PcGVuRGVza3RvcFcoZGVza19uYW1lLCAwLCBGYWxzZSwgREVTS1RPUF9BTEwpCiAgICAgICAgICAgICAgICBpZiBoRGVzazoKICAgICAgICAgICAgICAgICAgICBpZiB1c2VyMzIuU2V0VGhyZWFkRGVza3RvcChoRGVzayk6CiAgICAgICAgICAgICAgICAgICAgICAgIGxvZyhmJ1NldFRocmVhZERlc2t0b3Aoe2Rlc2tfbmFtZX0pIE9LJykKICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWsKICAgICAgICAgICAgICAgICAgICBlbHNlOgogICAgICAgICAgICAgICAgICAgICAgICBsb2coZidTZXRUaHJlYWREZXNrdG9wKHtkZXNrX25hbWV9KSBmYWlsZWQ6IHtrZXJuZWwzMi5HZXRMYXN0RXJyb3IoKX0nKQogICAgICAgICAgICAgICAgZWxzZToKICAgICAgICAgICAgICAgICAgICBsb2coZidPcGVuRGVza3RvcCh7ZGVza19uYW1lfSkgZmFpbGVkOiB7a2VybmVsMzIuR2V0TGFzdEVycm9yKCl9JykKICAgICAgICBlbHNlOgogICAgICAgICAgICBsb2coZidPcGVuV2luZG93U3RhdGlvbihXaW5TdGEwKSBmYWlsZWQ6IHtrZXJuZWwzMi5HZXRMYXN0RXJyb3IoKX0nKQogICAgZXhjZXB0IEV4Y2VwdGlvbiBhcyBlOgogICAgICAgIGxvZyhmJ1dpblN0YS9EZXNrdG9wIHN3aXRjaCBlcnJvcjoge2V9JykKICAgICMgLS0tIEVuZCBXaW5kb3cgU3RhdGlvbiAvIERlc2t0b3Agc3dpdGNoaW5nIC0tLQoKICAgIHRyeToKICAgICAgICB3ID0gdXNlcjMyLkdldFN5c3RlbU1ldHJpY3MoMCkKICAgICAgICBoID0gdXNlcjMyLkdldFN5c3RlbU1ldHJpY3MoMSkKICAgICAgICBsb2coZidTY3JlZW46IHt3fXh7aH0nKQogICAgICAgIGlmIHcgPD0gMCBvciBoIDw9IDA6CiAgICAgICAgICAgIHN5cy5zdGRvdXQuYnVmZmVyLndyaXRlKHN0cnVjdC5wYWNrKCc8SUknLCAwLCAwKSArIGIiQmFkIGRpbWVuc2lvbnMiKQogICAgICAgICAgICBzeXMuc3Rkb3V0LmJ1ZmZlci5mbHVzaCgpCiAgICAgICAgICAgIHJldHVybgoKICAgICAgICBoZGMgPSB1c2VyMzIuR2V0REMoMCkKICAgICAgICBlcnIgPSBrZXJuZWwzMi5HZXRMYXN0RXJyb3IoKQogICAgICAgIGxvZyhmJ0dldERDOiBoZGM9e2hkY30gZXJyPXtlcnJ9JykKICAgICAgICBpZiBub3QgaGRjOgogICAgICAgICAgICBzeXMuc3Rkb3V0LmJ1ZmZlci53cml0ZShzdHJ1Y3QucGFjaygnPElJJywgMCwgMCkgKyBiIkdldERDIGZhaWxlZCIpCiAgICAgICAgICAgIHN5cy5zdGRvdXQuYnVmZmVyLmZsdXNoKCkKICAgICAgICAgICAgcmV0dXJuCgogICAgICAgIG1lbSA9IGdkaTMyLkNyZWF0ZUNvbXBhdGlibGVEQyhoZGMpCiAgICAgICAgZXJyID0ga2VybmVsMzIuR2V0TGFzdEVycm9yKCkKICAgICAgICBsb2coZidDcmVhdGVDb21wYXRpYmxlREM6IG1lbT17bWVtfSBlcnI9e2Vycn0nKQogICAgICAgIAogICAgICAgIGJtcCA9IGdkaTMyLkNyZWF0ZUNvbXBhdGlibGVCaXRtYXAoaGRjLCB3LCBoKQogICAgICAgIGVyciA9IGtlcm5lbDMyLkdldExhc3RFcnJvcigpCiAgICAgICAgbG9nKGYnQ3JlYXRlQ29tcGF0aWJsZUJpdG1hcDogYm1wPXtibXB9IGVycj17ZXJyfScpCiAgICAgICAgCiAgICAgICAgb2xkID0gZ2RpMzIuU2VsZWN0T2JqZWN0KG1lbSwgYm1wKQogICAgICAgIGVyciA9IGtlcm5lbDMyLkdldExhc3RFcnJvcigpCiAgICAgICAgbG9nKGYnU2VsZWN0T2JqZWN0OiBvbGQ9e29sZH0gZXJyPXtlcnJ9JykKCiAgICAgICAgIyBUcnkgb25lIGluaXRpYWwgQml0Qmx0IHRvIHZlcmlmeQogICAgICAgIHJldCA9IGdkaTMyLkJpdEJsdChtZW0sIDAsIDAsIHcsIGgsIGhkYywgMCwgMCwgU1JDQ09QWSkKICAgICAgICBlcnIgPSBrZXJuZWwzMi5HZXRMYXN0RXJyb3IoKQogICAgICAgIGxvZyhmJ0luaXRpYWwgQml0Qmx0OiByZXQ9e3JldH0gZXJyPXtlcnJ9JykKICAgICAgICAKICAgICAgICBpbXBvcnQgbnVtcHkgYXMgbnAKICAgICAgICBmcmFtZV9udW0gPSAwCiAgICAgICAgd2hpbGUgVHJ1ZToKICAgICAgICAgICAgIyBXYWl0IGZvciBzaWduYWwgdG8gY2FwdHVyZSBuZXh0IGZyYW1lCiAgICAgICAgICAgIHRyeToKICAgICAgICAgICAgICAgIGNtZCA9IHN5cy5zdGRpbi5idWZmZXIucmVhZCgxKQogICAgICAgICAgICAgICAgaWYgbm90IGNtZCBvciBjbWQgPT0gYidceDAwJzoKICAgICAgICAgICAgICAgICAgICBsb2coJ0dvdCBzdG9wIHNpZ25hbCcpCiAgICAgICAgICAgICAgICAgICAgYnJlYWsKICAgICAgICAgICAgZXhjZXB0IEV4Y2VwdGlvbiBhcyBlOgogICAgICAgICAgICAgICAgbG9nKGYnc3RkaW4gcmVhZCBlcnJvcjoge2V9JykKICAgICAgICAgICAgICAgIGJyZWFrCgogICAgICAgICAgICAjIFJlLWNhcHR1cmUgc2NyZWVuCiAgICAgICAgICAgIGtlcm5lbDMyLlNldExhc3RFcnJvcigwKQogICAgICAgICAgICByZXQgPSBnZGkzMi5CaXRCbHQobWVtLCAwLCAwLCB3LCBoLCBoZGMsIDAsIDAsIFNSQ0NPUFkpCiAgICAgICAgICAgIGVyciA9IGtlcm5lbDMyLkdldExhc3RFcnJvcigpCiAgICAgICAgICAgIGlmIG5vdCByZXQ6CiAgICAgICAgICAgICAgICBsb2coZidCaXRCbHQgZmFpbGVkOiByZXQ9e3JldH0gZXJyPXtlcnJ9JykKICAgICAgICAgICAgICAgIHN5cy5zdGRvdXQuYnVmZmVyLndyaXRlKHN0cnVjdC5wYWNrKCc8SUknLCAwLCAwKSArIGIiQml0Qmx0IGZhaWxlZCIpCiAgICAgICAgICAgICAgICBzeXMuc3Rkb3V0LmJ1ZmZlci5mbHVzaCgpCiAgICAgICAgICAgICAgICBjb250aW51ZQoKICAgICAgICAgICAgY2xhc3MgQk1JKGN0eXBlcy5TdHJ1Y3R1cmUpOgogICAgICAgICAgICAgICAgX2ZpZWxkc18gPSBbCiAgICAgICAgICAgICAgICAgICAgKCJiaVNpemUiLCBjdHlwZXMud2ludHlwZXMuRFdPUkQpLAogICAgICAgICAgICAgICAgICAgICgiYmlXaWR0aCIsIGN0eXBlcy53aW50eXBlcy5MT05HKSwKICAgICAgICAgICAgICAgICAgICAoImJpSGVpZ2h0IiwgY3R5cGVzLndpbnR5cGVzLkxPTkcpLAogICAgICAgICAgICAgICAgICAgICgiYmlQbGFuZXMiLCBjdHlwZXMud2ludHlwZXMuV09SRCksCiAgICAgICAgICAgICAgICAgICAgKCJiaUJpdENvdW50IiwgY3R5cGVzLndpbnR5cGVzLldPUkQpLAogICAgICAgICAgICAgICAgICAgICgiYmlDb21wcmVzc2lvbiIsIGN0eXBlcy53aW50eXBlcy5EV09SRCksCiAgICAgICAgICAgICAgICAgICAgKCJiaVNpemVJbWFnZSIsIGN0eXBlcy53aW50eXBlcy5EV09SRCksCiAgICAgICAgICAgICAgICAgICAgKCJiaVhQZWxzUGVyTWV0ZXIiLCBjdHlwZXMud2ludHlwZXMuTE9ORyksCiAgICAgICAgICAgICAgICAgICAgKCJiaVlQZWxzUGVyTWV0ZXIiLCBjdHlwZXMud2ludHlwZXMuTE9ORyksCiAgICAgICAgICAgICAgICAgICAgKCJiaUNsclVzZWQiLCBjdHlwZXMud2ludHlwZXMuRFdPUkQpLAogICAgICAgICAgICAgICAgICAgICgiYmlDbHJJbXBvcnRhbnQiLCBjdHlwZXMud2ludHlwZXMuRFdPUkQpLAogICAgICAgICAgICAgICAgXQoKICAgICAgICAgICAgYm1pID0gQk1JKCkKICAgICAgICAgICAgYm1pLmJpU2l6ZSA9IGN0eXBlcy5zaXplb2YoQk1JKQogICAgICAgICAgICBibWkuYmlXaWR0aCA9IHcKICAgICAgICAgICAgYm1pLmJpSGVpZ2h0ID0gLWggICMgdG9wLWRvd24KICAgICAgICAgICAgYm1pLmJpUGxhbmVzID0gMQogICAgICAgICAgICBibWkuYmlCaXRDb3VudCA9IDMyICAjIEJHUkEKCgogICAgICAgICAgICBidWYgPSBjdHlwZXMuY3JlYXRlX3N0cmluZ19idWZmZXIodyAqIGggKiA0KQogICAgICAgICAgICByb3dzID0gZ2RpMzIuR2V0RElCaXRzKG1lbSwgYm1wLCAwLCBoLCBidWYsIGN0eXBlcy5ieXJlZihibWkpLCAwKQogICAgICAgICAgICBlcnIgPSBrZXJuZWwzMi5HZXRMYXN0RXJyb3IoKQoKICAgICAgICAgICAgaWYgcm93cyA9PSAwOgogICAgICAgICAgICAgICAgbG9nKGYnR2V0RElCaXRzIDAgcm93cywgZXJyPXtlcnJ9JykKICAgICAgICAgICAgICAgIHN5cy5zdGRvdXQuYnVmZmVyLndyaXRlKHN0cnVjdC5wYWNrKCc8SUknLCAwLCAwKSArIGIiR2V0RElCaXRzIDAgcm93cyIpCiAgICAgICAgICAgICAgICBzeXMuc3Rkb3V0LmJ1ZmZlci5mbHVzaCgpCiAgICAgICAgICAgICAgICBjb250aW51ZQoKICAgICAgICAgICAgIyBDb252ZXJ0IEJHUkEgLT4gUkdCIGluLXBsYWNlCiAgICAgICAgICAgIGFyciA9IG5wLmZyb21idWZmZXIoYnVmLCBkdHlwZT1ucC51aW50OCkucmVzaGFwZShoLCB3LCA0KQogICAgICAgICAgICByZ2IgPSBucC5hc2NvbnRpZ3VvdXNhcnJheShhcnJbOiwgOiwgMjo6LTFdKSAgIyBCR1JBLT5SR0I6IGNoYW5uZWwgaW5kaWNlcyAyLDEsMCAoc2tpcCBhbHBoYSkKICAgICAgICAgICAgCiAgICAgICAgICAgIGlmIGZyYW1lX251bSA9PSAwOgogICAgICAgICAgICAgICAgc2FtcGxlID0gYXJyWzAsIDBdLnRvbGlzdCgpCiAgICAgICAgICAgICAgICBsb2coZidGaXJzdCBmcmFtZTogcm93cz17cm93c30sIHBpeGVsPXtzYW1wbGV9JykKCiAgICAgICAgICAgIGhlYWRlciA9IHN0cnVjdC5wYWNrKCc8SUknLCB3LCBoKQogICAgICAgICAgICBzeXMuc3Rkb3V0LmJ1ZmZlci53cml0ZShoZWFkZXIgKyByZ2IudG9ieXRlcygpKQogICAgICAgICAgICBzeXMuc3Rkb3V0LmJ1ZmZlci5mbHVzaCgpCiAgICAgICAgICAgIGZyYW1lX251bSArPSAxCgogICAgICAgICMgQ2xlYW51cAogICAgICAgIGdkaTMyLlNlbGVjdE9iamVjdChtZW0sIG9sZCkKICAgICAgICBnZGkzMi5EZWxldGVPYmplY3QoYm1wKQogICAgICAgIGdkaTMyLkRlbGV0ZURDKG1lbSkKICAgICAgICB1c2VyMzIuUmVsZWFzZURDKDAsIGhkYykKICAgICAgICBsb2coZidDbGVhbmVkIHVwIGFmdGVyIHtmcmFtZV9udW19IGZyYW1lcycpCgogICAgZXhjZXB0IEV4Y2VwdGlvbiBhcyBlOgogICAgICAgIGxvZyhmJ0V4Y2VwdGlvbjoge2V9JykKICAgICAgICB0cnk6CiAgICAgICAgICAgIHN5cy5zdGRvdXQuYnVmZmVyLndyaXRlKHN0cnVjdC5wYWNrKCc8SUknLCAwLCAwKSArIHN0cihlKS5lbmNvZGUoJ3V0Zi04JykpCiAgICAgICAgICAgIHN5cy5zdGRvdXQuYnVmZmVyLmZsdXNoKCkKICAgICAgICBleGNlcHQ6CiAgICAgICAgICAgIHBhc3MKCmlmIF9fbmFtZV9fID09ICJfX21haW5fXyI6CiAgICBtYWluKCkK"
_WEBCAPTURE_HELPER_SCRIPT = base64.b64decode(_HELPER_B64).decode("utf-8")


class ScreenCapture:
    """Screen capture with layered capture strategy.
    
    Layered capture strategy:
      1. DXGI Desktop Duplication (via dxcam) — fastest, GPU-accelerated
      2. BitBlt helper subprocess in interactive session (fallback)
      3. RDP loopback + BitBlt (for headless VMs)
      4. Fallback black frames
    
    The helper process runs via WTSQueryUserToken + CreateProcessAsUserW in the
    user's interactive desktop session where BitBlt captures real pixels.
    """

    def __init__(self, rdp_user: str = "", rdp_pass: str = "", target_session: int = -1):
        self._method = None
        self._started = False
        self.width = 1920
        self.height = 1080
        self._helper_proc = None
        self._helper_path = None
        self._last_frame = None
        self._frame_count = 0
        self._rdp_session = None
        self._capture_mode = "unknown"  # For logging: "dxcam_direct", "helper", "direct", "rdp_loopback", "dxcam", "failed"
        self._target_session = target_session
        self._dxcam = None  # dxcam camera instance for DXGI Desktop Duplication
        
        # RDP credentials: from args, then env vars, then config file
        self._rdp_user = rdp_user or os.environ.get("OPENRMM_RDP_USER", "")
        self._rdp_pass = rdp_pass or os.environ.get("OPENRMM_RDP_PASS", "")
        if not self._rdp_user or not self._rdp_pass:
            # Try reading from agent config file
            try:
                config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "webrtc_config.json")
                if os.path.exists(config_path):
                    with open(config_path, 'r') as f:
                        cfg = json.load(f)
                    self._rdp_user = self._rdp_user or cfg.get("rdp_user", "")
                    self._rdp_pass = self._rdp_pass or cfg.get("rdp_pass", "")
            except Exception:
                pass

    def start(self):
        if self._started:
            return
        
        if sys.platform != "win32":
            log.error("Screen capture only supported on Windows")
            return
        
        # Write the helper script
        self._helper_path = os.path.join(
            os.environ.get('PUBLIC', r'C:\Users\Public'), 'openrmm_webrtc_helper.py'
        )
        try:
            with open(self._helper_path, 'w') as f:
                f.write(_WEBCAPTURE_HELPER_SCRIPT)
            log.info(f"Wrote WebRTC capture helper to {self._helper_path}")
        except Exception as e:
            log.error(f"Failed to write capture helper: {e}")
            import tempfile
            self._helper_path = os.path.join(tempfile.gettempdir(), 'openrmm_webrtc_helper.py')
            try:
                with open(self._helper_path, 'w') as f:
                    f.write(_WEBCAPTURE_HELPER_SCRIPT)
                log.info(f"Wrote WebRTC capture helper to fallback {self._helper_path}")
            except Exception as e2:
                log.error(f"Failed to write capture helper to fallback: {e2}")
                return
        
        # ── Layer 0: DXGI Desktop Duplication (via dxcam) — fastest, primary method ──
        # dxcam wraps DXGI Desktop Duplication API which uses GPU-accelerated
        # frame acquisition. It must be created and used from the same process,
        # and must run in the user's interactive session (not SYSTEM/Session 0).
        # Since this agent runs in the user's session (launched via
        # CreateProcessAsUserW or from the user's desktop), dxcam works directly.
        log.info("Attempting DXGI Desktop Duplication capture (dxcam)...")
        try:
            import dxcam
            cam = dxcam.create(output_idx=0, output_color="rgb")
            frame = cam.grab()
            if frame is not None:
                self.height, self.width = frame.shape[:2]
                self._dxcam = cam
                self._method = "dxcam_direct"
                self._started = True
                self._capture_mode = "dxcam_direct"
                log.info(f"Screen capture started: DXGI Desktop Duplication (dxcam) {self.width}x{self.height}")
                return
            else:
                # dxcam created but grab returned None — display may not be ready
                cam.release()
                log.warning("dxcam created but grab() returned None — display may not be active")
        except ImportError:
            log.info("dxcam not installed — DXGI Desktop Duplication unavailable")
        except Exception as e:
            log.warning(f"DXGI Desktop Duplication (dxcam) failed: {e}")
        
        # ── Layer 1: BitBlt capture helper in interactive session ──
        # BitBlt test from Session 0 is unreliable on headless VMs — it returns
        # all-black even when VDD (Virtual Display Driver) provides a real display
        # to Session 1. The helper process runs via CreateProcessAsUserW in the
        # user's interactive desktop where BitBlt captures real pixels.
        log.info("Attempting launch of BitBlt capture helper in interactive session...")
        if self._launch_helper(target_session_id=self._target_session):
            self._method = "subprocess"
            self._started = True
            self._capture_mode = "helper"
            log.info("Screen capture started: BitBlt helper mode (interactive session)")
            return
        else:
            log.warning("Capture helper launch failed, trying fallback methods...")
        
        # ── Layer 2: Fallback — test direct BitBlt from this process ──
        log.info("Testing direct BitBlt capture...")
        bitblt_ok = test_bitblt_available()
        
        if bitblt_ok:
            log.info("Direct BitBlt works — retrying helper launch")
            if self._launch_helper(target_session_id=self._target_session):
                self._method = "subprocess"
                self._started = True
                self._capture_mode = "direct"
                log.info("Screen capture started: BitBlt direct mode")
                return
        
        # ── Layer 3: RDP loopback fallback ──
        vm = is_virtual_machine()
        log.info(f"BitBlt returned all-black. VM detected: {vm}")
        
        if not vm:
            log.warning("Not a VM but BitBlt returned all-black — may be headless physical machine")
        
        # Try RDP loopback
        if self._try_rdp_loopback():
            log.info("RDP loopback session active, re-testing BitBlt...")
            time.sleep(3)
            bitblt_ok2 = test_bitblt_available()
            
            if bitblt_ok2:
                log.info("BitBlt works with RDP loopback — retrying helper")
                if self._launch_helper(target_session_id=self._target_session):
                    self._method = "subprocess"
                    self._started = True
                    self._capture_mode = "rdp_loopback"
                    log.info("Screen capture started: RDP loopback mode")
                    return
        
        # ── Nothing worked ──
        self._capture_mode = "failed"
        log.error("No screen capture method available!")
    
    def _try_rdp_loopback(self):
        """Attempt to start an RDP loopback session for headless VMs."""
        if not self._rdp_pass:
            log.warning("No RDP credentials configured — cannot start loopback session")
            return False
        
        self._rdp_session = RDPLoopbackSession(
            username=self._rdp_user, password=self._rdp_pass
        )
        
        try:
            result = self._rdp_session.connect()
            if result:
                log.info("RDP loopback connected successfully")
                # Start watchdog in background (will be joined with asyncio loop later)
                return True
            else:
                log.warning("RDP loopback connection failed")
                return False
        except Exception as e:
            log.error(f"RDP loopback exception: {e}", exc_info=True)
            return False
    
    async def start_rdp_watchdog(self):
        """Start the RDP loopback watchdog (call after asyncio loop is running)."""
        if self._rdp_session and self._rdp_session.is_connected:
            await self._rdp_session.start_watchdog()
    
    def configure_auto_logon(self):
        """Configure Windows auto-logon so the console session always has a logged-in user.
        
        Checks if auto-logon is already configured via registry key
        HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon.
        If AutoAdminLogon != "1", sets the required values using credentials
        from OPENRMM_RDP_USER and OPENRMM_RDP_PASS environment variables.
        
        Returns True if auto-logon is already set or was just configured, 
        False if credentials are missing or configuration failed.
        """
        try:
            import winreg
        except ImportError:
            log.error("configure_auto_logon: winreg module not available (not Windows?)")
            return False
        
        reg_path = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
        
        try:
            # Check if auto-logon is already configured
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, reg_path, 0, winreg.KEY_READ) as key:
                try:
                    auto_logon_val, _ = winreg.QueryValueEx(key, "AutoAdminLogon")
                    if str(auto_logon_val) == "1":
                        log.info("Auto-logon is already configured (AutoAdminLogon=1)")
                        return True
                except FileNotFoundError:
                    pass
            
            # Auto-logon not configured — check for credentials
            username = os.environ.get("OPENRMM_RDP_USER", "")
            password = os.environ.get("OPENRMM_RDP_PASS", "")
            
            if not username or not password:
                log.warning(
                    "Auto-logon not configured and credentials missing: "
                    "set OPENRMM_RDP_USER and OPENRMM_RDP_PASS environment variables"
                )
                return False
            
            # Get domain (hostname) for DefaultDomainName
            domain = os.environ.get("COMPUTERNAME", "")
            
            log.info(f"Configuring auto-logon for user '{username}' on domain '{domain}'")
            
            # Write auto-logon registry values
            try:
                with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, reg_path, 0, 
                                     winreg.KEY_WRITE) as key:
                    winreg.SetValueEx(key, "AutoAdminLogon", 0, winreg.REG_SZ, "1")
                    winreg.SetValueEx(key, "DefaultUserName", 0, winreg.REG_SZ, username)
                    winreg.SetValueEx(key, "DefaultPassword", 0, winreg.REG_SZ, password)
                    winreg.SetValueEx(key, "DefaultDomainName", 0, winreg.REG_SZ, domain)
                
                log.info("Auto-logon configured successfully — reboot required for it to take effect")
                return True
            except PermissionError as e:
                log.error(f"configure_auto_logon: permission denied writing registry: {e}")
                return False
            except Exception as e:
                log.error(f"configure_auto_logon: failed to write registry: {e}")
                return False
            
        except Exception as e:
            log.error(f"configure_auto_logon: unexpected error: {e}", exc_info=True)
            return False
    
    def _launch_helper(self, target_session_id: int = -1):
        """Launch a persistent capture helper process in the interactive session.
        
        Uses WTSQueryUserToken to get the logged-on user's token, then
        CreateProcessAsUserW to spawn the helper in their interactive session.
        """
        import ctypes
        import ctypes.wintypes
        
        kernel32 = ctypes.windll.kernel32
        advapi32 = ctypes.windll.advapi32
        wtsapi32 = ctypes.windll.wtsapi32
        userenv = ctypes.windll.userenv
        
        try:
            hUserToken = ctypes.wintypes.HANDLE()
            target_session = None
            
            if target_session_id >= 0:
                # Use the explicitly specified session
                sessions = enumerate_sessions()
                for s in sessions:
                    if s['session_id'] == target_session_id:
                        target_session = target_session_id
                        log.info(f"Using explicit target session: {target_session_id}")
                        if not wtsapi32.WTSQueryUserToken(target_session_id, ctypes.byref(hUserToken)):
                            err = kernel32.GetLastError()
                            log.warning(f"WTSQueryUserToken({target_session_id}) failed: {err}, falling back to SYSTEM launch")
                            # Fall back to launching as SYSTEM with desktop assignment
                            # The helper script handles window station switching internally
                            return self._launch_helper_as_system(target_session_id)
                        break
                if target_session is None:
                    log.error(f"Session {target_session_id} not found in enumerate_sessions()")
                    return False
            else:
                # Auto-detect: find a session with a logged-in user
                kernel32.WTSGetActiveConsoleSessionId.restype = ctypes.wintypes.UINT
                console_session_id = kernel32.WTSGetActiveConsoleSessionId()
                log.info(f"Capture helper: console session ID = {console_session_id}")
                
                # First, try WTSQueryUserToken on the console session
                if console_session_id != 0 and console_session_id != 0xFFFFFFFF:
                    if wtsapi32.WTSQueryUserToken(console_session_id, ctypes.byref(hUserToken)):
                        target_session = console_session_id
                        log.info(f"WTSQueryUserToken({console_session_id}) succeeded, token={hUserToken.value}")
                    else:
                        err = kernel32.GetLastError()
                        log.debug(f"WTSQueryUserToken({console_session_id}) failed: {err}")
                
                # If console session has no user, try other sessions
                if target_session is None:
                    for sid in [1, 2, 3, 4, 5]:
                        if sid == console_session_id:
                            continue  # Already tried
                        if wtsapi32.WTSQueryUserToken(sid, ctypes.byref(hUserToken)):
                            target_session = sid
                            log.info(f"WTSQueryUserToken({sid}) succeeded, token={hUserToken.value}")
                            break
                        else:
                            err = kernel32.GetLastError()
                            log.debug(f"WTSQueryUserToken({sid}) failed: {err}")
                
                if target_session is None:
                    # No logged-in user found in any session
                    # Check auto-logon configuration before falling through to SYSTEM
                    auto_logon_ok = self.configure_auto_logon()
                    if auto_logon_ok:
                        log.warning(
                            "No logged-in user on console session and auto-logon is configured. "
                            "The machine needs rebooting for auto-logon to take effect and enable console capture."
                        )
                    else:
                        log.warning(
                            "No logged-in user on console session and auto-logon could not be configured. "
                            "Set OPENRMM_RDP_USER and OPENRMM_RDP_PASS environment variables and reboot "
                            "for reliable console session capture."
                        )
                    # Do NOT fall through to _launch_helper_as_system for console capture —
                    # SYSTEM fallback cannot capture screens without a logged-in user
                    return False
            
            try:
                MAXIMUM_ALLOWED = 0x2000000
                TOKEN_PRIMARY = 1
                SECURITY_DELEGATION = 3
                
                hDupToken = ctypes.wintypes.HANDLE()
                advapi32.DuplicateTokenEx.argtypes = [
                    ctypes.c_void_p, ctypes.wintypes.DWORD, ctypes.c_void_p,
                    ctypes.wintypes.DWORD, ctypes.wintypes.DWORD,
                    ctypes.POINTER(ctypes.wintypes.HANDLE)
                ]
                advapi32.DuplicateTokenEx.restype = ctypes.wintypes.BOOL
                
                if not advapi32.DuplicateTokenEx(
                    hUserToken, MAXIMUM_ALLOWED, None,
                    SECURITY_DELEGATION, TOKEN_PRIMARY,
                    ctypes.byref(hDupToken)
                ):
                    err = kernel32.GetLastError()
                    log.error(f"DuplicateTokenEx failed: {err}")
                    return False
                
                log.info(f"Duplicated user token: {hDupToken.value}")
                
                try:
                    lpEnvironment = ctypes.c_void_p()
                    env_ok = userenv.CreateEnvironmentBlock(
                        ctypes.byref(lpEnvironment), hDupToken, False
                    )
                    if not env_ok:
                        log.warning(f"CreateEnvironmentBlock failed: {kernel32.GetLastError()}")
                    
                    # Create pipes for stdin/stdout communication
                    class SECURITY_ATTR(ctypes.Structure):
                        _fields_ = [
                            ("nLength", ctypes.wintypes.DWORD),
                            ("lpSecurityDescriptor", ctypes.c_void_p),
                            ("bInheritHandle", ctypes.wintypes.BOOL),
                        ]
                    
                    sa = SECURITY_ATTR()
                    sa.nLength = ctypes.sizeof(SECURITY_ATTR)
                    sa.lpSecurityDescriptor = None
                    sa.bInheritHandle = True
                    
                    kernel32.CreatePipe.argtypes = [
                        ctypes.POINTER(ctypes.c_void_p), ctypes.POINTER(ctypes.c_void_p),
                        ctypes.c_void_p, ctypes.wintypes.DWORD
                    ]
                    kernel32.CreatePipe.restype = ctypes.wintypes.BOOL
                    
                    h_stdin_read = ctypes.c_void_p()
                    h_stdin_write = ctypes.c_void_p()
                    if not kernel32.CreatePipe(
                        ctypes.byref(h_stdin_read), ctypes.byref(h_stdin_write),
                        ctypes.byref(sa), 0
                    ):
                        log.error(f"CreatePipe (stdin) failed: {kernel32.GetLastError()}")
                        return False
                    
                    h_stdout_read = ctypes.c_void_p()
                    h_stdout_write = ctypes.c_void_p()
                    if not kernel32.CreatePipe(
                        ctypes.byref(h_stdout_read), ctypes.byref(h_stdout_write),
                        ctypes.byref(sa), 0
                    ):
                        log.error(f"CreatePipe (stdout) failed: {kernel32.GetLastError()}")
                        kernel32.CloseHandle(h_stdin_read)
                        kernel32.CloseHandle(h_stdin_write)
                        return False
                    
                    kernel32.SetHandleInformation.argtypes = [
                        ctypes.c_void_p, ctypes.wintypes.DWORD, ctypes.wintypes.DWORD
                    ]
                    kernel32.SetHandleInformation.restype = ctypes.wintypes.BOOL
                    kernel32.SetHandleInformation(h_stdin_write, 1, 0)
                    kernel32.SetHandleInformation(h_stdout_read, 1, 0)
                    
                    class STARTUPINFOW(ctypes.Structure):
                        _fields_ = [
                            ("cb", ctypes.wintypes.DWORD),
                            ("lpReserved", ctypes.c_wchar_p),
                            ("lpDesktop", ctypes.c_wchar_p),
                            ("lpTitle", ctypes.c_wchar_p),
                            ("dwX", ctypes.wintypes.DWORD), ("dwY", ctypes.wintypes.DWORD),
                            ("dwXSize", ctypes.wintypes.DWORD), ("dwYSize", ctypes.wintypes.DWORD),
                            ("dwXCountChars", ctypes.wintypes.DWORD), ("dwYCountChars", ctypes.wintypes.DWORD),
                            ("dwFillAttribute", ctypes.wintypes.DWORD),
                            ("dwFlags", ctypes.wintypes.DWORD),
                            ("wShowWindow", ctypes.wintypes.WORD),
                            ("cbReserved2", ctypes.wintypes.WORD),
                            ("lpReserved2", ctypes.c_void_p),
                            ("hStdInput", ctypes.c_void_p),
                            ("hStdOutput", ctypes.c_void_p),
                            ("hStdError", ctypes.c_void_p),
                        ]
                    
                    class PROCESS_INFORMATION(ctypes.Structure):
                        _fields_ = [
                            ("hProcess", ctypes.c_void_p),
                            ("hThread", ctypes.c_void_p),
                            ("dwProcessId", ctypes.wintypes.DWORD),
                            ("dwThreadId", ctypes.wintypes.DWORD),
                        ]
                    
                    si = STARTUPINFOW()
                    si.cb = ctypes.sizeof(STARTUPINFOW)
                    si.lpDesktop = "WinSta0\\Default"
                    si.dwFlags = 0x100  # STARTF_USESTDHANDLES
                    si.hStdInput = h_stdin_read
                    si.hStdOutput = h_stdout_write
                    si.hStdError = h_stdout_write
                    
                    pi = PROCESS_INFORMATION()
                    
                    cmdline = f'"{sys.executable.replace("python.exe", "pythonw.exe")}" "{self._helper_path}"'
                    
                    CREATE_NO_WINDOW = 0x08000000
                    CREATE_UNICODE_ENVIRONMENT = 0x00000400
                    
                    log.info(f"Launching capture helper in session {target_session}: {cmdline[:80]}")
                    
                    advapi32.CreateProcessAsUserW.argtypes = [
                        ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_wchar_p,
                        ctypes.c_void_p, ctypes.c_void_p, ctypes.wintypes.BOOL,
                        ctypes.wintypes.DWORD, ctypes.c_void_p, ctypes.c_wchar_p,
                        ctypes.c_void_p, ctypes.c_void_p,
                    ]
                    advapi32.CreateProcessAsUserW.restype = ctypes.wintypes.BOOL
                    
                    result = advapi32.CreateProcessAsUserW(
                        hDupToken,
                        None,
                        cmdline,
                        None, None,
                        True,
                        CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT,
                        lpEnvironment if env_ok else None,
                        None,
                        ctypes.byref(si),
                        ctypes.byref(pi),
                    )
                    
                    if not result:
                        err = kernel32.GetLastError()
                        log.error(f"CreateProcessAsUserW failed: {err}")
                        kernel32.CloseHandle(h_stdin_read)
                        kernel32.CloseHandle(h_stdin_write)
                        kernel32.CloseHandle(h_stdout_read)
                        kernel32.CloseHandle(h_stdout_write)
                        return False
                    
                    log.info(f"Capture helper launched: PID={pi.dwProcessId}")
                    
                    kernel32.CloseHandle(pi.hThread)
                    kernel32.CloseHandle(h_stdin_read)
                    kernel32.CloseHandle(h_stdout_write)
                    
                    self._helper_proc = {
                        'hProcess': pi.hProcess,
                        'pid': pi.dwProcessId,
                        'h_stdin_write': h_stdin_write,
                        'h_stdout_read': h_stdout_read,
                    }
                    
                    kernel32.ReadFile.argtypes = [
                        ctypes.c_void_p, ctypes.c_void_p, ctypes.wintypes.DWORD,
                        ctypes.POINTER(ctypes.wintypes.DWORD), ctypes.c_void_p
                    ]
                    kernel32.ReadFile.restype = ctypes.wintypes.BOOL
                    
                    kernel32.WriteFile.argtypes = [
                        ctypes.c_void_p, ctypes.c_void_p, ctypes.wintypes.DWORD,
                        ctypes.POINTER(ctypes.wintypes.DWORD), ctypes.c_void_p
                    ]
                    kernel32.WriteFile.restype = ctypes.wintypes.BOOL
                    
                    # Signal first capture
                    signal = ctypes.create_string_buffer(b'\x01')
                    written = ctypes.wintypes.DWORD()
                    kernel32.WriteFile(h_stdin_write, signal, 1, ctypes.byref(written), None)
                    
                    header_buf = ctypes.create_string_buffer(8)
                    bytes_read = ctypes.wintypes.DWORD()
                    if not kernel32.ReadFile(h_stdout_read, header_buf, 8, ctypes.byref(bytes_read), None) or bytes_read.value != 8:
                        log.error("Failed to read initial frame header from helper")
                        return False
                    
                    w, h = struct.unpack('<II', header_buf.raw[:8])
                    if w == 0 or h == 0:
                        error_msg = ctypes.create_string_buffer(256)
                        kernel32.ReadFile(h_stdout_read, error_msg, 256, ctypes.byref(bytes_read), None)
                        err_text = error_msg.raw[:bytes_read.value].decode('utf-8', errors='replace')
                        log.error(f"Capture helper error: {err_text}")
                        return False
                    
                    self.width = w
                    self.height = h
                    
                    frame_size = w * h * 3
                    frame_buf = ctypes.create_string_buffer(frame_size)
                    if not kernel32.ReadFile(h_stdout_read, frame_buf, frame_size, ctypes.byref(bytes_read), None) or bytes_read.value != frame_size:
                        log.error(f"Failed to read initial frame data: got {bytes_read.value}/{frame_size}")
                        return False
                    
                    import numpy as np
                    self._last_frame = np.frombuffer(frame_buf.raw[:frame_size], dtype=np.uint8).reshape(h, w, 3)
                    self._frame_count = 1
                    log.info(f"Capture helper started: {w}x{h}, first frame captured OK (mode={self._capture_mode})")
                    return True
                    
                finally:
                    kernel32.CloseHandle(hDupToken)
            finally:
                kernel32.CloseHandle(hUserToken)
        except Exception as e:
            log.error(f"Failed to launch capture helper: {e}", exc_info=True)
            return False

    def _launch_helper_as_system(self, target_session_id: int):
        """Launch capture helper as SYSTEM process in the target session's desktop.
        
        Used when WTSQueryUserToken fails (no logged-in user in the session).
        The helper script handles window station/desktop switching internally,
        so we just need to launch it in the right session with the right desktop.
        
        Strategy: Use CreateProcessAsUserW with the SYSTEM token itself,
        but set STARTUPINFO.lpDesktop = "WinSta0\\Default" and the session ID
        via SetTokenInformation(TokenSessionId).
        """
        import ctypes
        import ctypes.wintypes
        import struct
        
        log.warning(
            "SYSTEM fallback capture: screen capture without a logged-in user is not "
            "supported by most display adapters. Configure auto-logon for reliable "
            "console capture."
        )
        log.info(f"_launch_helper_as_system: launching in session {target_session_id}")
        
        kernel32 = ctypes.windll.kernel32
        advapi32 = ctypes.windll.advapi32
        
        # Get current process token (SYSTEM token)
        # GetCurrentProcess() returns a pseudo-handle; OpenProcessToken needs proper types
        kernel32.GetCurrentProcess.restype = ctypes.c_void_p
        hCurrentProcess = kernel32.GetCurrentProcess()
        
        advapi32.OpenProcessToken.argtypes = [ctypes.c_void_p, ctypes.wintypes.DWORD, ctypes.POINTER(ctypes.wintypes.HANDLE)]
        advapi32.OpenProcessToken.restype = ctypes.wintypes.BOOL
        
        hToken = ctypes.wintypes.HANDLE()
        if not advapi32.OpenProcessToken(hCurrentProcess, 0x0002 | 0x0008, ctypes.byref(hToken)):  # TOKEN_DUPLICATE | TOKEN_QUERY
            err = kernel32.GetLastError()
            log.error(f"OpenProcessToken failed: {err}")
            return False
        
        try:
            # Duplicate the token so we can modify it
            MAXIMUM_ALLOWED = 0x2000000
            TOKEN_PRIMARY = 1
            SECURITY_DELEGATION = 3
            
            hDupToken = ctypes.wintypes.HANDLE()
            advapi32.DuplicateTokenEx.argtypes = [
                ctypes.c_void_p, ctypes.wintypes.DWORD, ctypes.c_void_p,
                ctypes.wintypes.DWORD, ctypes.wintypes.DWORD,
                ctypes.POINTER(ctypes.wintypes.HANDLE)
            ]
            advapi32.DuplicateTokenEx.restype = ctypes.wintypes.BOOL
            
            if not advapi32.DuplicateTokenEx(
                hToken.value, MAXIMUM_ALLOWED, None,
                SECURITY_DELEGATION, TOKEN_PRIMARY,
                ctypes.byref(hDupToken)
            ):
                err = kernel32.GetLastError()
                log.error(f"DuplicateTokenEx for SYSTEM fallback failed: {err}")
                return False
            
            log.info(f"Duplicated SYSTEM token: {hDupToken.value}")
            
            try:
                # Set the session ID on the token so the process runs in the target session
                # TokenSessionInformation class
                TOKEN_SESSION_ID = 12  # TokenSessionId info class
                
                # Set the session ID in the duplicated token
                session_id_val = ctypes.wintypes.ULONG(target_session_id)
                advapi32.SetTokenInformation.argtypes = [
                    ctypes.c_void_p, ctypes.wintypes.DWORD,
                    ctypes.c_void_p, ctypes.wintypes.DWORD
                ]
                advapi32.SetTokenInformation.restype = ctypes.wintypes.BOOL
                
                if not advapi32.SetTokenInformation(
                    hDupToken.value, TOKEN_SESSION_ID,
                    ctypes.byref(session_id_val), ctypes.sizeof(session_id_val)
                ):
                    err = kernel32.GetLastError()
                    log.warning(f"SetTokenInformation(TokenSessionId={target_session_id}) failed: {err} - process may run in session 0")
                    # Not fatal - the helper's internal WinSta switching may still work
                else:
                    log.info(f"Set token session ID to {target_session_id}")
                
                # Create pipes for stdin/stdout
                SECURITY_ATTRIBUTES = type("SECURITY_ATTRIBUTES", (ctypes.Structure,), {
                    "_fields_": [
                        ("nLength", ctypes.wintypes.DWORD),
                        ("lpSecurityDescriptor", ctypes.c_void_p),
                        ("bInheritHandle", ctypes.wintypes.BOOL),
                    ]
                })
                
                sa = SECURITY_ATTRIBUTES()
                sa.nLength = ctypes.sizeof(SECURITY_ATTRIBUTES)
                sa.lpSecurityDescriptor = None
                sa.bInheritHandle = True
                
                h_stdin_read = ctypes.wintypes.HANDLE()
                h_stdin_write = ctypes.wintypes.HANDLE()
                h_stdout_read = ctypes.wintypes.HANDLE()
                h_stdout_write = ctypes.wintypes.HANDLE()
                
                kernel32.CreatePipe(ctypes.byref(h_stdin_read), ctypes.byref(h_stdin_write), ctypes.byref(sa), 0)
                kernel32.CreatePipe(ctypes.byref(h_stdout_read), ctypes.byref(h_stdout_write), ctypes.byref(sa), 0)
                
                # Make read/write handles non-inheritable
                kernel32.SetHandleInformation(h_stdin_write, 1, 0)  # HANDLE_FLAG_INHERIT=1
                kernel32.SetHandleInformation(h_stdout_read, 1, 0)
                
                # Write the helper script if not already present
                if not self._helper_path or not os.path.exists(self._helper_path):
                    self._helper_path = os.path.join(
                        os.environ.get('PUBLIC', r'C:\Users\Public'), 'openrmm_webrtc_helper.py'
                    )
                    try:
                        with open(self._helper_path, 'w') as f:
                            f.write(_WEBCAPTURE_HELPER_SCRIPT)
                        log.info(f"Wrote helper to {self._helper_path}")
                    except Exception as e:
                        log.error(f"Failed to write helper: {e}")
                        import tempfile
                        self._helper_path = os.path.join(tempfile.gettempdir(), 'openrmm_webrtc_helper.py')
                        with open(self._helper_path, 'w') as f:
                            f.write(_WEBCAPTURE_HELPER_SCRIPT)
                
                class STARTUPINFOW(ctypes.Structure):
                    _fields_ = [
                        ("cb", ctypes.wintypes.DWORD),
                        ("lpReserved", ctypes.c_wchar_p),
                        ("lpDesktop", ctypes.c_wchar_p),
                        ("lpTitle", ctypes.c_wchar_p),
                        ("dwX", ctypes.wintypes.DWORD), ("dwY", ctypes.wintypes.DWORD),
                        ("dwXSize", ctypes.wintypes.DWORD), ("dwYSize", ctypes.wintypes.DWORD),
                        ("dwXCountChars", ctypes.wintypes.DWORD), ("dwYCountChars", ctypes.wintypes.DWORD),
                        ("dwFillAttribute", ctypes.wintypes.DWORD),
                        ("dwFlags", ctypes.wintypes.DWORD),
                        ("wShowWindow", ctypes.wintypes.WORD),
                        ("cbReserved2", ctypes.wintypes.WORD),
                        ("lpReserved2", ctypes.c_void_p),
                        ("hStdInput", ctypes.c_void_p),
                        ("hStdOutput", ctypes.c_void_p),
                        ("hStdError", ctypes.c_void_p),
                    ]
                
                class PROCESS_INFORMATION(ctypes.Structure):
                    _fields_ = [
                        ("hProcess", ctypes.c_void_p),
                        ("hThread", ctypes.c_void_p),
                        ("dwProcessId", ctypes.wintypes.DWORD),
                        ("dwThreadId", ctypes.wintypes.DWORD),
                    ]
                
                si = STARTUPINFOW()
                si.cb = ctypes.sizeof(STARTUPINFOW)
                # Critical: assign to the interactive desktop in the target session
                si.lpDesktop = "WinSta0\\Default"
                si.dwFlags = 0x100  # STARTF_USESTDHANDLES
                si.hStdInput = h_stdin_read.value
                si.hStdOutput = h_stdout_write.value
                si.hStdError = h_stdout_write.value
                
                pi = PROCESS_INFORMATION()
                
                cmdline = f'"{sys.executable.replace("python.exe", "pythonw.exe")}" "{self._helper_path}"'
                
                CREATE_NO_WINDOW = 0x08000000
                CREATE_UNICODE_ENVIRONMENT = 0x00000400
                
                log.info(f"Launching SYSTEM capture helper for session {target_session_id}: {cmdline[:80]}")
                
                advapi32.CreateProcessAsUserW.argtypes = [
                    ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_wchar_p,
                    ctypes.c_void_p, ctypes.c_void_p, ctypes.wintypes.BOOL,
                    ctypes.wintypes.DWORD, ctypes.c_void_p, ctypes.c_wchar_p,
                    ctypes.c_void_p, ctypes.c_void_p,
                ]
                advapi32.CreateProcessAsUserW.restype = ctypes.wintypes.BOOL
                
                result = advapi32.CreateProcessAsUserW(
                    hDupToken.value,
                    None,
                    cmdline,
                    None, None, True,  # inherit handles
                    CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT,
                    None, None,
                    ctypes.byref(si),
                    ctypes.byref(pi),
                )
                
                err = kernel32.GetLastError()
                
                if not result:
                    log.error(f"CreateProcessAsUserW (SYSTEM fallback) failed: {err}")
                    return False
                
                log.info(f"SYSTEM helper launched: PID={pi.dwProcessId}")
                
                # Close unneeded handles
                kernel32.CloseHandle(h_stdin_read)
                kernel32.CloseHandle(h_stdout_write)
                kernel32.CloseHandle(pi.hProcess)
                kernel32.CloseHandle(pi.hThread)
                
                self._helper_proc = True  # Mark as subprocess mode
                self._h_stdin_write = h_stdin_write
                self._h_stdout_read = h_stdout_read
                
                # Signal first capture and read response
                signal = ctypes.create_string_buffer(b'\x01')
                written = ctypes.wintypes.DWORD()
                kernel32.WriteFile(h_stdin_write, signal, 1, ctypes.byref(written), None)
                
                header_buf = ctypes.create_string_buffer(8)
                bytes_read = ctypes.wintypes.DWORD()
                if not kernel32.ReadFile(h_stdout_read, header_buf, 8, ctypes.byref(bytes_read), None) or bytes_read.value != 8:
                    log.error("Failed to read initial frame header from SYSTEM helper")
                    return False
                
                w, h = struct.unpack('<II', header_buf.raw[:8])
                if w == 0 or h == 0:
                    error_msg = ctypes.create_string_buffer(256)
                    kernel32.ReadFile(h_stdout_read, error_msg, 256, ctypes.byref(bytes_read), None)
                    err_text = error_msg.raw[:bytes_read.value].decode('utf-8', errors='replace')
                    log.error(f"SYSTEM capture helper error: {err_text}")
                    return False
                
                self.width = w
                self.height = h
                
                frame_size = w * h * 3
                frame_buf = ctypes.create_string_buffer(frame_size)
                if not kernel32.ReadFile(h_stdout_read, frame_buf, frame_size, ctypes.byref(bytes_read), None) or bytes_read.value != frame_size:
                    log.error(f"Failed to read initial frame data: got {bytes_read.value}/{frame_size}")
                    return False
                
                import numpy as np
                self._last_frame = np.frombuffer(frame_buf.raw[:frame_size], dtype=np.uint8).reshape(h, w, 3)
                self._frame_count = 1
                log.info(f"SYSTEM helper started: {w}x{h}, first frame captured OK")
                return True
                
            finally:
                kernel32.CloseHandle(hDupToken)
        finally:
            kernel32.CloseHandle(hToken)

    def grab(self):
        """Capture a frame and return as numpy RGB array (height, width, 3)."""
        if not self._started:
            self.start()
        
        if self._method == "dxcam_direct":
            return self._grab_dxcam()
        
        if self._method == "subprocess" and self._helper_proc:
            return self._grab_subprocess()
        
        return None

    def _grab_dxcam(self):
        """Grab a frame using DXGI Desktop Duplication via dxcam.
        
        dxcam.grab() returns a numpy array in RGB format (height, width, 3)
        or None if no new frame is available. We reuse the camera instance
        stored in self._dxcam for efficient frame acquisition.
        """
        try:
            if self._dxcam is None:
                log.warning("dxcam camera instance is None, cannot grab")
                return self._last_frame
            
            frame = self._dxcam.grab()
            if frame is not None:
                self.height, self.width = frame.shape[:2]
                self._last_frame = frame
                self._frame_count += 1
                return self._last_frame
            else:
                # No new frame since last grab — return the previous one
                return self._last_frame
        except Exception as e:
            log.error(f"dxcam grab failed: {e}")
            return self._last_frame

    def _grab_subprocess(self):
        """Grab a frame from the persistent helper process."""
        import numpy as np
        import ctypes
        
        kernel32 = ctypes.windll.kernel32
        
        try:
            signal = ctypes.create_string_buffer(b'\x01')
            written = ctypes.wintypes.DWORD()
            kernel32.WriteFile(
                self._helper_proc['h_stdin_write'], signal, 1,
                ctypes.byref(written), None
            )
            
            header_buf = ctypes.create_string_buffer(8)
            bytes_read = ctypes.wintypes.DWORD()
            if not kernel32.ReadFile(
                self._helper_proc['h_stdout_read'], header_buf, 8,
                ctypes.byref(bytes_read), None
            ) or bytes_read.value != 8:
                log.warning("Failed to read frame header from helper")
                return self._last_frame
            
            w, h = struct.unpack('<II', header_buf.raw[:8])
            if w == 0 or h == 0:
                log.warning("Helper returned error frame header")
                return self._last_frame
            
            frame_size = w * h * 3
            frame_buf = ctypes.create_string_buffer(frame_size)
            if not kernel32.ReadFile(
                self._helper_proc['h_stdout_read'], frame_buf, frame_size,
                ctypes.byref(bytes_read), None
            ) or bytes_read.value != frame_size:
                log.warning(f"Failed to read frame data: got {bytes_read.value}/{frame_size}")
                return self._last_frame
            
            self._last_frame = np.frombuffer(frame_buf.raw[:frame_size], dtype=np.uint8).reshape(h, w, 3)
            self.width = w
            self.height = h
            self._frame_count += 1
            return self._last_frame
            
        except Exception as e:
            log.error(f"Helper grab failed: {e}")
            return self._last_frame

    def stop(self):
        """Stop capture, release resources, and terminate helper process."""
        # Release dxcam DXGI Desktop Duplication instance
        if self._dxcam is not None:
            try:
                self._dxcam.release()
                log.info("dxcam camera released")
            except Exception as e:
                log.warning(f"Error releasing dxcam: {e}")
            self._dxcam = None
        
        if self._helper_proc:
            import ctypes
            kernel32 = ctypes.windll.kernel32
            try:
                signal = ctypes.create_string_buffer(b'\x00')
                written = ctypes.wintypes.DWORD()
                kernel32.WriteFile(
                    self._helper_proc['h_stdin_write'], signal, 1,
                    ctypes.byref(written), None
                )
            except Exception:
                pass
            try:
                kernel32.TerminateProcess(self._helper_proc['hProcess'], 0)
            except Exception:
                pass
            try:
                kernel32.CloseHandle(self._helper_proc['h_stdin_write'])
                kernel32.CloseHandle(self._helper_proc['h_stdout_read'])
                kernel32.CloseHandle(self._helper_proc['hProcess'])
            except Exception:
                pass
            self._helper_proc = None
        
        # Cleanup RDP loopback if we started one
        if self._rdp_session:
            self._rdp_session.disconnect()
            self._rdp_session = None
        
        self._started = False
        self._method = None


# ──────────────────────── WebRTC Session ────────────────────────

class WebRTCDesktopSession:
    """Manages a WebRTC remote desktop session: capture → encode → send."""

    def __init__(self, session_id: str, turn_config: dict, agent_ws, target_session: int = -1):
        self.session_id = session_id
        self.turn_config = turn_config
        self.agent_ws = agent_ws
        self.pc = None
        self.video_track = None
        self.input_channel = None
        self._target_session = target_session
        self.capture = ScreenCapture(target_session=target_session)
        self._running = False

    async def start(self, fps: int = 30):
        """Create PeerConnection, add tracks, create offer, send to backend."""
        try:
            from aiortc import RTCPeerConnection, RTCConfiguration, RTCIceServer, RTCSessionDescription
            from aiortc.contrib.media import MediaStreamTrack
            from av import VideoFrame
            import numpy as np
        except ImportError as e:
            log.error(f"WebRTC dependencies not available: {e}")
            await self._send_error(f"Missing dependencies: {e}")
            return

        self._running = True

        # Start screen capture (with layered strategy)
        self.capture.start()
        # Launch input injection helper in Session 1
        self._launch_input_helper(self._target_session)
        log.warning(f"Screen capture started: _started={self.capture._started}, method={self.capture._method}, mode={self.capture._capture_mode}")
        await self._send_log(f"Screen capture started: _started={self.capture._started}, method={self.capture._method}, mode={self.capture._capture_mode}")
        if not self.capture._started:
            log.error("Screen capture failed to start!")
            await self._send_error("No screen capture method available")
            return
        
        # Start RDP loopback watchdog if we're using that mode
        if self.capture._capture_mode == "rdp_loopback":
            await self.capture.start_rdp_watchdog()

        # Create PeerConnection with TURN config
        log.warning(f"Creating PeerConnection with TURN config: urls={self.turn_config.get('urls', []) if self.turn_config else 'None'}")
        await self._send_log(f"Creating PeerConnection with TURN config: urls={self.turn_config.get('urls', []) if self.turn_config else 'None'}")
        ice_servers = [
            RTCIceServer(urls=["stun:stun.l.google.com:19302"]),
        ]
        if self.turn_config:
            ice_servers.append(RTCIceServer(
                urls=self.turn_config.get("urls", []),
                username=self.turn_config.get("username", ""),
                credential=self.turn_config.get("password", ""),
            ))

        config = RTCConfiguration(iceServers=ice_servers)
        self.pc = RTCPeerConnection(configuration=config)

        # Add screen capture video track
        self.video_track = ScreenCaptureTrack(self.capture, fps=fps)
        sender = self.pc.addTrack(self.video_track)

        # Force H.264 codec
        try:
            from aiortc import RTCRtpSender
            codecs = RTCRtpSender.getCapabilities("video").codecs
            h264_codecs = [c for c in codecs if c.mimeType == "video/H264"]
            if h264_codecs:
                transceiver = next(
                    (t for t in self.pc.getTransceivers() if t.sender == sender),
                    None
                )
                if transceiver:
                    transceiver.setCodecPreferences(h264_codecs)
                    log.info("Set H.264 codec preference")
        except Exception as e:
            log.warning(f"Could not set H.264 preference: {e}")

        # Create data channel for input events
        self.input_channel = self.pc.createDataChannel(
            "input", ordered=True
        )

        @self.input_channel.on("open")
        def on_dc_open():
            log.warning(f"DataChannel 'input' OPENED - ready for input events")

        @self.input_channel.on("close")
        def on_dc_close():
            log.warning(f"DataChannel 'input' CLOSED")

        @self.input_channel.on("message")
        def on_input(message):
            log.warning(f"DataChannel message received: type={type(message).__name__}, len={len(message) if hasattr(message, '__len__') else 'N/A'}, preview={str(message)[:200]}")
            try:
                if isinstance(message, bytes):
                    message = message.decode("utf-8")
                event = json.loads(message)
                log.warning(f"Input event: type={event.get('type')}, data={event}")
                self._handle_input(event)
            except Exception as e:
                log.warning(f"Failed to parse input event: {e}")

        # Handle ICE candidates → send to browser via backend WS
        @self.pc.on("icecandidate")
        async def on_icecandidate(candidate):
            if candidate:
                log.warning(f"ICE candidate gathered: {candidate}")
                await self._send_log(f"ICE candidate gathered: {candidate.to_json()}")
                await self.agent_ws.send(json.dumps({
                    "type": "webrtc_ice",
                    "session_id": self.session_id,
                    "candidate": candidate.to_json(),
                }))
            else:
                log.warning(f"ICE gathering complete (null candidate)")
                await self._send_log(f"ICE gathering complete (null candidate), state={self.pc.iceGatheringState}")

        # Handle connection state changes
        @self.pc.on("connectionstatechange")
        async def on_state():
            state = self.pc.connectionState
            log.info(f"WebRTC connection state: {state}")
            if state == "failed":
                log.error(f"WebRTC connection FAILED for session {self.session_id}")
                await self.stop()
                await self.agent_ws.send(json.dumps({
                    "type": "webrtc_error",
                    "session_id": self.session_id,
                    "message": "Connection failed - ICE negotiation error",
                }))
            elif state == "closed":
                log.info(f"WebRTC connection CLOSED for session {self.session_id}")
                await self.stop()
            elif state == "disconnected":
                log.warning(f"WebRTC connection DISCONNECTED for session {self.session_id}, waiting...")
                for _ in range(10):
                    await asyncio.sleep(1)
                    if self.pc.connectionState == "connected":
                        log.info(f"WebRTC reconnected for session {self.session_id}")
                        return
                    if self.pc.connectionState in ("failed", "closed"):
                        break
                log.error(f"WebRTC did not reconnect for session {self.session_id}")
                await self.stop()

        # Create and send offer
        try:
            offer = await self.pc.createOffer()
            log.warning(f"Created offer, SDP length={len(offer.sdp)}")
            await self._send_log(f"Created offer, SDP length={len(offer.sdp)}")
            await self.pc.setLocalDescription(offer)
            log.warning(f"Local description set, state={self.pc.connectionState}, gatheringState={self.pc.iceGatheringState}")
            await self._send_log(f"Local description set, state={self.pc.connectionState}, gatheringState={self.pc.iceGatheringState}")

            await self.agent_ws.send(json.dumps({
                "type": "webrtc_offer",
                "session_id": self.session_id,
                "sdp": self.pc.localDescription.sdp,
                "type_": self.pc.localDescription.type,
            }))
            log.info(f"WebRTC offer sent for session {self.session_id}")

        except Exception as e:
            log.error(f"Failed to create/send offer: {e}", exc_info=True)
            await self._send_error(str(e))

    async def handle_answer(self, sdp: str, type_: str):
        """Handle SDP answer from browser."""
        try:
            from aiortc import RTCSessionDescription
            answer = RTCSessionDescription(sdp=sdp, type=type_)
            log.warning(f"Setting remote description: type={type_}, sdp_len={len(sdp)}")
            await self.pc.setRemoteDescription(answer)
            log.warning(f"Remote description set successfully for session {self.session_id}, connectionState={self.pc.connectionState}")
        except Exception as e:
            log.error(f"Failed to set remote description: {e}", exc_info=True)

    async def handle_ice_candidate(self, candidate_json: dict):
        """Handle ICE candidate from browser."""
        try:
            log.warning(f"Adding ICE candidate from browser: {candidate_json}")
            await self._send_log(f"Adding ICE candidate from browser: {candidate_json}")
            candidate_sdp = candidate_json.get("candidate", "")
            sdp_mid = candidate_json.get("sdpMid", "0")
            sdp_mline_index = candidate_json.get("sdpMLineIndex", 0)
            
            if not candidate_sdp:
                log.warning("Empty ICE candidate from browser, skipping")
                return
            
            from aiortc import RTCIceCandidate
            
            parts = candidate_sdp.split()
            if parts[0].startswith("candidate:"):
                parts[0] = parts[0][len("candidate:"):]
            
            if len(parts) >= 8:
                candidate = RTCIceCandidate(
                    component=int(parts[1]),
                    foundation=parts[0],
                    ip=parts[4],
                    port=int(parts[5]),
                    priority=int(parts[3]),
                    protocol=parts[2],
                    type=parts[7],
                    sdpMid=sdp_mid,
                    sdpMLineIndex=sdp_mline_index,
                )
                for i in range(8, len(parts) - 1, 2):
                    if parts[i] == "raddr":
                        candidate.relatedAddress = parts[i + 1]
                    elif parts[i] == "rport":
                        candidate.relatedPort = int(parts[i + 1])
                    elif parts[i] == "tcptype":
                        candidate.tcpType = parts[i + 1]
                
                await self.pc.addIceCandidate(candidate)
                await self._send_log(f"Successfully added ICE candidate: {candidate.ip}:{candidate.port} ({candidate.type})")
            else:
                await self._send_log(f"Could not parse ICE candidate SDP: {candidate_sdp}")
        except Exception as e:
            log.warning(f"Failed to add ICE candidate: {e}")
            await self._send_log(f"Failed to add ICE candidate: {e}")

    async def stop(self):
        """Clean up WebRTC session."""
        self._running = False
        if self.video_track:
            self.video_track.stop()
            self.video_track = None
        if self.pc:
            try:
                await self.pc.close()
            except Exception:
                pass
            self.pc = None
        self.capture.stop()
        log.info(f"WebRTC session {self.session_id} stopped")

    async def _send_error(self, message: str):
        try:
            await self.agent_ws.send(json.dumps({
                "type": "webrtc_error",
                "session_id": self.session_id,
                "message": message,
            }))
        except Exception:
            pass

    async def _send_log(self, message: str):
        try:
            await self.agent_ws.send(json.dumps({
                "type": "webrtc_log",
                "session_id": self.session_id,
                "message": message,
            }))
        except Exception:
            pass

    def _handle_input(self, event: dict):
        """Handle mouse/keyboard events from browser DataChannel.
        
        On Windows, SendInput from Session 0 cannot inject input into
        Session 1 (session isolation). Route input events through a
        named pipe to a helper process in the user's session.
        """
        etype = event.get("type", "")
        
        # Try named pipe to Session 1 input helper first
        if self._send_input_pipe(event):
            return
        
        # Fallback: direct injection (works on same-session / physical machines)
        if etype in ("mousemove", "mousedown", "mouseup", "wheel"):
            self._inject_mouse(event)
        elif etype in ("keydown", "keyup"):
            self._inject_keyboard(event)
        elif etype == "clipboard":
            self._inject_clipboard(event)
        elif etype == "sas":
            # SAS (Secure Attention Sequence) events are forwarded via the named pipe
            # by _send_input_pipe above; this is a fallback for direct handling
            if not self._send_input_pipe(event):
                log.warning(f"SAS event could not be sent to input helper: {event}")

    def _send_input_pipe(self, event):
        """Send input event to Session 1 helper via named pipe."""
        if sys.platform != "win32":
            return False
        
        if not hasattr(self, '_input_pipe_handle') or not self._input_pipe_handle:
            try:
                import ctypes
                kernel32 = ctypes.windll.kernel32
                pipe_name = f"\\\\.\pipe\openrmm_input_{self._target_session if self._target_session >= 0 else 0}"
                kernel32.WaitNamedPipeW(pipe_name, 5000)
                GENERIC_WRITE = 0x40000000
                OPEN_EXISTING = 3
                hPipe = kernel32.CreateFileW(pipe_name, GENERIC_WRITE, 0, None, OPEN_EXISTING, 0, None)
                if hPipe == -1 or hPipe == 0xFFFFFFFF:
                    self._input_pipe_handle = None
                    return False
                self._input_pipe_handle = hPipe
            except Exception:
                self._input_pipe_handle = None
                return False
        
        try:
            import ctypes
            kernel32 = ctypes.windll.kernel32
            data = (json.dumps(event) + "\n").encode("utf-8")
            written = ctypes.c_ulong()
            result = kernel32.WriteFile(self._input_pipe_handle, data, len(data), ctypes.byref(written), None)
            if not result or written.value != len(data):
                kernel32.CloseHandle(self._input_pipe_handle)
                self._input_pipe_handle = None
                return False
            return True
        except Exception:
            if hasattr(self, '_input_pipe_handle') and self._input_pipe_handle:
                try:
                    ctypes.windll.kernel32.CloseHandle(self._input_pipe_handle)
                except:
                    pass
            self._input_pipe_handle = None
            return False

    def _launch_input_helper(self, target_session: int = -1):
        """Launch input injection helper in Session 1 via CreateProcessAsUserW.
        Uses named pipe \\\\.\\pipe\\openrmm_input for communication.
        """
        if sys.platform != "win32":
            return False
        
        import ctypes
        from ctypes import wintypes
        
        kernel32 = ctypes.windll.kernel32
        wtsapi32 = ctypes.windll.wtsapi32
        advapi32 = ctypes.windll.advapi32
        
        hUserToken = wintypes.HANDLE()
        found_session = None
        
        if target_session >= 0:
            # Use the explicitly specified session
            if wtsapi32.WTSQueryUserToken(target_session, ctypes.byref(hUserToken)):
                found_session = target_session
                log.info(f"Input helper: WTSQueryUserToken({target_session}) succeeded (explicit)")
            else:
                err = kernel32.GetLastError()
                log.error(f"Input helper: WTSQueryUserToken({target_session}) failed: {err}")
        else:
            for sid in [1, 2, 3, 4, 5]:
                if wtsapi32.WTSQueryUserToken(sid, ctypes.byref(hUserToken)):
                    found_session = sid
                    log.info(f"Input helper: WTSQueryUserToken({sid}) succeeded")
                    break
            if found_session is None:
                console = kernel32.WTSGetActiveConsoleSessionId()
                if console not in [0, 0xFFFFFFFF] and wtsapi32.WTSQueryUserToken(console, ctypes.byref(hUserToken)):
                    found_session = console
                    log.info(f"Input helper: WTSQueryUserToken(console={console}) succeeded")
        if found_session is None:
            log.error("Input helper: WTSQueryUserToken failed for all sessions")
            return False
        
        try:
            hDupToken = wintypes.HANDLE()
            if not advapi32.DuplicateTokenEx(
                hUserToken, 0x000F00FF, None, 2, 1,
                ctypes.byref(hDupToken)
            ):
                log.warning("Input helper: DuplicateTokenEx failed")
                return False
            
            try:
                script_path = r"C:\Program Files\OpenRMM\input_helper.py"
                session_arg = target_session if target_session >= 0 else 0
                cmdline = f'"{sys.executable.replace("python.exe", "pythonw.exe")}" "{script_path}" --session {session_arg}'
                
                class SIW(ctypes.Structure):
                    _fields_ = [
                        ("cb", ctypes.c_ulong), ("lpReserved", ctypes.c_wchar_p),
                        ("lpDesktop", ctypes.c_wchar_p), ("lpTitle", ctypes.c_wchar_p),
                        ("dwX", ctypes.c_ulong), ("dwY", ctypes.c_ulong),
                        ("dwXSize", ctypes.c_ulong), ("dwYSize", ctypes.c_ulong),
                        ("dwXCountChars", ctypes.c_ulong), ("dwYCountChars", ctypes.c_ulong),
                        ("dwFillAttribute", ctypes.c_ulong), ("dwFlags", ctypes.c_ulong),
                        ("wShowWindow", ctypes.c_ushort), ("cbReserved2", ctypes.c_ushort),
                        ("lpReserved2", ctypes.POINTER(ctypes.c_byte)),
                        ("hStdInput", ctypes.c_void_p), ("hStdOutput", ctypes.c_void_p),
                        ("hStdError", ctypes.c_void_p),
                    ]
                
                class PI(ctypes.Structure):
                    _fields_ = [
                        ("hProcess", ctypes.c_void_p), ("hThread", ctypes.c_void_p),
                        ("dwProcessId", ctypes.c_ulong), ("dwThreadId", ctypes.c_ulong),
                    ]
                
                si = SIW()
                si.cb = ctypes.sizeof(SIW)
                si.lpDesktop = "WinSta0\\Default"
                si.wShowWindow = 0
                
                pi = PI()
                
                if not advapi32.CreateProcessAsUserW(
                    hDupToken, None, cmdline, None, None,
                    False, 0x08000000, None, None,
                    ctypes.byref(si), ctypes.byref(pi)
                ):
                    err = ctypes.GetLastError()
                    log.warning(f"Input helper: CreateProcessAsUserW failed: error {err}")
                    return False
                
                kernel32.CloseHandle(pi.hProcess)
                kernel32.CloseHandle(pi.hThread)
                self._input_helper_pid = pi.dwProcessId
                log.warning(f"Input helper launched in Session 1: PID={pi.dwProcessId}")
                return True
                
            finally:
                kernel32.CloseHandle(hDupToken)
        finally:
            kernel32.CloseHandle(hUserToken)

    def _inject_mouse(self, event: dict):
        """Inject mouse events via SendInput (Windows)."""
        if sys.platform != "win32":
            return

        try:
            import ctypes
            from ctypes import wintypes

            user32 = ctypes.windll.user32

            MOUSEEVENTF_MOVE = 0x0001
            MOUSEEVENTF_LEFTDOWN = 0x0002
            MOUSEEVENTF_LEFTUP = 0x0004
            MOUSEEVENTF_RIGHTDOWN = 0x0008
            MOUSEEVENTF_RIGHTUP = 0x0010
            MOUSEEVENTF_MIDDLEDOWN = 0x0020
            MOUSEEVENTF_MIDDLEUP = 0x0040
            MOUSEEVENTF_WHEEL = 0x0800
            MOUSEEVENTF_ABSOLUTE = 0x8000
            INPUT_MOUSE = 0

            x = event.get("x", 0)
            y = event.get("y", 0)

            screen_w = user32.GetSystemMetrics(0)
            screen_h = user32.GetSystemMetrics(1)
            abs_x = int(x * 65535 / max(screen_w, 1))
            abs_y = int(y * 65535 / max(screen_h, 1))

            flags = MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE

            etype = event.get("type", "")
            if etype == "mousedown":
                button = event.get("button", 0)
                if button == 0: flags |= MOUSEEVENTF_LEFTDOWN
                elif button == 1: flags |= MOUSEEVENTF_MIDDLEDOWN
                elif button == 2: flags |= MOUSEEVENTF_RIGHTDOWN
            elif etype == "mouseup":
                button = event.get("button", 0)
                if button == 0: flags |= MOUSEEVENTF_LEFTUP
                elif button == 1: flags |= MOUSEEVENTF_MIDDLEUP
                elif button == 2: flags |= MOUSEEVENTF_RIGHTUP
            elif etype == "wheel":
                flags |= MOUSEEVENTF_WHEEL

            class MOUSEINPUT(ctypes.Structure):
                _fields_ = [
                    ("dx", ctypes.c_long),
                    ("dy", ctypes.c_long),
                    ("mouseData", ctypes.c_ulong),
                    ("dwFlags", ctypes.c_ulong),
                    ("time", ctypes.c_ulong),
                    ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
                ]

            class INPUT(ctypes.Structure):
                class _INPUT(ctypes.Union):
                    _fields_ = [("mi", MOUSEINPUT)]
                _fields_ = [
                    ("type", ctypes.c_ulong),
                    ("input", _INPUT),
                ]

            extra = ctypes.c_ulong(0)
            mi = MOUSEINPUT(
                dx=abs_x,
                dy=abs_y,
                mouseData=event.get("delta", 0) if etype == "wheel" else 0,
                dwFlags=flags,
                time=0,
                dwExtraInfo=ctypes.pointer(extra),
            )
            inp = INPUT(type=INPUT_MOUSE)
            inp.input.mi = mi

            user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))

        except Exception as e:
            log.warning(f"Mouse injection failed: {e}")

    def _inject_keyboard(self, event: dict):
        """Inject keyboard events via SendInput (Windows)."""
        if sys.platform != "win32":
            return

        try:
            import ctypes

            KEYEVENTF_KEYUP = 0x0002
            INPUT_KEYBOARD = 1

            vk = event.get("vk", 0)
            scan = event.get("scan", 0)
            flags = 0
            if event.get("type") == "keyup":
                flags |= KEYEVENTF_KEYUP

            class KEYBDINPUT(ctypes.Structure):
                _fields_ = [
                    ("wVk", ctypes.c_ushort),
                    ("wScan", ctypes.c_ushort),
                    ("dwFlags", ctypes.c_ulong),
                    ("time", ctypes.c_ulong),
                    ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
                ]

            class INPUT(ctypes.Structure):
                class _INPUT(ctypes.Union):
                    _fields_ = [("ki", KEYBDINPUT)]
                _fields_ = [
                    ("type", ctypes.c_ulong),
                    ("input", _INPUT),
                ]

            extra = ctypes.c_ulong(0)
            ki = KEYBDINPUT(
                wVk=vk,
                wScan=scan,
                dwFlags=flags,
                time=0,
                dwExtraInfo=ctypes.pointer(extra),
            )
            inp = INPUT(type=INPUT_KEYBOARD)
            inp.input.ki = ki

            ctypes.windll.user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))

        except Exception as e:
            log.warning(f"Keyboard injection failed: {e}")

    def _inject_clipboard(self, event: dict):
        """Set clipboard text on the remote machine."""
        if sys.platform != "win32":
            return
        try:
            import ctypes
            text = event.get("text", "")
            ctypes.windll.user32.OpenClipboard(0)
            ctypes.windll.user32.EmptyClipboard()
            h = ctypes.windll.kernel32.GlobalAlloc(0x0042, len(text.encode("utf-16-le")) + 2)
            p = ctypes.windll.kernel32.GlobalLock(h)
            ctypes.cdll.msvcrt.wcscpy(ctypes.c_wchar_p(p), text)
            ctypes.windll.kernel32.GlobalUnlock(h)
            ctypes.windll.user32.SetClipboardData(13, h)  # CF_UNICODETEXT = 13
            ctypes.windll.user32.CloseClipboard()
        except Exception as e:
            log.warning(f"Clipboard injection failed: {e}")


class ScreenCaptureTrack(MediaStreamTrack):
    """WebRTC VideoStreamTrack that captures the screen.
    
    Uses the ScreenCapture instance which prioritizes DXGI Desktop Duplication
    (dxcam) and falls back to BitBlt helper subprocess.
    """

    kind = "video"

    def __init__(self, capture: ScreenCapture, fps: int = 30):
        super().__init__()
        self._capture = capture
        self._fps = fps
        self._start = time.time()
        self._timestamp = 0
        self._stopped = False
        self._frame_counter = 0

    def stop(self):
        self._stopped = True
        super().stop()

    async def recv(self):
        """Return next video frame."""
        import av
        import numpy as np

        if self._stopped:
            raise Exception("Track stopped")

        frame_delay = 1.0 / self._fps
        await asyncio.sleep(frame_delay)

        frame_array = self._capture.grab()
        if frame_array is None:
            frame_array = np.zeros((self._capture.height, self._capture.width, 3), dtype=np.uint8)

        # H.264 requires even dimensions — crop if odd
        h, w = frame_array.shape[:2]
        if h % 2 != 0 or w % 2 != 0:
            frame_array = frame_array[:h - h % 2, :w - w % 2]

        video_frame = av.VideoFrame.from_ndarray(frame_array, format="rgb24")

        self._frame_counter += 1
        video_frame.pts = self._frame_counter
        video_frame.time_base = fractions.Fraction(1, self._fps)

        if self._frame_counter <= 10 or self._frame_counter % 100 == 0:
            log.warning(f"recv() frame #{self._frame_counter}: shape={frame_array.shape}, mean={frame_array.mean():.1f}, pts={video_frame.pts}, tb={video_frame.time_base}")

        return video_frame
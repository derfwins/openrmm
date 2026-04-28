"""
Input injection helper for OpenRMM WebRTC.
Runs in Session 1 to bypass Windows session isolation for SendInput.
Receives input events as JSON lines over a named pipe.

Named pipe: \\\\.\\pipe\\openrmm_input_{session_id}
"""
import json, sys, ctypes, os

# Log to file for debugging
LOG = os.path.join(os.environ.get("TEMP", r"C:\Users\Public"), "input_helper.log")

def log(msg):
    with open(LOG, "a") as f:
        f.write(f"{msg}\n")
        f.flush()

# Windows constants
MOUSEEVENTF_MOVE       = 0x0001
MOUSEEVENTF_LEFTDOWN   = 0x0002
MOUSEEVENTF_LEFTUP     = 0x0004
MOUSEEVENTF_RIGHTDOWN  = 0x0008
MOUSEEVENTF_RIGHTUP    = 0x0010
MOUSEEVENTF_MIDDLEDOWN = 0x0020
MOUSEEVENTF_MIDDLEUP   = 0x0040
MOUSEEVENTF_WHEEL      = 0x0800
MOUSEEVENTF_ABSOLUTE   = 0x8000
INPUT_MOUSE   = 0
INPUT_KEYBOARD = 1
KEYEVENTF_KEYUP = 0x0002

kernel32 = ctypes.windll.kernel32
user32 = ctypes.windll.user32
advapi32 = ctypes.windll.advapi32

class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", ctypes.c_long), ("dy", ctypes.c_long),
        ("mouseData", ctypes.c_ulong), ("dwFlags", ctypes.c_ulong),
        ("time", ctypes.c_ulong), ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
    ]

class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", ctypes.c_ushort), ("wScan", ctypes.c_ushort),
        ("dwFlags", ctypes.c_ulong), ("time", ctypes.c_ulong),
        ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
    ]

class INPUT_UNION(ctypes.Union):
    _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT)]

class INPUT(ctypes.Structure):
    _fields_ = [("type", ctypes.c_ulong), ("input", INPUT_UNION)]

class SECURITY_ATTRIBUTES(ctypes.Structure):
    _fields_ = [
        ("nLength", ctypes.c_ulong),
        ("lpSecurityDescriptor", ctypes.c_void_p),
        ("bInheritHandle", ctypes.c_int),
    ]

def inject_mouse(event):
    x = event.get("x", 0)
    y = event.get("y", 0)
    screen_w = user32.GetSystemMetrics(0)
    screen_h = user32.GetSystemMetrics(1)
    abs_x = int(x * 65535 / max(screen_w, 1))
    abs_y = int(y * 65535 / max(screen_h, 1))
    flags = MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE
    etype = event.get("type", "")
    mouse_data = 0
    if etype == "mousedown":
        btn = event.get("button", 0)
        if btn == 0: flags |= MOUSEEVENTF_LEFTDOWN
        elif btn == 1: flags |= MOUSEEVENTF_MIDDLEDOWN
        elif btn == 2: flags |= MOUSEEVENTF_RIGHTDOWN
    elif etype == "mouseup":
        btn = event.get("button", 0)
        if btn == 0: flags |= MOUSEEVENTF_LEFTUP
        elif btn == 1: flags |= MOUSEEVENTF_MIDDLEUP
        elif btn == 2: flags |= MOUSEEVENTF_RIGHTUP
    elif etype == "wheel":
        flags |= MOUSEEVENTF_WHEEL
        mouse_data = event.get("delta", 0)
    extra = ctypes.c_ulong(0)
    mi = MOUSEINPUT(dx=abs_x, dy=abs_y, mouseData=mouse_data, dwFlags=flags, time=0, dwExtraInfo=ctypes.pointer(extra))
    inp = INPUT(type=INPUT_MOUSE)
    inp.input.mi = mi
    user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))

def inject_keyboard(event):
    vk = event.get("vk", 0)
    scan = event.get("scan", 0)
    flags = 0
    if event.get("type") == "keyup":
        flags |= KEYEVENTF_KEYUP
    extra = ctypes.c_ulong(0)
    ki = KEYBDINPUT(wVk=vk, wScan=scan, dwFlags=flags, time=0, dwExtraInfo=ctypes.pointer(extra))
    inp = INPUT(type=INPUT_KEYBOARD)
    inp.input.ki = ki
    user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))
def inject_sas(event):
    """Handle Secure Attention Sequence events: lock, sas (Ctrl+Alt+Del), signout."""
    action = event.get("action", "lock")
    if action == "lock":
        user32.LockWorkStation()
    elif action == "sas":
        # Try sas.dll EventCreateSAS (Win10+), fall back to LockWorkStation
        try:
            sas_dll = ctypes.windll.sas
            sas_dll.EventCreateSAS()
        except Exception:
            user32.LockWorkStation()
    elif action == "signout":
        advapi32.ExitWindowsEx(0, 0)  # EWX_LOGOFF = 0

def main():
    log(f"Input helper starting, PID={os.getpid()}")
    
    # Parse --session N
    session_id = 0
    for i, arg in enumerate(sys.argv):
        if arg == '--session' and i + 1 < len(sys.argv):
            try:
                session_id = int(sys.argv[i + 1])
            except ValueError:
                pass
    
    pipe_name = rf"\\.\pipe\openrmm_input_{session_id}"
    log(f"Using pipe: {pipe_name} (session={session_id})")
    
    # Create SECURITY_ATTRIBUTES with NULL DACL (allow everyone)
    sa = SECURITY_ATTRIBUTES()
    sa.nLength = ctypes.sizeof(SECURITY_ATTRIBUTES)
    sa.lpSecurityDescriptor = None
    sa.bInheritHandle = 0
    
    PIPE_ACCESS_DUPLEX = 0x00000003
    PIPE_TYPE_BYTE = 0x00000000
    PIPE_READMODE_BYTE = 0x00000000
    PIPE_WAIT = 0x00000000
    
    hPipe = kernel32.CreateNamedPipeW(
        pipe_name,
        PIPE_ACCESS_DUPLEX,
        PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT,
        1,       # max instances
        65536,   # out buffer
        65536,   # in buffer
        5000,    # default timeout ms
        ctypes.byref(sa),
    )
    
    if hPipe == -1 or hPipe == 0xFFFFFFFF:
        err = ctypes.GetLastError()
        log(f"ERROR: CreateNamedPipeW failed: error {err}")
        sys.exit(1)
    
    log(f"Named pipe created: {pipe_name}, handle={hPipe}")
    
    # Wait for agent to connect
    if not kernel32.ConnectNamedPipe(hPipe, None):
        err = ctypes.GetLastError()
        if err != 535:  # ERROR_PIPE_CONNECTED
            log(f"ERROR: ConnectNamedPipe failed: error {err}")
            kernel32.CloseHandle(hPipe)
            sys.exit(1)
    
    log("Client connected to input pipe")
    
    buf = b""
    while True:
        data = ctypes.create_string_buffer(4096)
        bytes_read = ctypes.c_ulong()
        if not kernel32.ReadFile(hPipe, data, 4096, ctypes.byref(bytes_read), None):
            err = ctypes.GetLastError()
            log(f"ReadFile failed: error {err}")
            break
        if bytes_read.value == 0:
            log("ReadFile returned 0 bytes, client disconnected")
            break
        
        buf += data.raw[:bytes_read.value]
        while b"\n" in buf:
            line, buf = buf.split(b"\n", 1)
            try:
                event = json.loads(line.decode("utf-8"))
                etype = event.get("type", "")
                if etype in ("mousemove", "mousedown", "mouseup", "wheel"):
                    inject_mouse(event)
                elif etype in ("keydown", "keyup"):
                    inject_keyboard(event)
                elif etype == "sas":
                    inject_sas(event)
            except Exception as e:
                log(f"Failed to process: {e}")
    
    kernel32.CloseHandle(hPipe)
    log("Input helper exiting")

if __name__ == "__main__":
    main()
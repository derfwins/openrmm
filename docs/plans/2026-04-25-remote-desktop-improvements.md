# OpenRMM Remote Desktop Improvement Plan
> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Fix and improve the built-in remote desktop system (WebSocket-based) so it fully replaces RustDesk, with working input, clipboard, and multi-monitor support.

**Architecture:** Agent captures screen → binary WebSocket frames → backend relay → browser renders via WebCodecs/JPEG. Input flows back: browser → WebSocket binary frames → agent → SendInput/xdotool. Clipboard flows both ways via a shared panel.

**Tech Stack:** Python agent (ctypes for Windows input), FastAPI backend (WebSocket relay), React frontend (WebCodecs + canvas), Binary frame protocol (5-byte header).

---

## Current State (What Already Works)

- ✅ Agent screen capture (H.264 via mss+av, JPEG fallback)
- ✅ Agent → Server → Browser binary frame relay
- ✅ Browser VideoDecoder rendering (H.264 WebCodecs)
- ✅ Browser JPEG fallback rendering
- ✅ Quality settings, fullscreen, view-only mode
- ✅ FPS counter, latency ping/pong
- ✅ Backend WebSocket relay with keepalive
- ✅ Clipboard frame types defined (0x04 from agent, 0x12 from browser)
- ✅ Frontend sends binary mouse/keyboard/clipboard frames

## What's Broken/Missing

1. 🔴 **Agent binary input handler** — Line 1398-1401 in `openrmm-agent.py`: `# Skip binary frames for now` — all mouse/keyboard/clipboard input is silently dropped. THE CRITICAL BUG.
2. 🟡 **Agent clipboard monitoring** — Agent never reads the Windows clipboard to send to browser. Only has the receive path (frame type 0x04 handler is stubbed).
3. 🟡 **Frontend clipboard panel** — Browser clipboard API requires user gesture; need a "Shared Clipboard" text panel instead of relying on auto-sync.
4. 🟡 **Multi-monitor** — Agent only captures monitor[0] (primary). Should enumerate and allow selection.
5. 🟡 **RustDesk removal** — DeviceDetail.tsx still has RustDesk Connect button; should use built-in remote desktop.
6. 🟢 **Backend relay** — Already works. Minor: add clipboard frame forwarding if not already there.

---

### Task 1: Fix agent binary input frame handling

**Objective:** Make the agent parse and execute binary mouse/keyboard/clipboard input frames from the browser, so remote control actually works.

**Files:**
- Modify: `agent/openrmm-agent.py` (lines 1394-1401)

**Step 1: Replace the binary frame skip with a proper handler**

Find these lines (around 1394-1401):
```python
                    if isinstance(message, bytes):
                        # Binary frame from server - parse header
                        if len(message) < 5:
                            continue
                        # Skip binary frames for now (settings, etc.)
                        # They'll be handled by dedicated handlers later
                        log.debug("Received binary frame from server, len=%d", len(message))
                        continue
```

Replace with:
```python
                    if isinstance(message, bytes):
                        # Binary frame from server - parse 5-byte header
                        if len(message) < 5:
                            continue
                        frame_type = message[0]
                        # payload_len = struct.unpack('!I', message[1:5])[0]
                        payload = message[5:]

                        if frame_type == 0x10:  # FRAME_MOUSE
                            if len(payload) >= 9 and send_mouse:
                                x = struct.unpack('<I', payload[0:4])[0]
                                y = struct.unpack('<I', payload[4:8])[0]
                                buttons = payload[8]
                                wheel_delta = struct.unpack('<h', payload[9:11])[0] if len(payload) >= 11 else 0
                                action = 'move'
                                if buttons & 1:
                                    action = 'down'
                                elif buttons & 2:
                                    action = 'down'
                                    buttons = 2
                                elif buttons & 4:
                                    action = 'down'
                                    buttons = 1
                                # For move without click, just move
                                if buttons == 0 and wheel_delta == 0:
                                    send_mouse('move', x, y, button=0, delta=0)
                                elif wheel_delta != 0:
                                    send_mouse('wheel', x, y, button=0, delta=wheel_delta)
                                else:
                                    send_mouse(action, x, y, button=buttons, delta=0)

                        elif frame_type == 0x11:  # FRAME_KEYBOARD
                            if len(payload) >= 10 and send_keyboard:
                                action_code = payload[0]  # 0=down, 1=up
                                vk_code = struct.unpack('<I', payload[1:5])[0]
                                # scan_code = struct.unpack('<I', payload[5:9])[0]
                                # modifiers = payload[9]
                                key = ''
                                VK_REVERSE = {v: k for k, v in {
                                    'Backspace': 0x08, 'Tab': 0x09, 'Enter': 0x0D,
                                    'Shift': 0x10, 'Control': 0x11, 'Alt': 0x12,
                                    'Escape': 0x1B, 'Space': 0x20,
                                    'ArrowLeft': 0x25, 'ArrowUp': 0x26,
                                    'ArrowRight': 0x27, 'ArrowDown': 0x28,
                                    'Delete': 0x2E, 'Insert': 0x2D,
                                    'Home': 0x24, 'End': 0x23,
                                    'PageUp': 0x21, 'PageDown': 0x22,
                                    'CapsLock': 0x14, 'F1': 0x70, 'F2': 0x71,
                                    'F3': 0x72, 'F4': 0x73, 'F5': 0x74,
                                    'F6': 0x75, 'F7': 0x76, 'F8': 0x77,
                                    'F9': 0x78, 'F10': 0x79, 'F11': 0x7A,
                                    'F12': 0x7B,
                                }.items()}
                                key = VK_REVERSE.get(vk_code, '')
                                action = 'down' if action_code == 0 else 'up'
                                send_keyboard(action=action, key=key, code='', shift=False, ctrl=False, alt=False, meta=False)

                        elif frame_type == 0x12:  # FRAME_CLIPBOARD_OUT (browser → agent)
                            if payload:
                                try:
                                    text = payload.decode('utf-8')
                                    log.info("Received clipboard text from browser (%d chars)", len(text))
                                    # Write to system clipboard
                                    if platform.system() == "Windows":
                                        _set_clipboard_windows(text)
                                    elif platform.system() == "Linux":
                                        _set_clipboard_linux(text)
                                except Exception as e:
                                    log.warning("Failed to handle clipboard from browser: %s", e)

                        elif frame_type == 0x13:  # FRAME_SETTINGS
                            try:
                                settings = json.loads(payload.decode('utf-8'))
                                log.info("Desktop settings update: %s", settings)
                                dsid = settings.get("session_id", "")
                                dsess = sessions.get("_desktop_" + dsid)
                                if dsess and dsess.get("config"):
                                    if settings.get("quality"):
                                        dsess["config"]["quality"] = settings["quality"]
                                    if settings.get("fps"):
                                        dsess["config"]["fps"] = settings["fps"]
                                    if settings.get("crf"):
                                        dsess["config"]["crf"] = settings["crf"]
                            except Exception as e:
                                log.warning("Failed to parse settings frame: %s", e)
```

**Step 2: Add clipboard helper functions**

Add before `ws_agent_loop()` (around line 1320):

```python
def _set_clipboard_windows(text):
    """Write text to Windows clipboard."""
    import ctypes
    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32
    user32.OpenClipboard(0)
    user32.EmptyClipboard()
    # Allocate global memory for the text
    GMEM_MOVEABLE = 0x0002
    h_mem = kernel32.GlobalAlloc(GMEM_MOVEABLE, (len(text) + 1) * 2)
    ptr = kernel32.GlobalLock(h_mem)
    ctypes.memmove(ptr, text.encode('utf-16-le') + b'\x00\x00', (len(text) + 1) * 2)
    kernel32.GlobalUnlock(h_mem)
    user32.SetClipboardData(1, h_mem)  # CF_UNICODETEXT = 1
    user32.CloseClipboard()


def _set_clipboard_linux(text):
    """Write text to Linux clipboard via xclip."""
    import subprocess
    try:
        proc = subprocess.Popen(
            ['xclip', '-selection', 'clipboard'],
            stdin=subprocess.PIPE, timeout=2
        )
        proc.communicate(input=text.encode('utf-8'), timeout=2)
    except Exception as e:
        log.debug("Linux clipboard write failed: %s", e)
```

Also add a clipboard monitor that periodically checks the system clipboard and sends changes to the browser:

```python
def _get_clipboard_windows():
    """Read text from Windows clipboard. Returns None if no text available."""
    import ctypes
    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32
    if not user32.IsClipboardFormatAvailable(1):  # CF_UNICODETEXT
        return None
    if not user32.OpenClipboard(0):
        return None
    try:
        h = user32.GetClipboardData(1)
        if not h:
            return None
        ptr = kernel32.GlobalLock(h)
        if not ptr:
            return None
        try:
            text = ctypes.wstring_at(ptr)
            return text
        finally:
            kernel32.GlobalUnlock(h)
    finally:
        user32.CloseClipboard()


def _get_clipboard_linux():
    """Read text from Linux clipboard via xclip."""
    import subprocess
    try:
        result = subprocess.run(
            ['xclip', '-selection', 'clipboard', '-o'],
            capture_output=True, timeout=2
        )
        if result.returncode == 0 and result.stdout:
            return result.stdout.decode('utf-8', errors='replace')
    except Exception:
        pass
    return None
```

**Step 3: Add clipboard monitoring to the desktop capture loop**

In the `desktop_capture_loop_jpeg()` function (around line 1723), add clipboard monitoring:

```python
                            # Clipboard monitoring
                            last_clipboard = ""

                            async def desktop_capture_loop_jpeg():
                                nonlocal last_clipboard
                                consecutive_errors = 0
                                while desktop_config["running"] and consecutive_errors < 5:
                                    # ... existing frame capture code ...
                                    
                                    # Check clipboard every 30 frames (~3 seconds at 10fps)
                                    if desktop_config.get("frame_count", 0) % 30 == 0:
                                        try:
                                            clip_text = None
                                            if platform.system() == "Windows":
                                                clip_text = _get_clipboard_windows()
                                            elif platform.system() == "Linux":
                                                clip_text = _get_clipboard_linux()
                                            if clip_text and clip_text != last_clipboard:
                                                last_clipboard = clip_text
                                                await send_binary_frame(0x04, clip_text.encode('utf-8'))
                                        except Exception:
                                            pass
```

**Step 4: Test the fix**

1. Deploy the updated agent to Windows
2. Open OpenRMM dashboard → Device → Remote Desktop
3. Verify mouse movement works (cursor should move on remote screen)
4. Verify keyboard input works (type in Notepad)
5. Verify clipboard works (copy text in browser, it appears on remote)

**Step 5: Commit**

```bash
git add agent/openrmm-agent.py
git commit -m "feat: enable binary input frames for remote desktop control"
```

---

### Task 2: Fix mouse event handling (down+move vs separate)

**Objective:** The current mouse encoding sends `buttons` as a bitmask with every move event. The agent must correctly distinguish between "move" (no buttons), "click" (down+up), and "drag" (down+move+up).

**Files:**
- Modify: `frontend/src/components/RemoteDesktop.tsx` (mouse event handlers)
- Modify: `agent/openrmm-agent.py` (binary mouse handler)

**Problem:** Current encoding uses buttons bitmask on move events. This means we can't distinguish "move while held" from "click at position." Need separate button-down and button-up events.

**Step 1: Update mouse encoding in RemoteDesktop.tsx**

The current `handleMouseDown` and `handleMouseUp` send mouse events with button bitmask. Change to:
- `handleMouseDown` → sends `FRAME_MOUSE` with action=0x01 (left), 0x02 (middle), 0x04 (right) in a "down" event
- `handleMouseUp` → sends `FRAME_MOUSE` with button bitmask in an "up" event
- `handleMouseMove` → sends `FRAME_MOUSE` with action=0x00 (move) and current button state

Update the binary mouse frame format:
```
Byte 0: action (0x00=move, 0x01=left_down, 0x02=left_up, 0x03=middle_down, 0x04=middle_up, 0x05=right_down, 0x06=right_up, 0x07=wheel)
Bytes 1-4: x (uint32 LE)
Bytes 5-8: y (uint32 LE)
Bytes 9-10: wheel_delta (int16 LE, only for action=0x07)
```

**Step 2: Update agent mouse handler**

```python
elif frame_type == 0x10:  # FRAME_MOUSE
    if len(payload) >= 9 and send_mouse:
        action_code = payload[0]
        x = struct.unpack('<I', payload[1:5])[0]
        y = struct.unpack('<I', payload[5:9])[0]
        
        action_map = {
            0x00: 'move',
            0x01: 'down',   # left down
            0x02: 'up',     # left up
            0x03: 'down',   # middle down
            0x04: 'up',     # middle up
            0x05: 'down',   # right down
            0x06: 'up',     # right up
            0x07: 'wheel',
        }
        button_map = {
            0x01: 0,  # left
            0x02: 0,  # left up
            0x03: 1,  # middle
            0x04: 1,  # middle up
            0x05: 2,  # right
            0x06: 2,  # right up
        }
        
        action = action_map.get(action_code, 'move')
        button = button_map.get(action_code, 0)
        
        if action_code == 0x07:  # wheel
            delta = struct.unpack('<h', payload[9:11])[0] if len(payload) >= 11 else 0
            send_mouse('wheel', x, y, button=0, delta=delta)
        else:
            send_mouse(action, x, y, button=button, delta=0)
```

**Step 3: Update frontend encodeMouseEvent**

```typescript
// Mouse action codes
const MOUSE_MOVE = 0x00
const MOUSE_LEFT_DOWN = 0x01
const MOUSE_LEFT_UP = 0x02
const MOUSE_MIDDLE_DOWN = 0x03
const MOUSE_MIDDLE_UP = 0x04
const MOUSE_RIGHT_DOWN = 0x05
const MOUSE_RIGHT_UP = 0x06
const MOUSE_WHEEL = 0x07

function encodeMouseEvent(action: number, x: number, y: number, wheelDelta: number = 0): ArrayBuffer {
  const buf = new ArrayBuffer(action === MOUSE_WHEEL ? 11 : 9)
  const view = new DataView(buf)
  view.setUint8(0, action)
  view.setUint32(1, x, true)       // little-endian x
  view.setUint32(5, y, true)       // little-endian y
  if (action === MOUSE_WHEEL) {
    view.setInt16(9, wheelDelta, true)
  }
  return encodeFrame(FRAME_MOUSE, buf)
}
```

Update handlers:
```typescript
const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
  if (viewOnly) return
  const canvas = canvasRef.current
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const x = Math.round((e.clientX - rect.left) * (remoteSizeRef.current.width / rect.width))
  const y = Math.round((e.clientY - rect.top) * (remoteSizeRef.current.height / rect.height))
  const actionMap: Record<number, number> = { 0: MOUSE_LEFT_DOWN, 1: MOUSE_MIDDLE_DOWN, 2: MOUSE_RIGHT_DOWN }
  const action = actionMap[e.button] ?? MOUSE_LEFT_DOWN
  sendBinary(encodeMouseEvent(action, x, y))
}, [viewOnly, sendBinary])

const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
  if (viewOnly) return
  const canvas = canvasRef.current
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const x = Math.round((e.clientX - rect.left) * (remoteSizeRef.current.width / rect.width))
  const y = Math.round((e.clientY - rect.top) * (remoteSizeRef.current.height / rect.height))
  const actionMap: Record<number, number> = { 0: MOUSE_LEFT_UP, 1: MOUSE_MIDDLE_UP, 2: MOUSE_RIGHT_UP }
  const action = actionMap[e.button] ?? MOUSE_LEFT_UP
  sendBinary(encodeMouseEvent(action, x, y))
}, [viewOnly, sendBinary])

const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
  if (viewOnly) return
  const canvas = canvasRef.current
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const x = Math.round((e.clientX - rect.left) * (remoteSizeRef.current.width / rect.width))
  const y = Math.round((e.clientY - rect.top) * (remoteSizeRef.current.height / rect.height))
  sendBinary(encodeMouseEvent(MOUSE_MOVE, x, y))
}, [viewOnly, sendBinary])
```

**Step 4: Test click behavior**

1. Deploy and open Remote Desktop
2. Verify left-click works (opens Start menu, selects icons)
3. Verify right-click works (context menus)
4. Verify drag-and-drop works (move mouse while holding)
5. Verify scroll wheel works

**Step 5: Commit**

```bash
git add agent/openrmm-agent.py frontend/src/components/RemoteDesktop.tsx
git commit -m "fix: proper mouse down/up encoding for remote desktop"
```

---

### Task 3: Add shared clipboard panel to frontend

**Objective:** Add a "Shared Clipboard" text panel in the Remote Desktop UI that shows remote clipboard contents and allows pasting text to the remote machine.

**Files:**
- Modify: `frontend/src/components/RemoteDesktop.tsx`

**Step 1: Add clipboard state and UI**

Add state variables:
```typescript
const [remoteClipboard, setRemoteClipboard] = useState('')
const [localClipboard, setLocalClipboard] = useState('')
const [showClipboard, setShowClipboard] = useState(false)
```

Update `handleBinaryFrame` for `FRAME_CLIPBOARD`:
```typescript
case FRAME_CLIPBOARD: {
  try {
    const text = new TextDecoder().decode(payload)
    setRemoteClipboard(text)
  } catch { /* ignore */ }
  break
}
```

Add clipboard panel toggle button in toolbar:
```tsx
<button
  onClick={() => setShowClipboard(!showClipboard)}
  className={`px-2 py-1 text-xs rounded ${showClipboard ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
  title="Shared Clipboard"
>
  📋 Clip
</button>
```

Add clipboard panel (between toolbar and canvas):
```tsx
{showClipboard && (
  <div className="border-b border-gray-700 bg-gray-800/50 p-2">
    <div className="text-xs text-gray-400 mb-1">Shared Clipboard</div>
    <div className="flex gap-2">
      <textarea
        value={localClipboard}
        onChange={(e) => setLocalClipboard(e.target.value)}
        placeholder="Type or paste text here to send to remote..."
        className="flex-1 bg-gray-900 text-gray-200 text-xs p-2 rounded border border-gray-600 resize-none h-20 font-mono"
      />
      <div className="flex flex-col gap-1">
        <button
          onClick={() => {
            if (wsRef.current?.readyState === WebSocket.OPEN && localClipboard) {
              sendBinary(encodeClipboardText(localClipboard))
            }
          }}
          className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
        >
          Send →
        </button>
        <button
          onClick={async () => {
            try {
              const text = await navigator.clipboard.readText()
              setLocalClipboard(text)
            } catch { /* clipboard access denied */ }
          }}
          className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-500"
        >
          Paste
        </button>
      </div>
    </div>
    {remoteClipboard && (
      <div className="mt-2">
        <div className="text-xs text-gray-400 mb-1">From remote:</div>
        <pre className="bg-gray-900 text-green-400 text-xs p-2 rounded border border-gray-600 max-h-20 overflow-auto font-mono whitespace-pre-wrap">
          {remoteClipboard.length > 500 ? remoteClipboard.slice(0, 500) + '...' : remoteClipboard}
        </pre>
      </div>
    )}
  </div>
)}
```

**Step 2: Test clipboard**

1. Copy text on your local machine
2. Click in the canvas → `handleCanvasFocus` sends your clipboard to remote
3. Copy text on the remote machine → agent sends `FRAME_CLIPBOARD` → shows in "From remote" panel
4. Type/paste in the textarea → click "Send →" → sends to remote clipboard

**Step 3: Commit**

```bash
git add frontend/src/components/RemoteDesktop.tsx
git commit -m "feat: shared clipboard panel in remote desktop UI"
```

---

### Task 4: Remove RustDesk dependency from frontend

**Objective:** Replace the "RustDesk Connect" button in DeviceDetail.tsx with a "Remote Desktop" button that opens the built-in Remote Desktop component.

**Files:**
- Modify: `frontend/src/components/DeviceDetail.tsx`

**Step 1: Find and replace the RustDesk section**

Find the section in DeviceDetail.tsx that shows the RustDesk status and Connect button. Replace it with a button that opens the built-in RemoteDesktop component:

```tsx
{/* Remote Desktop */}
<button
  onClick={() => setShowDesktop(true)}
  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2"
>
  <IconDesktop className="w-4 h-4" />
  Remote Desktop
</button>
```

Make sure `RemoteDesktop` is imported and shown in a modal/fullscreen overlay when `showDesktop` is true:

```tsx
{showDesktop && agentId && (
  <div className="fixed inset-0 z-50 bg-black">
    <RemoteDesktop
      agentId={agentId}
      token={auth.token}
      onClose={() => setShowDesktop(false)}
    />
  </div>
)}
```

**Step 2: Remove RustDesk imports and state**

Remove `rustdeskService` imports, `rustdeskStatus` state, `rustdesk` related useEffect hooks. Keep only what's needed for the built-in remote desktop.

**Step 3: Remove rustdeskService.ts**

Delete `frontend/src/services/rustdeskService.ts` — no longer needed.

**Step 4: Remove backend RustDesk routes**

Remove or keep (for future migration) `api/v2/routers/rustdesk.py`. If removing, also remove the router registration from `api/v2/main.py`.

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: replace RustDesk with built-in remote desktop"
```

---

### Task 5: Remove RustDesk from Agent

**Objective:** Remove RustDesk discovery and reporting from the agent heartbeat, since we no longer need it.

**Files:**
- Modify: `agent/openrmm-agent.py`

**Step 1: Remove `get_rustdesk_info()` function and its call in heartbeat**

Find `get_rustdesk_info()` and remove it entirely. Find where it's called in `get_system_info()` and remove the `rustdesk_id` and `rustdesk_password` fields.

**Step 2: Commit**

```bash
git add agent/openrmm-agent.py
git commit -m "refactor: remove RustDesk discovery from agent"
```

---

### Task 6: Multi-monitor support

**Objective:** Allow the user to select which monitor to view when multiple monitors are detected.

**Files:**
- Modify: `agent/openrmm-agent.py` (screen capture)
- Modify: `frontend/src/components/RemoteDesktop.tsx` (monitor selector)

**Step 1: Enumerate monitors in agent**

In `capture_init_h264()` and the JPEG capture path, enumerate all monitors from `sct.monitors` and include them in the `desktop_info` message:

```python
# In desktop_start handler, after capture init:
monitors = []
for i, mon in enumerate(sct.monitors[1:]):  # [0] is all monitors combined
    monitors.append({
        "id": i + 1,
        "width": mon["width"],
        "height": mon["height"],
        "left": mon["left"],
        "top": mon["top"],
    })
info_json = json.dumps({
    "type": "desktop_info",
    "session_id": session_id,
    "width": w,
    "height": h,
    "monitors": monitors,
    "current_monitor": 1,
}).encode('utf-8')
```

**Step 2: Add monitor selector in frontend**

When `monitors` is an array with >1 entry, show a monitor selector dropdown:

```tsx
{screenInfo && screenInfo.monitors.length > 1 && (
  <select
    value={currentMonitor}
    onChange={(e) => {
      setCurrentMonitor(Number(e.target.value))
      ws.send(encodeSettings({ ...QUALITY_SETTINGS[quality], monitor: Number(e.target.value) }))
    }}
    className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded border border-gray-600"
  >
    {screenInfo.monitors.map((m, i) => (
      <option key={m.id} value={m.id}>
        Monitor {m.id} ({m.width}×{m.height})
      </option>
    ))}
  </select>
)}
```

**Step 3: Handle monitor switch in agent**

In settings handler, when `monitor` is specified, switch to that monitor:

```python
elif frame_type == 0x13:  # FRAME_SETTINGS
    settings = json.loads(payload.decode('utf-8'))
    if settings.get("monitor") and _h264_state.get('sct'):
        mon_idx = settings["monitor"]
        if mon_idx < len(_h264_state['sct'].monitors):
            _h264_state['monitor'] = _h264_state['sct'].monitors[mon_idx]
```

**Step 4: Commit**

```bash
git add agent/openrmm-agent.py frontend/src/components/RemoteDesktop.tsx
git commit -m "feat: multi-monitor selection for remote desktop"
```

---

### Task 7: End-to-end testing and deployment

**Objective:** Test the full remote desktop flow and deploy to production.

**Step 1: Build frontend**
```bash
cd ~/openrmm-github/frontend && npm run build
```

**Step 2: Deploy frontend**
```bash
# Copy dist to VPS
scp -i ~/.ssh/hermes_vps -r /tmp/dist-deploy/* ubuntu@135.148.26.247:/tmp/dist-deploy/
ssh -i ~/.ssh/hermes_vps ubuntu@135.148.26.247 'sudo cp -r /tmp/dist-deploy/* /opt/openrmm/frontend/dist/'
```

**Step 3: Deploy agent to Windows**
```bash
# SCP the updated agent.py to the Windows machine
sshpass -p 'fxp20Vfh!!' scp -o StrictHostKeyChecking=no agent/openrmm-agent.py admin@10.10.0.26:C:/Users/admin/openrmm-agent.py
# Restart the scheduled task
sshpass -p 'fxp20Vfh!!' ssh -o StrictHostKeyChecking=no admin@10.10.0.26 "powershell -Command \"Stop-ScheduledTask -TaskName 'OpenRMM-Agent' -ErrorAction SilentlyContinue; Start-ScheduledTask -TaskName 'OpenRMM-Agent'\""
```

**Step 4: Test all features**
- Open Remote Desktop from dashboard
- Verify connection (should show screen)
- Test mouse movement and clicking
- Test keyboard input
- Test clipboard sync
- Test quality switching
- Test fullscreen
- Test disconnect/reconnect

**Step 5: Final commit and push**
```bash
git push origin main
```
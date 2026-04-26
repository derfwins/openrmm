# OpenRMM WebRTC Remote Desktop — Implementation Plan

## Architecture Overview

```
 Windows Agent                         VPS (Signaling + TURN)              Browser
┌──────────────────┐                 ┌──────────────────┐              ┌──────────────────┐
│  Screen Capture   │                 │  FastAPI          │              │  RTCPeerConnection│
│  (dxcam/gdigrab)  │                 │  Signaling WS     │◄──offer────►│  <video> tag      │
│       │           │                 │  + TURN creds     │──answer────►│  DataChannel      │
│  av.VideoFrame    │                 └───────┬──────────┘              │  mouse/key events │
│       │           │                         │                         └───────┬──────────┘
│  VideoStreamTrack │                         │                                 │
│       │           │                  ┌──────▼──────────┐                       │
│  RTCPeerConnection │◄══ WebRTC ═════►│  coturn TURN    │◄══ WebRTC ═══════════►│
│  + DataChannel     │    (UDP media)  │  (relay server) │    (UDP media)        │
│  Input injection   │                 └─────────────────┘                       │
└──────────────────┘                                                             │
```

### Key Design Decisions

1. **WebRTC, not WebSocket** — Native browser support via `<video>` tag, adaptive bitrate, UDP transport, congestion control
2. **Agent is WebRTC offerer** — Agent creates PeerConnection, adds video track + data channel, sends offer via WebSocket to backend
3. **Browser is WebRTC answerer** — Browser receives offer via WebSocket, creates answer, ICE candidates trickle
4. **H.264 with tune=zerolatency** — Best codec for screen sharing (sharp text, low latency)
5. **dxcam (DXGI Desktop Duplication)** as primary capture — Works as SYSTEM in Session 0
6. **gdigrab (FFmpeg)** as fallback — If dxcam fails, use MediaPlayer with gdigrab format
7. **BitBlt as last resort** — If both fail, use existing BitBlt with DACL modification
8. **coturn for TURN** — Self-hosted, DNS-only subdomain (bypass Cloudflare proxy)
9. **Signaling over existing agent WebSocket** — Reuse the agent→backend WS connection for SDP/ICE relay

## Component Details

### 1. Agent: Screen Capture Module

**Priority order: dxcam → gdigrab → BitBlt**

```python
class ScreenCaptureTrack(VideoStreamTrack):
    """
    WebRTC video track that captures the screen.
    Tries dxcam (DXGI Desktop Duplication) first, falls back to FFmpeg gdigrab,
    then to BitBlt with DACL modification.
    """
    kind = "video"
    
    def __init__(self, fps=30):
        super().__init__()
        self.fps = fps
        self._capture = self._init_capture()
        self._start = time.time()
        self._timestamp = 0
        
    def _init_capture(self):
        # Try dxcam (DXGI Desktop Duplication)
        try:
            import dxcam
            camera = dxcam.create(output_idx=0, output_color="BGRA")
            camera.start(target_fps=self.fps, video_mode=True)
            log.info("Screen capture: using dxcam (DXGI)")
            return ("dxcam", camera)
        except Exception:
            pass
            
        # Try gdigrab via MediaPlayer (FFmpeg)
        try:
            from aiortc.contrib.media import MediaPlayer
            player = MediaPlayer("desktop", format="gdigrab",
                options={"video_size": "1920x1080", "framerate": str(self.fps)})
            log.info("Screen capture: using gdigrab (FFmpeg)")
            return ("gdigrab", player)
        except Exception:
            pass
            
        # Fallback: BitBlt with thread + deque
        return ("bitblt", None)  # Uses existing capture_screen()
    
    async def recv(self):
        pts, time_base = await self.next_timestamp()
        frame = await asyncio.to_thread(self._grab_frame)
        frame.pts = pts
        frame.time_base = time_base
        return frame
    
    def _grab_frame(self):
        method, capture = self._capture
        if method == "dxcam":
            frame = capture.get_latest_frame()  # numpy BGRA
            return av.VideoFrame.from_ndarray(frame[:, :, :3][:, :, ::-1], format="rgb24")
        elif method == "gdigrab":
            # MediaPlayer handles this — but we need a different pattern
            # Actually, MediaPlayer.video is already a VideoStreamTrack
            # So we use it directly in addTrack, not wrapped in ScreenCaptureTrack
            pass
        else:
            # BitBlt fallback
            jpeg, w, h = capture_screen(quality=80)
            img = Image.open(io.BytesIO(jpeg))
            return av.VideoFrame.from_ndarray(np.array(img), format="rgb24")
```

**Note:** If using dxcam, wrap in ScreenCaptureTrack. If using gdigrab, use MediaPlayer.video directly as the track.

### 2. Agent: WebRTC Peer Connection

```python
from aiortc import RTCPeerConnection, RTCConfiguration, RTCIceServer, RTCSessionDescription
from aiortc.mediastreams import VIDEO_CLOCK_RATE, VIDEO_PTIME, VIDEO_TIME_BASE

class DesktopSession:
    def __init__(self, agent_ws, session_id, turn_config):
        self.ws = agent_ws
        self.session_id = session_id
        self.pc = None
        self.track = None
        self.input_channel = None
        
    async def start(self, fps=30):
        # Create PeerConnection with TURN config
        config = RTCConfiguration(
            iceServers=[
                RTCIceServer(urls=["stun:stun.l.google.com:19302"]),
                RTCIceServer(
                    urls=["turn:turn.openrmm.derfwins.com:3478?transport=udp",
                          "turn:turn.openrmm.derfwins.com:3478?transport=tcp"],
                    username=turn_config["username"],
                    credential=turn_config["password"]
                )
            ]
        )
        self.pc = RTCPeerConnection(configuration=config)
        
        # Add screen capture video track
        self.track = ScreenCaptureTrack(fps=fps)
        sender = self.pc.addTrack(self.track)
        
        # Force H.264 codec for best screen sharing quality
        from aiortc import RTCRtpSender
        codecs = RTCRtpSender.getCapabilities("video").codecs
        transceiver = next(t for t in self.pc.getTransceivers() if t.sender == sender)
        transceiver.setCodecPreferences([c for c in codecs if c.mimeType == "video/H264"])
        
        # Create data channel for input events (agent creates it)
        self.input_channel = self.pc.createDataChannel(
            "input", ordered=True, maxPacketLifeTime=100
        )
        
        @self.input_channel.on("message")
        def on_input(message):
            event = json.loads(message)
            self._handle_input(event)
        
        # Handle ICE candidates — send to browser via backend WS
        @self.pc.on("icecandidate")
        async def on_icecandidate(candidate):
            if candidate:
                await self.ws.send(json.dumps({
                    "type": "webrtc_ice",
                    "session_id": self.session_id,
                    "candidate": candidate.to_json()
                }))
        
        # Handle connection state
        @self.pc.on("connectionstatechange")
        async def on_state():
            if self.pc.connectionState in ("failed", "closed"):
                await self.stop()
        
        # Create offer
        offer = await self.pc.createOffer()
        await self.pc.setLocalDescription(offer)
        
        # Send offer to backend (which relays to browser)
        await self.ws.send(json.dumps({
            "type": "webrtc_offer",
            "session_id": self.session_id,
            "sdp": self.pc.localDescription.sdp,
            "type_": self.pc.localDescription.type,
        }))
    
    async def handle_answer(self, sdp, type_):
        """Browser's SDP answer."""
        answer = RTCSessionDescription(sdp=sdp, type=type_)
        await self.pc.setRemoteDescription(answer)
    
    async def handle_ice(self, candidate_json):
        """ICE candidate from browser."""
        from aiortc import RTCIceCandidate
        candidate = RTCIceCandidate.from_json(candidate_json)
        await self.pc.addIceCandidate(candidate)
    
    async def stop(self):
        if self.track:
            self.track.stop()
        if self.pc:
            await self.pc.close()
```

### 3. Agent: Input Injection (Windows)

```python
def _handle_input(self, event):
    """Handle mouse/keyboard events from browser DataChannel."""
    import ctypes
    
    etype = event.get("type")
    if etype in ("mousemove", "mousedown", "mouseup"):
        self._inject_mouse(event)
    elif etype in ("keydown", "keyup"):
        self._inject_keyboard(event)

def _inject_mouse(self, event):
    """Inject mouse events via SendInput."""
    import ctypes
    user32 = ctypes.windll.user32
    
    MOUSEEVENTF_MOVE = 0x0001
    MOUSEEVENTF_LEFTDOWN = 0x0002
    MOUSEEVENTF_LEFTUP = 0x0004
    MOUSEEVENTF_RIGHTDOWN = 0x0008
    MOUSEEVENTF_RIGHTUP = 0x0010
    MOUSEEVENTF_MIDDLEDOWN = 0x0020
    MOUSEEVENTF_MIDDLEUP = 0x0040
    MOUSEEVENTF_ABSOLUTE = 0x8000
    
    # Scale coordinates to absolute (0-65535)
    screen_w = user32.GetSystemMetrics(0)
    screen_h = user32.GetSystemMetrics(1)
    x = int(event["x"] * 65535 / screen_w)
    y = int(event["y"] * 65535 / screen_h)
    
    flags = MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE
    if event["type"] == "mousedown":
        if event.get("button") == 0: flags |= MOUSEEVENTF_LEFTDOWN
        elif event.get("button") == 1: flags |= MOUSEEVENTF_MIDDLEDOWN
        elif event.get("button") == 2: flags |= MOUSEEVENTF_RIGHTDOWN
    elif event["type"] == "mouseup":
        if event.get("button") == 0: flags |= MOUSEEVENTF_LEFTUP
        elif event.get("button") == 1: flags |= MOUSEEVENTF_MIDDLEUP
        elif event.get("button") == 2: flags |= MOUSEEVENTF_RIGHTUP
    
    # Build INPUT struct + SendInput call
    # ... (standard ctypes SendInput pattern)

def _inject_keyboard(self, event):
    """Inject keyboard events via SendInput."""
    # Map key names to VK codes + SendInput
    # ... (standard ctypes SendInput pattern)
```

### 4. Backend: WebRTC Signaling

Replace the binary-frame relay in `desktop.py` with WebRTC signaling:

```python
# api/v2/routers/desktop.py — WebRTC Signaling Relay

@router.websocket("/ws/desktop/{agent_id}/")
async def desktop_ws(websocket: WebSocket, agent_id: str, token: str = Query(...)):
    """Browser connects here for WebRTC signaling."""
    user = await verify_token(token)
    if not user:
        await websocket.accept()
        await websocket.close(code=4001, reason="Unauthorized")
        return
    
    agent_uuid = await lookup_agent_id(agent_id)
    agent_ws = agent_connections.get(agent_uuid)
    if not agent_ws:
        await websocket.accept()
        await websocket.close(code=4003, reason="Agent offline")
        return
    
    await websocket.accept()
    session_id = str(uuid.uuid4())
    
    # Generate TURN credentials for this session
    turn_creds = generate_turn_credentials(str(user.id))
    
    # Tell agent to start WebRTC session with TURN credentials
    await agent_ws.send_json({
        "type": "webrtc_start",
        "session_id": session_id,
        "turn": turn_creds,
    })
    
    # Wait for agent's WebRTC offer, relay to browser
    # Then relay browser's answer + ICE candidates to agent
    # ... (bidirectional relay)
```

### 5. Backend: TURN Credential Generation

```python
# api/v2/routers/desktop.py or core/turn.py

import hmac, hashlib, base64, time

TURN_SHARED_SECRET = "..."  # Config from environment
TURN_HOST = "turn.openrmm.derfwins.com"

def generate_turn_credentials(user_id: str, ttl: int = 86400):
    timestamp = int(time.time()) + ttl
    username = f"{timestamp}:{user_id}"
    hmac_obj = hmac.new(TURN_SHARED_SECRET.encode(), username.encode(), hashlib.sha1)
    password = base64.b64encode(hmac_obj.digest()).decode()
    return {
        "username": username,
        "password": password,
        "urls": [
            "turn:turn.openrmm.derfwins.com:3478?transport=udp",
            "turn:turn.openrmm.derfwins.com:3478?transport=tcp",
            "turns:turn.openrmm.derfwins.com:5349?transport=tcp",
        ]
    }
```

### 6. Frontend: WebRTC Viewer Component

```tsx
// RemoteDesktop.tsx — WebRTC Viewer

function RemoteDesktop({ agentId }: { agentId: string }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const pcRef = useRef<RTCPeerConnection | null>(null);
    
    const startSession = async () => {
        // 1. Connect to signaling WebSocket
        const ws = new WebSocket(
            `wss://openrmm.derfwins.com/ws/desktop/${agentId}/?token=${token}`
        );
        
        ws.onmessage = async (event) => {
            const msg = JSON.parse(event.data);
            
            if (msg.type === "webrtc_offer") {
                // 2. Create PeerConnection
                const pc = new RTCPeerConnection({
                    iceServers: msg.turn_servers  // TURN credentials from backend
                });
                pcRef.current = pc;
                
                // 3. Handle video track
                pc.ontrack = (event) => {
                    if (videoRef.current) {
                        videoRef.current.srcObject = event.streams[0];
                    }
                };
                
                // 4. Handle data channel (input)
                pc.ondatachannel = (event) => {
                    const channel = event.channel;
                    channel.onopen = () => {
                        // Start sending mouse/keyboard events
                        setupInputHandlers(canvas, channel);
                    };
                };
                
                // 5. Send ICE candidates to agent
                pc.onicecandidate = (event) => {
                    if (event.candidate) {
                        ws.send(JSON.stringify({
                            type: "webrtc_ice",
                            candidate: event.candidate.toJSON(),
                        }));
                    }
                };
                
                // 6. Set remote description (agent's offer)
                await pc.setRemoteDescription({
                    sdp: msg.sdp,
                    type: msg.type_,
                });
                
                // 7. Create answer
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                
                // 8. Send answer to agent
                ws.send(JSON.stringify({
                    type: "webrtc_answer",
                    sdp: pc.localDescription!.sdp,
                    type_: pc.localDescription!.type,
                }));
            }
            
            if (msg.type === "webrtc_ice") {
                // Add remote ICE candidate
                await pcRef.current?.addIceCandidate(msg.candidate);
            }
        };
    };
    
    return (
        <div>
            <video ref={videoRef} autoPlay playsInline />
            <canvas onMouseMove={handleMouse} onClick={handleClick} 
                    onKeyDown={handleKey} tabIndex={0} />
        </div>
    );
}
```

## Deployment Requirements

### VPS (135.148.26.247)

1. **coturn Docker container** — `network_mode: host`, ports 3478/5349/49152-65535
2. **DNS record** — `turn.openrmm.derfwins.com` → VPS IP, DNS-only (grey cloud, NOT Cloudflare proxy)
3. **Let's Encrypt cert** for turn.openrmm.derfwins.com
4. **Backend changes** — New signaling relay in desktop.py + TURN credential endpoint
5. **Firewall** — Open 3478/tcp+udp, 5349/tcp+udp, 49152-65535/udp

### Windows Agent

1. **pip install** — `aiortc`, `dxcam`, `av` (PyAV with H.264 support), `numpy`
2. **Agent code** — Replace capture_screen+JPEG pipeline with WebRTC PeerConnection
3. **Input injection** — ctypes SendInput for mouse/keyboard
4. **Screen capture** — dxcam (primary) → BitBlt with DACL mod (fallback)

### Frontend

1. **Replace** binary-frame parser with WebRTC RTCPeerConnection
2. **`<video>` tag** for stream display (native browser decoding)
3. **DataChannel** for sending mouse/keyboard/clipboard events
4. **Remove** old desktop.ts service that parsed 5-byte header frames

## Implementation Order

### Phase 1: Infrastructure (Day 1)
1. Deploy coturn on VPS with Docker
2. Set up turn.openrmm.derfwins.com DNS (DNS-only)
3. Get TLS cert for TURN server
4. Add TURN credential generation to backend
5. Test TURN connectivity from browser

### Phase 2: Agent Screen Capture + WebRTC (Day 1-2)
6. Add dxcam to agent dependencies
7. Implement ScreenCaptureTrack (dxcam → av.VideoFrame)
8. Implement DesktopSession with RTCPeerConnection
9. Add input injection (SendInput ctypes)
10. Add WebRTC signaling message handlers to agent WS loop

### Phase 3: Backend Signaling (Day 2)
11. Rewrite desktop.py for WebRTC signaling relay
12. Add TURN credentials to session start message
13. Test signaling flow between agent ↔ backend ↔ browser

### Phase 4: Frontend Viewer (Day 2-3)
14. Implement WebRTC viewer component
15. Handle offer/answer/ICE signaling
16. Set up DataChannel for input events
17. Video display with `<video>` tag
18. Mouse/keyboard event capture and relay

### Phase 5: Polish & Deploy (Day 3)
19. End-to-end testing
20. Clipboard sync
21. Connection quality indicator
22. Remove old WebSocket binary-frame code
23. Git commit + push + deploy

## Critical Pitfalls

1. **dxcam needs DirectX 11** — Won't work on VMs without GPU. Must have gdigrab/BitBlt fallback.
2. **gop_size too large** — aiortc defaults VP8 gop_size=3000 (50 seconds!). PR #1416 fixes to 30. We need to either:
   - Use H.264 (defaults are fine for screen sharing)
   - Or patch/monkey-patch VP8 encoder if using VP8
3. **Never block recv()** — Must use thread + deque for capture
4. **Cloudflare blocks UDP** — TURN subdomain must be DNS-only
5. **BITBLT DACL** — If falling back to BitBlt, must modify WinSta0\Default DACL to grant SYSTEM access
6. **SendInput as SYSTEM** — UIPI (User Interface Privilege Isolation) blocks SYSTEM from sending input to user processes. Need to adjust UIPI or run input injection as user.
7. **aiortc H.264 profile** — Uses Baseline profile by default. For screen sharing, this is fine (no B-frames = lower latency).
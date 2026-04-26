"""WebRTC Remote Desktop — Agent Module

Provides screen capture via dxcam/DXGI (primary) or BitBlt (fallback),
WebRTC PeerConnection via aiortc, and input injection via SendInput.

Signaling flows over the existing agent WebSocket connection:
- Backend sends webrtc_start → agent creates PeerConnection + offer
- Agent sends webrtc_offer → backend relays to browser
- Browser sends webrtc_answer → backend relays to agent
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

log = logging.getLogger("openrmm.webrtc")

# ─── Screen Capture ──────────────────────────────────────────────────────────

class ScreenCapture:
    """Screen capture with dxcam (DXGI) primary, BitBlt fallback."""

    def __init__(self):
        self._method = None
        self._capture = None
        self._started = False
        self.width = 1920
        self.height = 1080

    def start(self):
        if self._started:
            return
        # Try dxcam first (DXGI Desktop Duplication — works as SYSTEM)
        try:
            import dxcam
            self._capture = dxcam.create(output_idx=0, output_color="rgb")
            # Test capture
            frame = self._capture.grab()
            if frame is not None:
                self.height, self.width = frame.shape[:2]
                self._method = "dxcam"
                self._started = True
                log.info(f"Screen capture: dxcam (DXGI) {self.width}x{self.height}")
                return
            else:
                log.warning("dxcam.grab() returned None, trying BitBlt fallback")
                self._capture = None
        except Exception as e:
            log.warning(f"dxcam not available: {e}")

        # BitBlt fallback
        try:
            self._capture = self._init_bitblt()
            if self._capture:
                self._method = "bitblt"
                self._started = True
                log.info("Screen capture: BitBlt fallback")
                return
        except Exception as e:
            log.error(f"BitBlt fallback failed: {e}")

        log.error("No screen capture method available!")

    def _init_bitblt(self):
        """Initialize BitBlt capture with DACL modification."""
        if sys.platform != "win32":
            return None
        try:
            import ctypes
            from ctypes import wintypes

            user32 = ctypes.windll.user32
            kernel32 = ctypes.windll.kernel32

            # Get desktop window and DC
            hwnd = user32.GetDesktopWindow()
            hdc = user32.GetDC(hwnd)

            self.width = user32.GetSystemMetrics(0)
            self.height = user32.GetSystemMetrics(1)

            # Try to modify DACL to allow SYSTEM access
            # ... (existing _modify_desktop_dacl logic from agent)

            return hdc  # We'll use this DC for BitBlt
        except Exception as e:
            log.error(f"BitBlt init failed: {e}")
            return None

    def grab(self):
        """Capture a frame and return as numpy RGB array (height, width, 3)."""
        if not self._started:
            self.start()

        if self._method == "dxcam":
            frame = self._capture.grab()
            if frame is not None:
                return frame  # numpy array (H, W, 3) in RGB
            return None

        elif self._method == "bitblt":
            return self._bitblt_grab()

        return None

    def _bitblt_grab(self):
        """BitBlt screenshot → numpy array."""
        if sys.platform != "win32":
            return None
        try:
            import ctypes
            import numpy as np

            user32 = ctypes.windll.user32
            gdi32 = ctypes.windll.gdi32

            hwnd = user32.GetDesktopWindow()
            hdc = user32.GetDC(hwnd)
            hdc_mem = gdi32.CreateCompatibleDC(hdc)
            hbmp = gdi32.CreateCompatibleBitmap(hdc, self.width, self.height)
            gdi32.SelectObject(hdc_mem, hbmp)

            SRCCOPY = 0x00CC0020
            gdi32.BitBlt(hdc_mem, 0, 0, self.width, self.height, hdc, 0, 0, SRCCOPY)

            # Get bitmap bits
            bmi = struct.pack(
                'IiiHHIIiiii',
                40,  # biSize
                self.width,  # biWidth
                -self.height,  # biHeight (negative = top-down)
                1,   # biPlanes
                32,  # biBitCount (BGRA)
                0,   # biCompression
                0, 0, 0, 0, 0
            )
            buf = ctypes.create_string_buffer(self.width * self.height * 4)
            gdi32.GetDIBits(hdc_mem, hbmp, 0, self.height, buf, bmi, 0)

            # Cleanup
            gdi32.DeleteObject(hbmp)
            gdi32.DeleteDC(hdc_mem)
            user32.ReleaseDC(hwnd, hdc)

            # Convert BGRA → RGB
            arr = np.frombuffer(buf, dtype=np.uint8).reshape(self.height, self.width, 4)
            return arr[:, :, :3][:, :, ::-1]  # BGRA → RGB → flip channels

        except Exception as e:
            log.error(f"BitBlt grab failed: {e}")
            return None

    def stop(self):
        if self._method == "dxcam" and self._capture:
            try:
                self._capture.release()
            except Exception:
                pass
        self._started = False
        self._method = None
        self._capture = None


# ─── WebRTC Peer ──────────────────────────────────────────────────────────────

class WebRTCDesktopSession:
    """Manages a WebRTC remote desktop session: capture → encode → send."""

    def __init__(self, session_id: str, turn_config: dict, agent_ws):
        self.session_id = session_id
        self.turn_config = turn_config
        self.agent_ws = agent_ws  # WebSocket to backend
        self.pc = None
        self.video_track = None
        self.input_channel = None
        self.capture = ScreenCapture()
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

        # Start screen capture
        self.capture.start()
        if not self.capture._started:
            await self._send_error("No screen capture method available")
            return

        # Create PeerConnection with TURN config
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
            "input", ordered=True, maxPacketLifeTime=100
        )

        @self.input_channel.on("message")
        def on_input(message):
            try:
                event = json.loads(message)
                self._handle_input(event)
            except Exception as e:
                log.warning(f"Failed to parse input event: {e}")

        # Handle ICE candidates — send to browser via backend WS
        @self.pc.on("icecandidate")
        async def on_icecandidate(candidate):
            if candidate:
                await self.agent_ws.send(json.dumps({
                    "type": "webrtc_ice",
                    "session_id": self.session_id,
                    "candidate": candidate.to_json(),
                }))

        # Handle connection state changes
        @self.pc.on("connectionstatechange")
        async def on_state():
            state = self.pc.connectionState
            log.info(f"WebRTC connection state: {state}")
            if state in ("failed", "closed", "disconnected"):
                await self.stop()

        # Create and send offer
        try:
            offer = await self.pc.createOffer()
            await self.pc.setLocalDescription(offer)

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
            await self.pc.setRemoteDescription(answer)
            log.info(f"Remote description set for session {self.session_id}")
        except Exception as e:
            log.error(f"Failed to set remote description: {e}", exc_info=True)

    async def handle_ice_candidate(self, candidate_json: dict):
        """Handle ICE candidate from browser."""
        try:
            from aiortc import RTCIceCandidate
            candidate = RTCIceCandidate.from_json(candidate_json)
            await self.pc.addIceCandidate(candidate)
        except Exception as e:
            log.warning(f"Failed to add ICE candidate: {e}")

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
        """Send error message back through WS."""
        try:
            await self.agent_ws.send(json.dumps({
                "type": "webrtc_error",
                "session_id": self.session_id,
                "message": message,
            }))
        except Exception:
            pass

    def _handle_input(self, event: dict):
        """Handle mouse/keyboard events from browser DataChannel."""
        etype = event.get("type", "")
        if etype in ("mousemove", "mousedown", "mouseup", "wheel"):
            self._inject_mouse(event)
        elif etype in ("keydown", "keyup"):
            self._inject_keyboard(event)
        elif etype == "clipboard":
            self._inject_clipboard(event)

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

            # Scale to absolute coordinates (0-65535)
            screen_w = user32.GetSystemMetrics(0)
            screen_h = user32.GetSystemMetrics(1)
            abs_x = int(x * 65535 / max(screen_w, 1))
            abs_y = int(y * 65535 / max(screen_h, 1))

            flags = MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE

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
                # wheelDelta is in mouseData
                # We'll handle this differently

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
            # Set clipboard data
            h = ctypes.windll.kernel32.GlobalAlloc(0x0042, len(text.encode("utf-16-le")) + 2)
            p = ctypes.windll.kernel32.GlobalLock(h)
            ctypes.cdll.msvcrt.wcscpy(ctypes.c_wchar_p(p), text)
            ctypes.windll.kernel32.GlobalUnlock(h)
            ctypes.windll.user32.SetClipboardData(13, h)  # CF_UNICODETEXT = 13
            ctypes.windll.user32.CloseClipboard()
        except Exception as e:
            log.warning(f"Clipboard injection failed: {e}")


class ScreenCaptureTrack:
    """WebRTC VideoStreamTrack that captures the screen via dxcam/BitBlt."""

    kind = "video"

    def __init__(self, capture: ScreenCapture, fps: int = 30):
        from aiortc.contrib.media import MediaStreamTrack
        # Can't inherit MediaStreamTrack directly in some aiortc versions
        # so we'll use the pattern from aiortc examples
        self._capture = capture
        self._fps = fps
        self._start = time.time()
        self._timestamp = 0
        self._stopped = False
        # Counter for PTS generation
        self._frame_counter = 0

        # Set up the track infrastructure
        import asyncio
        try:
            from aiortc import MediaStreamTrack
            # Inherit properly
            pass
        except ImportError:
            pass

    def stop(self):
        self._stopped = True

    async def recv(self):
        """Return next video frame."""
        import av
        import numpy as np
        from aiortc.contrib.media import VideoStreamTrack

        if self._stopped:
            raise Exception("Track stopped")

        # Wait for next frame interval
        frame_delay = 1.0 / self._fps
        await asyncio.sleep(frame_delay)

        # Capture frame
        frame_array = self._capture.grab()
        if frame_array is None:
            # Return a black frame
            frame_array = np.zeros((self._capture.height, self._capture.width, 3), dtype=np.uint8)

        # Convert numpy array → av.VideoFrame
        video_frame = av.VideoFrame.from_ndarray(frame_array, format="rgb24")

        # Set PTS
        self._frame_counter += 1
        video_frame.pts = self._frame_counter
        video_frame.time_base = av.Fraction(1, self._fps)

        return video_frame
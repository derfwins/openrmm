import { useState, useEffect, useRef, useCallback } from 'react'

interface Props {
  agentId: string
  token: string
  onClose: () => void
}

type Quality = 'low' | 'medium' | 'high'

const QUALITY_SETTINGS: Record<Quality, { quality: number; fps: number; bitrate: number }> = {
  low: { quality: 30, fps: 10, bitrate: 500_000 },
  medium: { quality: 55, fps: 20, bitrate: 2_000_000 },
  high: { quality: 80, fps: 30, bitrate: 5_000_000 },
}

// Binary frame types from agent
const FRAME_H264_KEY = 0x01
const FRAME_H264_DELTA = 0x02
const FRAME_CURSOR = 0x03
const FRAME_CLIPBOARD = 0x04
const FRAME_CONFIG = 0x05

// Binary frame types to agent
const FRAME_MOUSE = 0x10
const FRAME_KEYBOARD = 0x11
const FRAME_CLIPBOARD_OUT = 0x12
const FRAME_SETTINGS = 0x13

// Helper: encode binary frame with 5-byte header
function encodeFrame(frameType: number, payload: ArrayBuffer | Uint8Array): ArrayBuffer {
  const payloadLen = payload instanceof Uint8Array ? payload.byteLength : payload.byteLength
  const buf = new ArrayBuffer(5 + payloadLen)
  const view = new DataView(buf)
  view.setUint8(0, frameType)
  view.setUint32(1, payloadLen, false) // big endian
  const body = new Uint8Array(buf, 5)
  if (payload instanceof Uint8Array) {
    body.set(payload)
  } else {
    body.set(new Uint8Array(payload))
  }
  return buf
}

// Helper: encode mouse event
function encodeMouseEvent(x: number, y: number, buttons: number, wheelDelta: number): ArrayBuffer {
  const buf = new ArrayBuffer(11)
  const view = new DataView(buf)
  view.setUint32(0, x, true)       // little-endian x
  view.setUint32(4, y, true)       // little-endian y
  view.setUint8(8, buttons)
  view.setInt16(9, wheelDelta, true)
  return encodeFrame(FRAME_MOUSE, buf)
}

// Helper: encode keyboard event
function encodeKeyboardEvent(action: number, vkCode: number, scanCode: number, modifiers: number): ArrayBuffer {
  const buf = new ArrayBuffer(10)
  const view = new DataView(buf)
  view.setUint8(0, action)    // 0=down, 1=up
  view.setUint32(1, vkCode, true)
  view.setUint32(5, scanCode, true)
  view.setUint8(9, modifiers)
  return encodeFrame(FRAME_KEYBOARD, buf)
}

// Helper: encode clipboard text
function encodeClipboardText(text: string): ArrayBuffer {
  return encodeFrame(FRAME_CLIPBOARD_OUT, new TextEncoder().encode(text))
}

// Helper: encode settings JSON
function encodeSettings(settings: object): ArrayBuffer {
  return encodeFrame(FRAME_SETTINGS, new TextEncoder().encode(JSON.stringify(settings)))
}

// Key code to VK code mapping (Windows virtual key codes)
const KEY_TO_VK: Record<string, number> = {
  Backspace: 0x08, Tab: 0x09, Enter: 0x0D, ShiftLeft: 0x10, ShiftRight: 0x10,
  ControlLeft: 0x11, ControlRight: 0x11, AltLeft: 0x12, AltRight: 0x12,
  Pause: 0x13, CapsLock: 0x14, Escape: 0x1B, Space: 0x20,
  PageUp: 0x21, PageDown: 0x22, End: 0x23, Home: 0x24,
  ArrowLeft: 0x25, ArrowUp: 0x26, ArrowRight: 0x27, ArrowDown: 0x28,
  PrintScreen: 0x2C, Insert: 0x2D, Delete: 0x2E,
  Digit0: 0x30, Digit1: 0x31, Digit2: 0x32, Digit3: 0x33, Digit4: 0x34,
  Digit5: 0x35, Digit6: 0x36, Digit7: 0x37, Digit8: 0x38, Digit9: 0x39,
  KeyA: 0x41, KeyB: 0x42, KeyC: 0x43, KeyD: 0x44, KeyE: 0x45, KeyF: 0x46,
  KeyG: 0x47, KeyH: 0x48, KeyI: 0x49, KeyJ: 0x4A, KeyK: 0x4B, KeyL: 0x4C,
  KeyM: 0x4D, KeyN: 0x4E, KeyO: 0x4F, KeyP: 0x50, KeyQ: 0x51, KeyR: 0x52,
  KeyS: 0x53, KeyT: 0x54, KeyU: 0x55, KeyV: 0x56, KeyW: 0x57, KeyX: 0x58,
  KeyY: 0x59, KeyZ: 0x5A,
  MetaLeft: 0x5B, MetaRight: 0x5C,
  F1: 0x70, F2: 0x71, F3: 0x72, F4: 0x73, F5: 0x74, F6: 0x75,
  F7: 0x76, F8: 0x77, F9: 0x78, F10: 0x79, F11: 0x7A, F12: 0x7B,
  NumLock: 0x90, ScrollLock: 0x91,
  Semicolon: 0xBA, Equal: 0xBB, Comma: 0xBC, Minus: 0xBD, Period: 0xBE,
  Slash: 0xBF, Backquote: 0xC0, BracketLeft: 0xDB, Backslash: 0xDC,
  BracketRight: 0xDD, Quote: 0xDE,
}

const RemoteDesktop = ({ agentId, token, onClose }: Props) => {
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quality, setQuality] = useState<Quality>('medium')
  const [viewOnly, setViewOnly] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [fps, setFps] = useState(0)
  const [latency, setLatency] = useState(0)
  const [screenInfo, setScreenInfo] = useState<{ width: number; height: number; monitors: number } | null>(null)
  const [useWebCodecs, setUseWebCodecs] = useState(false)
  const [codecReady, setCodecReady] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const decoderRef = useRef<VideoDecoder | null>(null)
  const fpsCounterRef = useRef({ frames: 0, lastTime: performance.now() })
  const pingRef = useRef({ lastPing: 0, lastPong: 0 })
  const remoteSizeRef = useRef({ width: 1920, height: 1080 })
  const imgRef = useRef<HTMLImageElement | null>(null)
  const codecFailedRef = useRef(false)

  // Check WebCodecs support
  useEffect(() => {
    if (typeof VideoDecoder !== 'undefined') {
      setUseWebCodecs(true)
    }
  }, [])

  // FPS counter update
  useEffect(() => {
    const interval = setInterval(() => {
      const counter = fpsCounterRef.current
      const now = performance.now()
      const elapsed = now - counter.lastTime
      if (elapsed >= 1000) {
        setFps(Math.round(counter.frames * 1000 / elapsed))
        counter.frames = 0
        counter.lastTime = now
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Setup VideoDecoder
  const setupDecoder = useCallback(() => {
    if (!useWebCodecs || codecFailedRef.current) return

    try {
      const canvas = canvasRef.current
      if (!canvas) return

      const decoder = new VideoDecoder({
        output: (frame: VideoFrame) => {
          const ctx = canvas.getContext('2d')
          if (ctx) {
            if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
              canvas.width = frame.displayWidth
              canvas.height = frame.displayHeight
            }
            ctx.drawImage(frame, 0, 0, canvas.width, canvas.height)
          }
          frame.close()

          // FPS counter
          fpsCounterRef.current.frames++
        },
        error: (e: Error) => {
          console.error('VideoDecoder error:', e)
          codecFailedRef.current = true
          setCodecReady(false)
        },
      })

      decoder.configure({
        codec: 'avc1.42E01E', // H.264 Baseline Profile
        optimizeForLatency: true,
      })

      decoderRef.current = decoder
      setCodecReady(true)
    } catch (e) {
      console.warn('WebCodecs setup failed, falling back to JPEG:', e)
      codecFailedRef.current = true
      setUseWebCodecs(false)
    }
  }, [useWebCodecs])

  // JPEG fallback renderer
  const renderJpegFrame = useCallback((data: ArrayBuffer) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const blob = new Blob([data], { type: 'image/jpeg' })
    const url = URL.createObjectURL(blob)

    if (!imgRef.current) {
      imgRef.current = new Image()
    }
    const img = imgRef.current

    img.onload = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      if (canvas.width !== img.width || canvas.height !== img.height) {
        canvas.width = img.width
        canvas.height = img.height
        remoteSizeRef.current = { width: img.width, height: img.height }
      }

      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      fpsCounterRef.current.frames++
    }
    img.src = url
  }, [])

  // Parse and handle binary frame from agent
  const handleBinaryFrame = useCallback((buffer: ArrayBuffer) => {
    if (buffer.byteLength < 5) return

    const view = new DataView(buffer)
    const frameType = view.getUint8(0)
    const payloadLen = view.getUint32(1, false) // big endian
    const payload = buffer.slice(5, 5 + payloadLen)

    switch (frameType) {
      case FRAME_H264_KEY:
      case FRAME_H264_DELTA: {
        const isKeyframe = frameType === FRAME_H264_KEY
        const decoder = decoderRef.current

        if (decoder && useWebCodecs && !codecFailedRef.current && decoder.state !== 'closed') {
          try {
            const chunk = new EncodedVideoChunk({
              type: isKeyframe ? 'key' : 'delta',
              timestamp: performance.now() * 1000, // microseconds
              data: payload,
            })
            decoder.decode(chunk)
          } catch (e) {
            console.warn('Decode failed, falling back to JPEG:', e)
            codecFailedRef.current = true
            renderJpegFrame(buffer.slice(5))
          }
        } else {
          // Fallback: treat as raw JPEG (legacy agents)
          renderJpegFrame(payload)
        }
        break
      }

      case FRAME_CURSOR: {
        // Cursor data: 2 bytes x, 2 bytes y
        if (payload.byteLength >= 4) {
          const cursorView = new DataView(payload)
          const cx = cursorView.getUint16(0, true)
          const cy = cursorView.getUint16(2, true)
          // Draw cursor overlay on canvas
          const canvas = canvasRef.current
          if (canvas) {
            const ctx = canvas.getContext('2d')
            if (ctx) {
              const scaleX = canvas.width / remoteSizeRef.current.width
              const scaleY = canvas.height / remoteSizeRef.current.height
              // Simple cursor indicator
              ctx.fillStyle = 'rgba(255,255,255,0.8)'
              ctx.beginPath()
              ctx.arc(cx * scaleX, cy * scaleY, 3, 0, Math.PI * 2)
              ctx.fill()
            }
          }
        }
        break
      }

      case FRAME_CLIPBOARD: {
        // Agent sent clipboard text
        try {
          const text = new TextDecoder().decode(payload)
          navigator.clipboard.writeText(text).catch(() => {})
        } catch { /* ignore */ }
        break
      }

      case FRAME_CONFIG: {
        // JSON config from agent (screen info, etc.)
        try {
          const config = JSON.parse(new TextDecoder().decode(payload))
          if (config.width && config.height) {
            remoteSizeRef.current = { width: config.width, height: config.height }
            setScreenInfo({
              width: config.width,
              height: config.height,
              monitors: config.monitors || 1,
            })
          }
        } catch { /* ignore */ }
        break
      }

      default:
        console.warn(`Unknown frame type: 0x${frameType.toString(16).padStart(2, '0')}`)
    }
  }, [useWebCodecs, renderJpegFrame])

  // Connect WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    setError(null)

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const wsUrl = `${protocol}//${host}/ws/desktop/${agentId}/?token=${token}`

    const ws = new WebSocket(wsUrl)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      setError(null)

      // Setup decoder if WebCodecs available
      if (useWebCodecs && !codecFailedRef.current) {
        setupDecoder()
      }

      // Send initial quality settings
      const settings = QUALITY_SETTINGS[quality]
      ws.send(encodeSettings(settings))

      // Start ping interval for latency measurement
      pingRef.current.lastPing = performance.now()
    }

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        handleBinaryFrame(event.data)
      } else {
        try {
          const msg = JSON.parse(event.data)
          switch (msg.type) {
            case 'desktop_info':
              remoteSizeRef.current = { width: msg.width || 1920, height: msg.height || 1080 }
              setScreenInfo({
                width: msg.width || 1920,
                height: msg.height || 1080,
                monitors: msg.monitors || 1,
              })
              break
            case 'desktop_stopped':
              setError('Remote desktop session ended by agent')
              setConnected(false)
              break
            case 'pong':
              setLatency(Math.round(performance.now() - pingRef.current.lastPing))
              break
            case 'error':
              setError(msg.message || 'Error')
              break
          }
        } catch { /* ignore */ }
      }
    }

    ws.onclose = (event) => {
      setConnected(false)
      if (event.code === 4003) setError('Agent is offline')
      else if (event.code === 4004) setError('Agent not found')
      else if (event.code === 4001) setError('Authentication failed')
    }

    ws.onerror = () => setError('Connection failed')
  }, [agentId, token, quality, useWebCodecs, setupDecoder, handleBinaryFrame])

  const disconnect = useCallback(() => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'desktop_stop' }))
    }
    ws?.close()

    // Close decoder
    const decoder = decoderRef.current
    if (decoder && decoder.state !== 'closed') {
      decoder.close()
    }
    decoderRef.current = null
    setCodecReady(false)
    setConnected(false)
  }, [])

  // Send binary input to agent
  const sendBinary = useCallback((data: ArrayBuffer) => {
    if (viewOnly) return
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(data)
    }
  }, [viewOnly])

  // Mouse events
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (viewOnly) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = remoteSizeRef.current.width / rect.width
    const scaleY = remoteSizeRef.current.height / rect.height
    const x = Math.round((e.clientX - rect.left) * scaleX)
    const y = Math.round((e.clientY - rect.top) * scaleY)
    sendBinary(encodeMouseEvent(x, y, { 0: 1, 1: 4, 2: 2 }[e.button] ?? 0, 0))
  }, [viewOnly, sendBinary])

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (viewOnly) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = remoteSizeRef.current.width / rect.width
    const scaleY = remoteSizeRef.current.height / rect.height
    const x = Math.round((e.clientX - rect.left) * scaleX)
    const y = Math.round((e.clientY - rect.top) * scaleY)
    sendBinary(encodeMouseEvent(x, y, 0, 0))
  }, [viewOnly, sendBinary])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (viewOnly) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = remoteSizeRef.current.width / rect.width
    const scaleY = remoteSizeRef.current.height / rect.height
    const x = Math.round((e.clientX - rect.left) * scaleX)
    const y = Math.round((e.clientY - rect.top) * scaleY)
    const buttons = e.buttons & 1 ? 1 : e.buttons & 4 ? 4 : e.buttons & 2 ? 2 : 0
    sendBinary(encodeMouseEvent(x, y, buttons, 0))
  }, [viewOnly, sendBinary])

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    if (viewOnly) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = remoteSizeRef.current.width / rect.width
    const scaleY = remoteSizeRef.current.height / rect.height
    const x = Math.round((e.clientX - rect.left) * scaleX)
    const y = Math.round((e.clientY - rect.top) * scaleY)
    const delta = Math.sign(e.deltaY) * 120 // Windows WHEEL_DELTA
    sendBinary(encodeMouseEvent(x, y, 0, delta))
    e.preventDefault()
  }, [viewOnly, sendBinary])

  // Keyboard events
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (viewOnly) return
    e.preventDefault()

    const vkCode = KEY_TO_VK[e.code] ?? e.keyCode
    const scanCode = 0 // Will be filled by agent from vkCode
    let modifiers = 0
    if (e.shiftKey) modifiers |= 1
    if (e.ctrlKey) modifiers |= 2
    if (e.altKey) modifiers |= 4
    if (e.metaKey) modifiers |= 8

    sendBinary(encodeKeyboardEvent(0, vkCode, scanCode, modifiers)) // 0 = key down
  }, [viewOnly, sendBinary])

  const handleKeyUp = useCallback((e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (viewOnly) return
    e.preventDefault()

    const vkCode = KEY_TO_VK[e.code] ?? e.keyCode
    const scanCode = 0
    let modifiers = 0
    if (e.shiftKey) modifiers |= 1
    if (e.ctrlKey) modifiers |= 2
    if (e.altKey) modifiers |= 4
    if (e.metaKey) modifiers |= 8

    sendBinary(encodeKeyboardEvent(1, vkCode, scanCode, modifiers)) // 1 = key up
  }, [viewOnly, sendBinary])

  // Clipboard sync on focus
  const handleCanvasFocus = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text && wsRef.current?.readyState === WebSocket.OPEN) {
        sendBinary(encodeClipboardText(text))
      }
    } catch { /* clipboard access denied */ }
  }, [sendBinary])

  // Quality change
  const changeQuality = useCallback((q: Quality) => {
    setQuality(q)
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(encodeSettings(QUALITY_SETTINGS[q]))
    }
  }, [])

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {})
    }
  }, [])

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // Ping interval for latency
  useEffect(() => {
    if (!connected) return
    const interval = setInterval(() => {
      const ws = wsRef.current
      if (ws?.readyState === WebSocket.OPEN) {
        pingRef.current.lastPing = performance.now()
        ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [connected])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const ws = wsRef.current
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'desktop_stop' }))
        ws.close()
      }
      const decoder = decoderRef.current
      if (decoder && decoder.state !== 'closed') {
        decoder.close()
      }
    }
  }, [])

  // Auto-connect
  useEffect(() => {
    if (agentId && token) connect()
  }, [agentId, token]) // intentionally not including connect to avoid reconnection loop

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-black">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-500'}`} />
          <span className="text-sm text-gray-300">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
          {connected && fps > 0 && (
            <span className="text-xs text-gray-400">{fps} FPS</span>
          )}
          {latency > 0 && (
            <span className={`text-xs ${latency < 50 ? 'text-green-400' : latency < 100 ? 'text-yellow-400' : 'text-red-400'}`}>
              {latency}ms
            </span>
          )}
          {screenInfo && (
            <span className="text-xs text-gray-500">
              {screenInfo.width}×{screenInfo.height}
              {screenInfo.monitors > 1 && ` · ${screenInfo.monitors} monitors`}
            </span>
          )}
          {useWebCodecs && (
            <span className="text-xs text-blue-400">
              {codecReady ? 'HW Decode' : codecFailedRef.current ? 'SW Fallback' : '...'}
            </span>
          )}
          {!useWebCodecs && (
            <span className="text-xs text-gray-500">JPEG</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* View Only toggle */}
          <button
            onClick={() => setViewOnly(!viewOnly)}
            className={`px-2 py-1 text-xs rounded ${viewOnly ? 'bg-yellow-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            title={viewOnly ? 'View only - no input sent' : 'Full control'}
          >
            {viewOnly ? '👁 View Only' : '🖥 Control'}
          </button>

          {/* Quality selector */}
          <select
            value={quality}
            onChange={(e) => changeQuality(e.target.value as Quality)}
            className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded border border-gray-600"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
            title="Fullscreen"
          >
            {fullscreen ? '⬜' : '⬛'}
          </button>

          {connected ? (
            <button onClick={disconnect} className="px-3 py-1 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700">
              Disconnect
            </button>
          ) : (
            <button onClick={connect} className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700">
              Connect
            </button>
          )}
          <button onClick={onClose} className="px-2 py-1 text-xs text-gray-400 hover:text-white">
            ✕
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-3 py-2 bg-red-900/50 border-b border-red-700 text-red-300 text-sm flex-shrink-0">
          {error}
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 flex items-center justify-center overflow-hidden relative" style={{ background: '#111' }}>
        {!connected && !error && (
          <div className="text-gray-500 text-sm">Connecting to remote desktop...</div>
        )}
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
          onWheel={handleWheel}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onFocus={handleCanvasFocus}
          tabIndex={0}
          className="max-w-full max-h-full object-contain cursor-default outline-none"
          style={{ imageRendering: 'auto' }}
        />
      </div>
    </div>
  )
}

export default RemoteDesktop
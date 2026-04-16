import { useState, useEffect, useRef, useCallback } from 'react'

interface Props {
  agentId: string
  token: string
  onClose: () => void
}

type Quality = 'low' | 'medium' | 'high'

const QUALITY_MAP: Record<Quality, number> = { low: 30, medium: 55, high: 80 }
const FPS_MAP: Record<Quality, number> = { low: 5, medium: 10, high: 15 }

const RemoteDesktop = ({ agentId, token, onClose }: Props) => {
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quality, setQuality] = useState<Quality>('medium')
  const [viewOnly, setViewOnly] = useState(false)
  const [screenInfo, setScreenInfo] = useState<{ width: number; height: number; monitors: number } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fpsCounterRef = useRef({ frames: 0, lastTime: Date.now(), fps: 0 })

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
      // Send initial quality settings
      ws.send(JSON.stringify({
        type: 'desktop_settings',
        quality: QUALITY_MAP[quality],
        fps: FPS_MAP[quality],
      }))
    }

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        // Binary frame data (JPEG)
        renderFrame(event.data)
      } else {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'desktop_info') {
            setScreenInfo({
              width: msg.width || 1920,
              height: msg.height || 1080,
              monitors: msg.monitors || 1,
            })
          } else if (msg.type === 'desktop_stopped') {
            setError('Remote desktop session ended by agent')
            setConnected(false)
          } else if (msg.type === 'error') {
            setError(msg.message || 'Error')
          }
        } catch {
          // ignore
        }
      }
    }

    ws.onclose = (event) => {
      setConnected(false)
      if (event.code === 4003) {
        setError('Agent is offline')
      } else if (event.code === 4004) {
        setError('Agent not found')
      } else if (event.code === 4001) {
        setError('Authentication failed')
      }
    }

    ws.onerror = () => {
      setError('Connection failed')
    }
  }, [agentId, token, quality])

  const renderFrame = (data: ArrayBuffer) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const blob = new Blob([data], { type: 'image/jpeg' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Resize canvas to match frame if needed
      if (canvas.width !== img.width || canvas.height !== img.height) {
        canvas.width = img.width
        canvas.height = img.height
      }

      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)

      // FPS counter
      const counter = fpsCounterRef.current
      counter.frames++
      const now = Date.now()
      if (now - counter.lastTime >= 1000) {
        counter.fps = counter.frames
        counter.frames = 0
        counter.lastTime = now
      }
    }
    img.src = url
  }

  const disconnect = () => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'desktop_stop' }))
    }
    ws?.close()
    setConnected(false)
  }

  // Mouse event handling
  const handleMouseEvent = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (viewOnly || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = Math.round((e.clientX - rect.left) * scaleX)
    const y = Math.round((e.clientY - rect.top) * scaleY)

    const btnMap: Record<number, number> = { 0: 0, 1: 1, 2: 2 }

    wsRef.current.send(JSON.stringify({
      type: 'mouse',
      action: e.type === 'mousedown' ? 'down' : e.type === 'mouseup' ? 'up' : e.type === 'mousemove' ? 'move' : e.type === 'dblclick' ? 'dblclick' : e.type,
      x,
      y,
      button: btnMap[e.button] ?? 0,
    }))
  }, [viewOnly])

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    if (viewOnly || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = Math.round((e.clientX - rect.left) * scaleX)
    const y = Math.round((e.clientY - rect.top) * scaleY)

    wsRef.current.send(JSON.stringify({
      type: 'mouse',
      action: 'wheel',
      x,
      y,
      delta: e.deltaY,
      button: 0,
    }))
  }, [viewOnly])

  // Keyboard event handling
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (viewOnly || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    e.preventDefault()
    wsRef.current.send(JSON.stringify({
      type: 'keyboard',
      action: 'down',
      key: e.key,
      code: e.code,
      shift: e.shiftKey,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      meta: e.metaKey,
    }))
  }, [viewOnly])

  const handleKeyUp = useCallback((e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (viewOnly || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    e.preventDefault()
    wsRef.current.send(JSON.stringify({
      type: 'keyboard',
      action: 'up',
      key: e.key,
      code: e.code,
      shift: e.shiftKey,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      meta: e.metaKey,
    }))
  }, [viewOnly])

  // Quality change
  const changeQuality = (q: Quality) => {
    setQuality(q)
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'desktop_settings',
        quality: QUALITY_MAP[q],
        fps: FPS_MAP[q],
      }))
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close()
    }
  }, [])

  // Auto-connect
  useEffect(() => {
    if (agentId && token) {
      connect()
    }
  }, [agentId, token, connect])

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-500'}`} />
          <span className="text-sm text-gray-300">
            {connected ? `Connected${fpsCounterRef.current.fps > 0 ? ` · ${fpsCounterRef.current.fps} FPS` : ''}` : 'Disconnected'}
          </span>
          {screenInfo && (
            <span className="text-xs text-gray-500">
              {screenInfo.width}×{screenInfo.height} · {screenInfo.monitors} monitor{screenInfo.monitors > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* View Only toggle */}
          <button
            onClick={() => setViewOnly(!viewOnly)}
            className={`px-2 py-1 text-xs rounded ${viewOnly ? 'bg-yellow-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            title={viewOnly ? 'View only - no input sent' : 'Full control - input sent to remote'}
          >
            {viewOnly ? '👁 View Only' : '🖥 Control'}
          </button>

          {/* Quality selector */}
          <select
            value={quality}
            onChange={(e) => changeQuality(e.target.value as Quality)}
            className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded border border-gray-600"
          >
            <option value="low">Low (5fps)</option>
            <option value="medium">Medium (10fps)</option>
            <option value="high">High (15fps)</option>
          </select>

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
          onMouseDown={handleMouseEvent}
          onMouseUp={handleMouseEvent}
          onMouseMove={handleMouseEvent}
          onDoubleClick={handleMouseEvent}
          onWheel={handleWheel}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          tabIndex={0}
          className="max-w-full max-h-full object-contain cursor-default outline-none"
          style={{ imageRendering: 'auto' }}
        />
      </div>
    </div>
  )
}

export default RemoteDesktop
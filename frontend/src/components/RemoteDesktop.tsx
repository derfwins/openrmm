import { useState, useEffect, useRef, useCallback } from 'react'
import { IconEye, IconMonitor, IconClipboardList, IconLock, IconKeyboard, IconDoor, IconExpand, IconCompress } from './Icons'

interface Props {
  agentId: string
  token: string
  onClose?: () => void
}

type Quality = 'low' | 'medium' | 'high'

const QUALITY_FPS: Record<Quality, number> = {
  low: 15,
  medium: 24,
  high: 30,
}

// Key code to Windows VK code mapping
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

interface TurnCredentials {
  username: string
  password: string
  urls: string[]
}

const RemoteDesktop = ({ agentId, token, onClose }: Props) => {
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quality, setQuality] = useState<Quality>('medium')
  const [viewOnly, setViewOnly] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [stats, setStats] = useState({ fps: 0, latency: 0, resolution: '' })
  const [showClipboard, setShowClipboard] = useState(false)
  const [remoteClipboard, setRemoteClipboard] = useState('')
  const [localClipboard, setLocalClipboard] = useState('')
  const [sessions, setSessions] = useState<Array<{session_id: number, session_name: string, state: string, username: string, is_console: boolean}>>([])
  const [selectedSession, setSelectedSession] = useState<number>(-1)  // -1 = console/default

  const videoRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null) // input data channel
  const sessionIdRef = useRef<string>('')
  const turnCredsRef = useRef<TurnCredentials | null>(null)
  const remoteSizeRef = useRef({ width: 1920, height: 1080 })
  const shouldReconnectRef = useRef(false)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
  const [reconnectAttempt, setReconnectAttempt] = useState(0)
  const manualDisconnectRef = useRef(false)

  // Connect: open signaling WS, get TURN creds, then let backend signal agent
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    setConnecting(true)
    setError(null)

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const wsUrl = `${protocol}//${host}/ws/desktop/${agentId}/?token=${token}&target_session=${selectedSession}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('[RemoteDesktop] WS opened, waiting for session_start...')
    }

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data)

        switch (msg.type) {
          case 'session_start': {
            // Backend sent session ID + TURN credentials
            console.log('[RemoteDesktop] Got session_start, session_id:', msg.session_id, 'turn_urls:', msg.turn?.urls)
            sessionIdRef.current = msg.session_id
            // Store TURN credentials for PeerConnection creation
            turnCredsRef.current = msg.turn || null
            // Request session list from agent
            ws.send(JSON.stringify({ type: 'list_sessions' }))
            // Now wait for webrtc_offer from agent
            break
          }

          case 'list_sessions_result': {
            const sessionList = msg.sessions || []
            setSessions(sessionList)
            break
          }

          case 'webrtc_offer': {
            // Agent sent SDP offer — create RTCPeerConnection and answer
            console.log('[RemoteDesktop] Received webrtc_offer, session_id:', msg.session_id, 'sdp length:', msg.sdp?.length, 'type_:', msg.type_)
            try {
            const turnCreds: TurnCredentials = turnCredsRef.current || { urls: [], username: '', password: '' }

            // Create RTCPeerConnection with TURN servers
            const iceServers: RTCIceServer[] = [
              { urls: 'stun:stun.l.google.com:19302' },
            ]
            if (turnCreds.urls?.length) {
              iceServers.push({
                urls: turnCreds.urls,
                username: turnCreds.username,
                credential: turnCreds.password,
              })
            }

            const pc = new RTCPeerConnection({
              iceServers,
              bundlePolicy: 'max-bundle',
              rtcpMuxPolicy: 'require',
            })
            pcRef.current = pc

            // Handle video track
            pc.ontrack = (ev) => {
              console.log('[RemoteDesktop] Got remote track:', ev.track.kind, ev.streams.length)
              if (videoRef.current && ev.streams[0]) {
                videoRef.current.srcObject = ev.streams[0]
              }
            }

            // Handle data channel (agent creates it)
            pc.ondatachannel = (ev) => {
              console.log('[RemoteDesktop] Got data channel:', ev.channel.label)
              const channel = ev.channel
              dcRef.current = channel

              channel.onopen = () => {
                console.log('[RemoteDesktop] DataChannel open')
                setConnected(true)
                setConnecting(false)
                setReconnecting(false)
                setError(null)
                reconnectAttemptsRef.current = 0
                shouldReconnectRef.current = true
              }

              channel.onclose = () => {
                console.log('[RemoteDesktop] DataChannel closed')
              }

              channel.onmessage = (e) => {
                try {
                  const data = JSON.parse(e.data)
                  if (data.type === 'clipboard') {
                    setRemoteClipboard(data.text || '')
                    navigator.clipboard.writeText(data.text || '').catch(() => {})
                  }
                } catch { /* ignore non-JSON messages */ }
              }
            }

            // Handle ICE candidates — send to agent via signaling WS
            pc.onicecandidate = (ev) => {
              if (ev.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                  type: 'webrtc_ice',
                  session_id: sessionIdRef.current,
                  candidate: ev.candidate.toJSON(),
                }))
              }
            }

            // Connection state changes
            pc.onconnectionstatechange = () => {
              const state = pc.connectionState
              console.log('[RemoteDesktop] Connection state:', state)
              if (state === 'connected') {
                setConnected(true)
                setConnecting(false)
                setReconnecting(false)
                reconnectAttemptsRef.current = 0
                shouldReconnectRef.current = true
              } else if (state === 'failed') {
                setConnected(false)
                pc.close()
                if (shouldReconnectRef.current && !manualDisconnectRef.current) {
                  scheduleReconnect()
                } else {
                  setError('WebRTC connection failed')
                }
              } else if (state === 'disconnected') {
                setConnected(false)
                if (shouldReconnectRef.current && !manualDisconnectRef.current) {
                  scheduleReconnect()
                }
              } else if (state === 'closed') {
                setConnected(false)
              }
            }

            // Set remote description (agent's offer)
            console.log('[RemoteDesktop] Setting remote description, type:', msg.type_)
            await pc.setRemoteDescription(new RTCSessionDescription({
              sdp: msg.sdp,
              type: msg.type_ as RTCSdpType,
            }))
            console.log('[RemoteDesktop] Remote description set successfully')

            // Create answer
            console.log('[RemoteDesktop] Creating answer...')
            const answer = await pc.createAnswer()
            console.log('[RemoteDesktop] Answer created, type:', answer.type, 'sdp length:', answer.sdp?.length)
            await pc.setLocalDescription(answer)
            console.log('[RemoteDesktop] Local description set')

            // Send answer back via signaling WS
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({
                type: 'webrtc_answer',
                session_id: sessionIdRef.current,
                sdp: pc.localDescription!.sdp,
                type_: pc.localDescription!.type,
              }))
              console.log('[RemoteDesktop] Sent webrtc_answer')
            } else {
              console.error('[RemoteDesktop] WS not open, cannot send answer')
              setError('Signaling connection lost')
            }

            } catch (webrtcErr) {
              console.error('[RemoteDesktop] WebRTC setup error:', webrtcErr)
              setError(`WebRTC setup failed: ${webrtcErr instanceof Error ? webrtcErr.message : String(webrtcErr)}`)
            }
            break
          }

          case 'webrtc_ice': {
            // ICE candidate from agent
            const pc = pcRef.current
            if (pc && msg.candidate) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(msg.candidate))
              } catch (e) {
                console.warn('ICE candidate error:', e)
              }
            }
            break
          }

          case 'webrtc_stopped': {
            setError('Remote desktop session ended by agent')
            cleanup()
            break
          }

          case 'webrtc_error': {
            setError(msg.message || 'WebRTC error')
            cleanup()
            break
          }

          case 'webrtc_log': {
            console.log('[WebRTC Agent Log]', msg.message)
            break
          }

          case 'ping': {
            // Latency measurement
            ws.send(JSON.stringify({ type: 'pong' }))
            break
          }

          case 'error': {
            setError(msg.message || 'Error')
            break
          }
        }
      } catch (e) {
        console.error('WS message error:', e)
      }
    }

    ws.onclose = (event) => {
      console.log('[RemoteDesktop] WS closed, code:', event.code, 'reason:', event.reason)
      setConnecting(false)
      setConnected(false)
      wsRef.current = null
      // Auth errors — don't reconnect
      const authError = [4001, 4003, 4004].includes(event.code)
      if (authError) {
        if (event.code === 4003) setError('Agent is offline')
        else if (event.code === 4004) setError('Agent not found')
        else setError('Authentication failed')
        shouldReconnectRef.current = false
        manualDisconnectRef.current = false
      } else if (shouldReconnectRef.current && !manualDisconnectRef.current) {
        // Auto-reconnect on non-auth disconnects
        scheduleReconnect()
      } else {
        setError('Connection closed')
      }
    }

    ws.onerror = () => {
      setConnecting(false)
      if (shouldReconnectRef.current && !manualDisconnectRef.current) {
        scheduleReconnect()
      } else {
        setError('Connection failed')
      }
    }
  }, [agentId, token, selectedSession])

  const cleanup = useCallback(() => {
    // Close DataChannel
    if (dcRef.current) {
      dcRef.current.close()
      dcRef.current = null
    }
    // Close PeerConnection
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    // Close WebSocket
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'desktop_stop' }))
      wsRef.current.close()
      wsRef.current = null
    }
    setConnected(false)
    setConnecting(false)
    setReconnecting(false)
  }, [])

  const scheduleReconnect = useCallback(() => {
    const maxAttempts = 10
    const attempt = reconnectAttemptsRef.current + 1
    if (attempt > maxAttempts) {
      setError('Connection lost — click Connect to retry')
      shouldReconnectRef.current = false
      setReconnecting(false)
      return
    }
    reconnectAttemptsRef.current = attempt
    setReconnectAttempt(attempt)
    setReconnecting(true)
    setError(null)
    // Exponential backoff: 2s, 4s, 8s, 16s, 30s cap
    const delay = Math.min(2000 * Math.pow(2, attempt - 1), 30000)
    console.log(`[RemoteDesktop] Reconnecting in ${delay}ms (attempt ${attempt}/${maxAttempts})`)
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null
      if (shouldReconnectRef.current && !manualDisconnectRef.current) {
        connect()
      }
    }, delay)
  }, [connect])

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true
    shouldReconnectRef.current = false
    reconnectAttemptsRef.current = 0
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    setReconnecting(false)
    cleanup()
  }, [cleanup])

  // Send input event via DataChannel
  const sendInput = useCallback((event: object) => {
    if (viewOnly) return
    const dc = dcRef.current
    if (dc?.readyState === 'open') {
      dc.send(JSON.stringify(event))
    }
  }, [viewOnly])

  // Mouse events
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLVideoElement>) => {
    if (viewOnly) return
    e.preventDefault()
    const video = videoRef.current
    if (!video) return
    const rect = video.getBoundingClientRect()
    const scaleX = remoteSizeRef.current.width / rect.width
    const scaleY = remoteSizeRef.current.height / rect.height
    const x = Math.round((e.clientX - rect.left) * scaleX)
    const y = Math.round((e.clientY - rect.top) * scaleY)
    const buttonMap: Record<number, number> = { 0: 0, 1: 1, 2: 2 } // left, middle, right
    sendInput({ type: 'mousedown', x, y, button: buttonMap[e.button] ?? 0 })
  }, [viewOnly, sendInput])

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLVideoElement>) => {
    if (viewOnly) return
    e.preventDefault()
    const video = videoRef.current
    if (!video) return
    const rect = video.getBoundingClientRect()
    const scaleX = remoteSizeRef.current.width / rect.width
    const scaleY = remoteSizeRef.current.height / rect.height
    const x = Math.round((e.clientX - rect.left) * scaleX)
    const y = Math.round((e.clientY - rect.top) * scaleY)
    const buttonMap: Record<number, number> = { 0: 0, 1: 1, 2: 2 }
    sendInput({ type: 'mouseup', x, y, button: buttonMap[e.button] ?? 0 })
  }, [viewOnly, sendInput])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLVideoElement>) => {
    if (viewOnly) return
    const video = videoRef.current
    if (!video) return
    const rect = video.getBoundingClientRect()
    const scaleX = remoteSizeRef.current.width / rect.width
    const scaleY = remoteSizeRef.current.height / rect.height
    const x = Math.round((e.clientX - rect.left) * scaleX)
    const y = Math.round((e.clientY - rect.top) * scaleY)
    sendInput({ type: 'mousemove', x, y })
  }, [viewOnly, sendInput])

  const handleWheel = useCallback((e: React.WheelEvent<HTMLVideoElement>) => {
    if (viewOnly) return
    e.preventDefault()
    const video = videoRef.current
    if (!video) return
    const rect = video.getBoundingClientRect()
    const scaleX = remoteSizeRef.current.width / rect.width
    const scaleY = remoteSizeRef.current.height / rect.height
    const x = Math.round((e.clientX - rect.left) * scaleX)
    const y = Math.round((e.clientY - rect.top) * scaleY)
    const delta = Math.sign(e.deltaY) * 120
    sendInput({ type: 'wheel', x, y, delta })
  }, [viewOnly, sendInput])

  // Double-click
  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLVideoElement>) => {
    if (viewOnly) return
    const video = videoRef.current
    if (!video) return
    const rect = video.getBoundingClientRect()
    const scaleX = remoteSizeRef.current.width / rect.width
    const scaleY = remoteSizeRef.current.height / rect.height
    const x = Math.round((e.clientX - rect.left) * scaleX)
    const y = Math.round((e.clientY - rect.top) * scaleY)
    // Simulate double click: left down, left up, left down, left up
    sendInput({ type: 'mousedown', x, y, button: 0 })
    sendInput({ type: 'mouseup', x, y, button: 0 })
    sendInput({ type: 'mousedown', x, y, button: 0 })
    sendInput({ type: 'mouseup', x, y, button: 0 })
  }, [viewOnly, sendInput])

  // Keyboard events
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLVideoElement>) => {
    if (viewOnly) return
    e.preventDefault()
    e.stopPropagation()

    const vk = KEY_TO_VK[e.code] ?? e.keyCode
    let modifiers = 0
    if (e.shiftKey) modifiers |= 1
    if (e.ctrlKey) modifiers |= 2
    if (e.altKey) modifiers |= 4
    if (e.metaKey) modifiers |= 8

    sendInput({ type: 'keydown', vk, scan: 0, modifiers })
  }, [viewOnly, sendInput])

  const handleKeyUp = useCallback((e: React.KeyboardEvent<HTMLVideoElement>) => {
    if (viewOnly) return
    e.preventDefault()
    e.stopPropagation()

    const vk = KEY_TO_VK[e.code] ?? e.keyCode
    let modifiers = 0
    if (e.shiftKey) modifiers |= 1
    if (e.ctrlKey) modifiers |= 2
    if (e.altKey) modifiers |= 4
    if (e.metaKey) modifiers |= 8

    sendInput({ type: 'keyup', vk, scan: 0, modifiers })
  }, [viewOnly, sendInput])

  // Send SAS (Secure Attention Sequence) via DataChannel
  const sendSas = useCallback((action: string) => {
    if (dcRef.current?.readyState === 'open') {
      dcRef.current.send(JSON.stringify({ type: 'sas', action }))
    }
  }, [])

  // Clipboard sync
  const sendClipboardToAgent = useCallback((text: string) => {
    if (text) {
      sendInput({ type: 'clipboard', text })
    }
  }, [sendInput])

  // Quality change — send FPS setting to agent
  const changeQuality = useCallback((q: Quality) => {
    setQuality(q)
    sendInput({ type: 'settings', fps: QUALITY_FPS[q] })
  }, [sendInput])

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    const container = document.getElementById('remote-desktop-container')
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

  // Update stats from video stream
  useEffect(() => {
    if (!connected) return
    const interval = setInterval(async () => {
      const pc = pcRef.current
      if (!pc) return
      try {
        const stats = await pc.getStats()
        let fps = 0
        let resolution = ''
        stats.forEach((report) => {
          if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
            fps = report.framesPerSecond || 0
            if (report.frameWidth && report.frameHeight) {
              remoteSizeRef.current = { width: report.frameWidth, height: report.frameHeight }
              resolution = `${report.frameWidth}×${report.frameHeight}`
            }
          }
        })
        setStats(prev => ({ ...prev, fps: Math.round(fps), resolution: resolution || prev.resolution }))
      } catch { /* stats not available */ }
    }, 1000)
    return () => clearInterval(interval)
  }, [connected])

  // Cleanup on unmount + visibility change reconnect
  useEffect(() => {
    // On tab becoming visible again, try reconnecting if we were connected before
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && shouldReconnectRef.current && !manualDisconnectRef.current) {
        console.log('[RemoteDesktop] Tab visible, attempting reconnect')
        reconnectAttemptsRef.current = 0 // reset backoff on visibility change
        connect()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      shouldReconnectRef.current = false
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      cleanup()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- must only run on mount/unmount
  }, [])

  // Auto-connect
  useEffect(() => {
    if (agentId && token) connect()
  }, [agentId, token]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div id="remote-desktop-container" className="flex flex-col h-full bg-black">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-500 animate-pulse' : reconnecting ? 'bg-yellow-400 animate-pulse' : connecting ? 'bg-yellow-500' : 'bg-gray-500'}`} />
          <span className="text-sm text-gray-300">
            {connected ? 'Connected' : reconnecting ? `Reconnecting... (attempt ${reconnectAttempt}/10)` : connecting ? 'Connecting...' : 'Disconnected'}
          </span>
          {connected && stats.fps > 0 && (
            <span className="text-xs text-gray-400">{stats.fps} FPS</span>
          )}
          {stats.resolution && (
            <span className="text-xs text-gray-500">{stats.resolution}</span>
          )}
          <span className="text-xs text-violet-400">WebRTC</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Session selector */}
          {sessions.length > 1 && (
            <select
              value={selectedSession}
              onChange={(e) => {
                const newSession = parseInt(e.target.value)
                setSelectedSession(newSession)
                // Reconnect with new session target
                cleanup()
                setTimeout(() => {
                  // Re-connect will use the new selectedSession via the WS URL
                  connect()
                }, 500)
              }}
              className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded border border-gray-600"
              title="Select desktop session"
            >
              <option value={-1}>Console (Default)</option>
              {sessions.filter(s => !s.is_console).map(s => (
                <option key={s.session_id} value={s.session_id}>
                  {s.session_name} ({s.username || 'N/A'}) - {s.state}
                </option>
              ))}
            </select>
          )}
          {/* View Only toggle */}
          <button
            onClick={() => setViewOnly(!viewOnly)}
            className={`px-2 py-1 text-xs rounded ${viewOnly ? 'bg-yellow-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            title={viewOnly ? 'View only - no input sent' : 'Full control'}
          >
            {viewOnly ? <><IconEye size={14} className="inline -mt-0.5" /> View Only</> : <><IconMonitor size={14} className="inline -mt-0.5" /> Control</>}
          </button>

          {/* Clipboard toggle */}
          <button
            onClick={() => setShowClipboard(!showClipboard)}
            className={`px-2 py-1 text-xs rounded ${showClipboard ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            title="Toggle clipboard panel"
          >
            <IconClipboardList size={14} />
          </button>

          {/* Quality selector */}
          <select
            value={quality}
            onChange={(e) => changeQuality(e.target.value as Quality)}
            className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded border border-gray-600"
          >
            <option value="low">Low (15fps)</option>
            <option value="medium">Medium (24fps)</option>
            <option value="high">High (30fps)</option>
          </select>

          {/* SAS Actions */}
          <div className="flex items-center gap-1 border-l border-gray-600 pl-2">
            <button
              onClick={() => sendSas('lock')}
              className="px-2 py-1 text-xs rounded bg-orange-600 text-white hover:bg-orange-500"
              title="Lock remote screen"
            >
              <IconLock size={14} className="inline -mt-0.5" /> Lock
            </button>
            <button
              onClick={() => sendSas('sas')}
              className="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-500"
              title="Send Ctrl+Alt+Del"
            >
              <IconKeyboard size={14} className="inline -mt-0.5" /> Ctrl+Alt+Del
            </button>
            <button
              onClick={() => sendSas('signout')}
              className="px-2 py-1 text-xs rounded bg-gray-600 text-white hover:bg-gray-500"
              title="Sign out remote user"
            >
              <IconDoor size={14} className="inline -mt-0.5" /> Sign Out
            </button>
          </div>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
            title="Fullscreen"
          >
            {fullscreen ? <IconCompress size={14} /> : <IconExpand size={14} />}
          </button>

          {connected ? (
            <button onClick={disconnect} className="px-3 py-1 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700">
              Disconnect
            </button>
          ) : (
            <button onClick={connect} className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700" disabled={connecting}>
              {connecting ? 'Connecting...' : 'Connect'}
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

      {/* Clipboard panel */}
      {showClipboard && (
        <div className="flex-shrink-0 bg-gray-800 border-b border-gray-700 p-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-gray-400 font-medium">Shared Clipboard</span>
            <button
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText()
                  if (text) { setLocalClipboard(text); sendClipboardToAgent(text) }
                } catch { /* clipboard access denied */ }
              }}
              className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
              title="Paste from browser clipboard and send to agent"
            >
              Paste & Send
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs text-gray-500 mb-1">From Remote</div>
              <textarea
                value={remoteClipboard}
                readOnly
                className="w-full h-20 text-xs bg-gray-900 text-green-400 border border-gray-600 rounded p-1 font-mono resize-none"
                onClick={(e) => {
                  (e.target as HTMLTextAreaElement).select()
                  navigator.clipboard.writeText(remoteClipboard).catch(() => {})
                }}
                title="Click to copy to browser clipboard"
              />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">To Remote</div>
              <textarea
                value={localClipboard}
                onChange={(e) => setLocalClipboard(e.target.value)}
                className="w-full h-20 text-xs bg-gray-900 text-blue-400 border border-gray-600 rounded p-1 font-mono resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendClipboardToAgent(localClipboard)
                    setLocalClipboard('')
                  }
                }}
                placeholder="Type and press Enter to send..."
              />
            </div>
          </div>
        </div>
      )}

      {/* Video */}
      <div className="flex-1 flex items-center justify-center overflow-hidden relative" style={{ background: '#111' }}>
        {!connected && !connecting && !error && (
          <div className="text-gray-500 text-sm">Click Connect to start remote desktop...</div>
        )}
        {connecting && !connected && (
          <div className="text-yellow-400 text-sm animate-pulse">Establishing WebRTC connection...</div>
        )}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
          onWheel={handleWheel}
          onDoubleClick={handleDoubleClick}
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
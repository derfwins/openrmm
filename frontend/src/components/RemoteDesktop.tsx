import { useState, useEffect, useRef, useCallback } from 'react'
import type { Device } from '../types/device'
import { guacamoleService } from '../services/guacamoleService'
import type { GuacamoleSession } from '../services/guacamoleService'

interface RemoteDesktopProps {
  devices?: Device[]
}

type QualityLevel = 'low' | 'medium' | 'high'
type ConnectionState = 'idle' | 'connecting' | 'waiting_approval' | 'connected' | 'disconnected' | 'error'

const QUALITY_SETTINGS: Record<QualityLevel, { bitrate: number; fps: number; label: string }> = {
  low: { bitrate: 500, fps: 15, label: 'Low (Fast)' },
  medium: { bitrate: 1500, fps: 24, label: 'Medium' },
  high: { bitrate: 3000, fps: 30, label: 'High (Quality)' },
}

const RemoteDesktop = ({ devices: propDevices }: RemoteDesktopProps) => {
  const [devices, setDevices] = useState<Device[]>(propDevices || [])
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle')
  const [_session, setSession] = useState<GuacamoleSession | null>(null)
  const [quality, setQuality] = useState<QualityLevel>('high')
  const [activeMonitor, setActiveMonitor] = useState(0)
  const [monitorCount] = useState(1)
  const [showChat, setShowChat] = useState(false)
  const [chatMessages, setChatMessages] = useState<Array<{ from: string; text: string; time: string }>>([])
  const [chatInput, setChatInput] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [screenBlanked, setScreenBlanked] = useState(false)
  const [inputBlocked, setInputBlocked] = useState(false)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  const [sessionDuration, setSessionDuration] = useState(0)
  const [latency, setLatency] = useState(0)
  const [showKeyMenu, setShowKeyMenu] = useState(false)
  const [showFileTransfer, setShowFileTransfer] = useState(false)
  const [transferFiles, setTransferFiles] = useState<Array<{ name: string; size: number; progress: number }>>([])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const latencyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load devices
  useEffect(() => {
    if (propDevices && propDevices.length > 0) return
    // In production, fetch from API
    const mockDevices: Device[] = [
      {
        id: '1', name: 'DESKTOP-460RMO6', status: 'online', type: 'workstation',
        platform: 'windows', last_seen: new Date().toISOString(),
        cpu_usage: 45, memory_usage: 60, disk_usage: 75,
        ip: '192.168.1.100', site: 'Main Office', client: 'Internal',
      },
      {
        id: '2', name: 'fhowland-plex', status: 'online', type: 'server',
        platform: 'linux', last_seen: new Date().toISOString(),
        cpu_usage: 23, memory_usage: 45, disk_usage: 82,
        ip: '192.168.1.101', site: 'Home Lab', client: 'Internal',
      },
    ]
    setDevices(mockDevices.filter(d => d.status === 'online'))
  }, [propDevices])

  // Session duration timer
  useEffect(() => {
    if (connectionState === 'connected') {
      durationTimerRef.current = setInterval(() => {
        setSessionDuration(prev => prev + 1)
      }, 1000)
    } else {
      if (durationTimerRef.current) clearInterval(durationTimerRef.current)
    }
    return () => { if (durationTimerRef.current) clearInterval(durationTimerRef.current) }
  }, [connectionState])

  // Simulated latency
  useEffect(() => {
    if (connectionState === 'connected') {
      latencyTimerRef.current = setInterval(() => {
        setLatency(Math.floor(15 + Math.random() * 25))
      }, 3000)
    } else {
      if (latencyTimerRef.current) clearInterval(latencyTimerRef.current)
      setLatency(0)
    }
    return () => { if (latencyTimerRef.current) clearInterval(latencyTimerRef.current) }
  }, [connectionState])

  const connectToDevice = useCallback(async (device: Device) => {
    setSelectedDevice(device)
    setConnectionState('connecting')
    setSessionDuration(0)
    setReconnectAttempts(0)

    try {
      // Determine protocol based on platform
      const protocol = device.platform === 'windows' ? 'rdp' : device.platform === 'macos' ? 'vnc' : 'vnc'
      const port = protocol === 'rdp' ? 3389 : 5900

      // Create Guacamole connection
      const connection = await guacamoleService.createConnection({
        name: `openrmm-${device.name}`,
        protocol,
        hostname: device.ip || '127.0.0.1',
        port,
        'ignore-cert': true,
        'enable-drive': true,
        'enable-audio': true,
        'enable-printing': true,
      })

      // Start session
      const newSession = await guacamoleService.startConnection(connection.id)
      setSession(newSession)

      // Connect WebSocket
      const ws = new WebSocket(newSession.websocketUrl)
      ws.binaryType = 'arraybuffer'
      ws.onopen = () => {
        setConnectionState('connected')
        setReconnectAttempts(0)
      }
      ws.onclose = () => {
        setConnectionState('disconnected')
        // Auto-reconnect
        if (reconnectAttempts < 5) {
          setTimeout(() => {
            setReconnectAttempts(prev => prev + 1)
            connectToDevice(device)
          }, 3000 * (reconnectAttempts + 1))
        }
      }
      ws.onerror = () => setConnectionState('error')
      wsRef.current = ws

    } catch (err) {
      console.error('Connection failed:', err)
      // Simulate connection for demo
      setTimeout(() => setConnectionState('connected'), 1500)
    }
  }, [reconnectAttempts])

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setConnectionState('idle')
    setSession(null)
    setSelectedDevice(null)
    setIsRecording(false)
    setScreenBlanked(false)
    setInputBlocked(false)
    setShowChat(false)
    setShowFileTransfer(false)
  }, [])

  const sendKeyCombo = useCallback((combo: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'key-combo', combo }))
    }
    setShowKeyMenu(false)
  }, [])

  const takeScreenshot = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `screenshot-${selectedDevice?.name}-${Date.now()}.png`
    link.href = canvas.toDataURL()
    link.click()
  }, [selectedDevice])

  const sendChat = useCallback(() => {
    if (!chatInput.trim()) return
    setChatMessages(prev => [...prev, {
      from: 'You',
      text: chatInput,
      time: new Date().toLocaleTimeString(),
    }])
    setChatInput('')
  }, [chatInput])

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    setTransferFiles(files.map(f => ({ name: f.name, size: f.size, progress: 0 })))
    // Simulate transfer progress
    files.forEach((_file, i) => {
      let progress = 0
      const interval = setInterval(() => {
        progress += Math.random() * 20
        if (progress >= 100) {
          progress = 100
          clearInterval(interval)
        }
        setTransferFiles(prev => prev.map((tf, j) =>
          j === i ? { ...tf, progress: Math.min(progress, 100) } : tf
        ))
      }, 200)
    })
  }, [])

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  return (
    <div className="h-full flex flex-col bg-gray-900 text-white">
      {/* Top Toolbar */}
      <div className="bg-gray-800 px-4 py-2 flex items-center justify-between border-b border-gray-700 min-h-[48px]">
        <div className="flex items-center gap-3">
          {connectionState === 'connected' && (
            <span className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="font-medium">{selectedDevice?.name}</span>
              <span className="text-gray-400">·</span>
              <span className="text-gray-400 text-xs">{selectedDevice?.platform?.toUpperCase()}</span>
              <span className="text-gray-400">·</span>
              <span className="text-gray-400 text-xs">{formatDuration(sessionDuration)}</span>
            </span>
          )}
          {connectionState === 'connecting' && (
            <span className="text-yellow-400 text-sm animate-pulse">Connecting...</span>
          )}
          {connectionState === 'waiting_approval' && (
            <span className="text-orange-400 text-sm animate-pulse">⏳ Waiting for user approval...</span>
          )}
          {connectionState === 'disconnected' && reconnectAttempts > 0 && (
            <span className="text-red-400 text-sm">Disconnected · Reconnecting ({reconnectAttempts}/5)...</span>
          )}
          {connectionState === 'error' && (
            <span className="text-red-500 text-sm">Connection failed</span>
          )}
          {connectionState === 'idle' && (
            <span className="text-gray-400 text-sm">Select a device to connect</span>
          )}
        </div>

        {connectionState === 'connected' && (
          <div className="flex items-center gap-1.5">
            {/* Quality */}
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value as QualityLevel)}
              className="bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600"
            >
              {Object.entries(QUALITY_SETTINGS).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>

            {/* Multi-Monitor */}
            {monitorCount > 1 && (
              <select
                value={activeMonitor}
                onChange={(e) => setActiveMonitor(Number(e.target.value))}
                className="bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600"
              >
                {Array.from({ length: monitorCount }, (_, i) => (
                  <option key={i} value={i}>Monitor {i + 1}</option>
                ))}
              </select>
            )}

            {/* Keyboard Shortcuts */}
            <div className="relative">
              <button
                onClick={() => setShowKeyMenu(!showKeyMenu)}
                className="px-2 py-1 bg-gray-700 text-xs rounded hover:bg-gray-600 border border-gray-600"
              >
                ⌨️ Keys
              </button>
              {showKeyMenu && (
                <div className="absolute right-0 mt-1 w-52 bg-gray-700 rounded-lg shadow-xl border border-gray-600 z-50 py-1">
                  {[
                    { label: 'Ctrl+Alt+Del', combo: 'ctrl+alt+del' },
                    { label: 'Win+R (Run)', combo: 'win+r' },
                    { label: 'Alt+Tab', combo: 'alt+tab' },
                    { label: 'Task Manager', combo: 'ctrl+shift+esc' },
                    { label: 'Win+L (Lock)', combo: 'win+l' },
                    { label: 'Ctrl+C', combo: 'ctrl+c' },
                    { label: 'Ctrl+V', combo: 'ctrl+v' },
                  ].map(item => (
                    <button
                      key={item.combo}
                      onClick={() => sendKeyCombo(item.combo)}
                      className="block w-full text-left px-3 py-1.5 hover:bg-gray-600 text-xs"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Clipboard */}
            <button
              onClick={() => navigator.clipboard.readText().then(text => {
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                  wsRef.current.send(JSON.stringify({ type: 'clipboard', text }))
                }
              })}
              className="px-2 py-1 bg-gray-700 text-xs rounded hover:bg-gray-600 border border-gray-600"
              title="Sync Clipboard"
            >
              📋
            </button>

            {/* File Transfer */}
            <button
              onClick={() => setShowFileTransfer(!showFileTransfer)}
              className={`px-2 py-1 text-xs rounded border border-gray-600 ${showFileTransfer ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
            >
              📁
            </button>

            {/* Chat */}
            <button
              onClick={() => setShowChat(!showChat)}
              className={`px-2 py-1 text-xs rounded border border-gray-600 ${showChat ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
            >
              💬
            </button>

            {/* Screenshot */}
            <button
              onClick={takeScreenshot}
              className="px-2 py-1 bg-gray-700 text-xs rounded hover:bg-gray-600 border border-gray-600"
              title="Screenshot"
            >
              📸
            </button>

            {/* Screen Blank */}
            <button
              onClick={() => setScreenBlanked(!screenBlanked)}
              className={`px-2 py-1 text-xs rounded border border-gray-600 ${screenBlanked ? 'bg-yellow-600' : 'bg-gray-700 hover:bg-gray-600'}`}
              title={screenBlanked ? 'Unblank Screen' : 'Blank Remote Screen'}
            >
              🖥️
            </button>

            {/* Block Input */}
            <button
              onClick={() => setInputBlocked(!inputBlocked)}
              className={`px-2 py-1 text-xs rounded border border-gray-600 ${inputBlocked ? 'bg-red-600' : 'bg-gray-700 hover:bg-gray-600'}`}
              title={inputBlocked ? 'Unblock Input' : 'Block Remote Input'}
            >
              🚫
            </button>

            {/* Record */}
            <button
              onClick={() => setIsRecording(!isRecording)}
              className={`px-2 py-1 text-xs rounded border border-gray-600 ${isRecording ? 'bg-red-600 animate-pulse' : 'bg-gray-700 hover:bg-gray-600'}`}
            >
              🔴
            </button>

            {/* Fullscreen */}
            <button
              onClick={() => canvasRef.current?.requestFullscreen()}
              className="px-2 py-1 bg-gray-700 text-xs rounded hover:bg-gray-600 border border-gray-600"
            >
              ⛶
            </button>

            {/* Disconnect */}
            <button
              onClick={disconnect}
              className="px-3 py-1 bg-red-600 text-xs rounded hover:bg-red-700 ml-1"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>

      {/* Main Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Device Selector - show when idle */}
        {connectionState === 'idle' && (
          <div className="w-80 bg-gray-800 border-r border-gray-700 p-4 overflow-y-auto">
            <h3 className="font-semibold mb-3">🖥️ Remote Desktop</h3>
            <p className="text-gray-400 text-xs mb-4">Select an online device to start a remote session.</p>
            <div className="space-y-2">
              {devices.map(device => (
                <button
                  key={device.id}
                  onClick={() => connectToDevice(device)}
                  className="w-full text-left p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center text-sm">
                      {device.platform === 'windows' ? '🪟' : device.platform === 'macos' ? '🍎' : '🐧'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{device.name}</div>
                      <div className="text-gray-400 text-xs">{device.ip}</div>
                    </div>
                    <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Remote Desktop Canvas */}
        <div className="flex-1 relative bg-black flex items-center justify-center">
          {connectionState === 'connecting' && (
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-3" />
              <p className="text-white text-sm">Connecting to {selectedDevice?.name}...</p>
              <p className="text-gray-500 text-xs mt-1">Establishing secure connection</p>
            </div>
          )}

          {connectionState === 'waiting_approval' && (
            <div className="text-center">
              <div className="text-5xl mb-4">⏳</div>
              <p className="text-white text-lg">Waiting for user approval</p>
              <p className="text-gray-400 text-sm mt-2">The remote user needs to accept this session</p>
            </div>
          )}

          {connectionState === 'connected' && (
            <>
              <canvas
                ref={canvasRef}
                width={1920}
                height={1080}
                className="max-w-full max-h-full"
                style={{ cursor: inputBlocked ? 'not-allowed' : 'default', objectFit: 'contain' }}
              />
              {screenBlanked && (
                <div className="absolute inset-0 bg-black flex items-center justify-center pointer-events-none">
                  <span className="text-gray-600 text-lg">Screen Blanketed</span>
                </div>
              )}
              {/* Stats overlay */}
              <div className="absolute top-2 left-2 bg-black/75 text-xs px-2 py-1 rounded space-y-0.5">
                <div>Quality: {QUALITY_SETTINGS[quality].label}</div>
                <div>Latency: {latency}ms</div>
                <div>Resolution: 1920×1080</div>
                <div>Monitor: {activeMonitor + 1}/{monitorCount}</div>
              </div>
              {isRecording && (
                <div className="absolute top-2 right-2 bg-red-600 text-xs px-2 py-1 rounded animate-pulse flex items-center gap-1">
                  <span className="w-2 h-2 bg-white rounded-full" /> REC
                </div>
              )}
            </>
          )}

          {connectionState === 'error' && (
            <div className="text-center">
              <div className="text-5xl mb-4">❌</div>
              <p className="text-white text-lg">Connection Failed</p>
              <button onClick={disconnect} className="mt-4 px-4 py-2 bg-gray-700 rounded hover:bg-gray-600 text-sm">
                Go Back
              </button>
            </div>
          )}

          {connectionState === 'idle' && !devices.length && (
            <div className="text-center text-gray-500">
              <div className="text-5xl mb-4">🖥️</div>
              <p>Select a device to start remote session</p>
            </div>
          )}
        </div>

        {/* Chat Panel */}
        {showChat && connectionState === 'connected' && (
          <div className="w-72 bg-gray-800 border-l border-gray-700 flex flex-col">
            <div className="p-3 border-b border-gray-700 font-medium text-sm">💬 Chat with User</div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {chatMessages.length === 0 && (
                <p className="text-gray-500 text-xs text-center mt-4">No messages yet</p>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`text-xs ${msg.from === 'You' ? 'text-right' : 'text-left'}`}>
                  <span className="text-gray-500">{msg.from} · {msg.time}</span>
                  <div className={`mt-0.5 inline-block px-2 py-1 rounded ${msg.from === 'You' ? 'bg-blue-600' : 'bg-gray-700'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-2 border-t border-gray-700 flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                placeholder="Type a message..."
                className="flex-1 bg-gray-700 text-white text-xs rounded px-2 py-1.5 border border-gray-600 focus:border-blue-500 outline-none"
              />
              <button onClick={sendChat} className="px-2 py-1 bg-blue-600 text-xs rounded hover:bg-blue-700">Send</button>
            </div>
          </div>
        )}

        {/* File Transfer Overlay */}
        {showFileTransfer && connectionState === 'connected' && (
          <div className="absolute bottom-16 right-4 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
            <div className="p-3 border-b border-gray-700 flex justify-between items-center">
              <span className="text-sm font-medium">📁 File Transfer</span>
              <button onClick={() => setShowFileTransfer(false)} className="text-gray-400 hover:text-white text-xs">✕</button>
            </div>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              className="p-4 border-2 border-dashed border-gray-600 m-3 rounded text-center hover:border-blue-500 transition-colors cursor-pointer"
            >
              <p className="text-gray-400 text-xs">Drag & drop files here</p>
              <p className="text-gray-500 text-xs mt-1">or click to browse</p>
            </div>
            {transferFiles.length > 0 && (
              <div className="px-3 pb-3 space-y-2">
                {transferFiles.map((file, i) => (
                  <div key={i} className="text-xs">
                    <div className="flex justify-between text-gray-300">
                      <span className="truncate">{file.name}</span>
                      <span className="text-gray-500">{formatFileSize(file.size)}</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded h-1.5 mt-1">
                      <div
                        className="bg-blue-500 h-1.5 rounded transition-all"
                        style={{ width: `${file.progress}%` }}
                      />
                    </div>
                    <span className="text-gray-500">{Math.round(file.progress)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default RemoteDesktop
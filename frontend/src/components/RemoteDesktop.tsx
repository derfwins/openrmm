import { useState, useEffect, useRef } from 'react'
import type { Device } from '../types/device'

interface RemoteSession {
  id: string
  deviceId: string
  deviceName: string
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  startTime: string
  endTime?: string
  quality: 'low' | 'medium' | 'high'
  resolution: string
}

const RemoteDesktop = () => {
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const [session, setSession] = useState<RemoteSession | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [showDeviceSelector, setShowDeviceSelector] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Load online devices
  useEffect(() => {
    // Mock devices - in real app, fetch from API
    const mockDevices: Device[] = [
      {
        id: '1',
        name: 'DESKTOP-460RMO6',
        status: 'online',
        type: 'workstation',
        platform: 'windows',
        last_seen: new Date().toISOString(),
        cpu_usage: 45,
        memory_usage: 60,
        disk_usage: 75,
        ip: '192.168.1.100',
        site: 'Main Office',
        client: 'Internal',
      },
      {
        id: '2',
        name: 'fhowland-plex',
        status: 'online',
        type: 'server',
        platform: 'linux',
        last_seen: new Date().toISOString(),
        cpu_usage: 23,
        memory_usage: 45,
        disk_usage: 82,
        ip: '192.168.1.101',
        site: 'Home Lab',
        client: 'Internal',
      },
    ]
    setDevices(mockDevices.filter(d => d.status === 'online'))
  }, [])

  const connectToDevice = async (device: Device) => {
    setSelectedDevice(device)
    setIsConnecting(true)
    setShowDeviceSelector(false)

    // Create new session
    const newSession: RemoteSession = {
      id: Date.now().toString(),
      deviceId: device.id,
      deviceName: device.name,
      status: 'connecting',
      startTime: new Date().toISOString(),
      quality: 'high',
      resolution: '1920x1080',
    }
    setSession(newSession)

    // Simulate connection delay
    setTimeout(() => {
      setSession(prev => prev ? { ...prev, status: 'connected' } : null)
      setIsConnecting(false)
    }, 2000)

    // TODO: Integrate with MeshCentral or RustDesk API
    // - Initialize WebRTC connection
    // - Request agent to start remote session
    // - Display stream in canvas
  }

  const disconnect = () => {
    setSession(prev => prev ? { ...prev, status: 'disconnected', endTime: new Date().toISOString() } : null)
    setTimeout(() => {
      setSession(null)
      setSelectedDevice(null)
      setShowDeviceSelector(true)
    }, 500)
  }

  const sendKeyCombo = (keys: string[]) => {
    console.log('Sending key combo:', keys)
    // TODO: Send key combination to remote session
  }

  const changeQuality = (quality: 'low' | 'medium' | 'high') => {
    setSession(prev => prev ? { ...prev, quality } : null)
    console.log('Changing quality to:', quality)
  }

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 px-4 py-3 flex justify-between items-center border-b border-gray-700">
        <div className="flex items-center gap-4">
          <h2 className="text-white font-semibold">
            {session?.status === 'connected' ? `Connected to ${selectedDevice?.name}` : 'Remote Desktop'}
          </h2>
          {session?.status === 'connected' && (
            <span className="px-2 py-1 bg-green-500 text-white text-xs rounded">
              ● Live
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {session?.status === 'connected' && (
            <>
              {/* Quality Selector */}
              <select
                value={session.quality}
                onChange={(e) => changeQuality(e.target.value as any)}
                className="bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600"
              >
                <option value="low">Low (Fast)</option>
                <option value="medium">Medium</option>
                <option value="high">High (Quality)</option>
              </select>

              {/* Keyboard Shortcuts */}
              <div className="relative group">
                <button className="px-3 py-1 bg-gray-700 text-white text-sm rounded hover:bg-gray-600">
                  ⌨️ Keys
                </button>
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg hidden group-hover:block z-50">
                  <button
                    onClick={() => sendKeyCombo(['ctrl', 'alt', 'del'])}
                    className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm"
                  >
                    Ctrl+Alt+Del
                  </button>
                  <button
                    onClick={() => sendKeyCombo(['win', 'r'])}
                    className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm"
                  >
                    Win+R (Run)
                  </button>
                  <button
                    onClick={() => sendKeyCombo(['alt', 'tab'])}
                    className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm"
                  >
                    Alt+Tab
                  </button>
                  <button
                    onClick={() => sendKeyCombo(['ctrl', 'shift', 'esc'])}
                    className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm"
                  >
                    Task Manager
                  </button>
                </div>
              </div>

              {/* Clipboard Sync */}
              <button
                onClick={() => alert('Clipboard synced')}
                className="px-3 py-1 bg-gray-700 text-white text-sm rounded hover:bg-gray-600"
                title="Sync Clipboard"
              >
                📋
              </button>

              {/* Fullscreen */}
              <button
                onClick={() => canvasRef.current?.requestFullscreen()}
                className="px-3 py-1 bg-gray-700 text-white text-sm rounded hover:bg-gray-600"
              >
                ⛶
              </button>

              {/* Disconnect */}
              <button
                onClick={disconnect}
                className="px-4 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Device Selector Sidebar */}
        {showDeviceSelector && (
          <div className="w-80 bg-gray-800 border-r border-gray-700 p-4">
            <h3 className="text-white font-medium mb-4">Select Device</h3>
            
            <div className="space-y-2">
              {devices.length === 0 ? (
                <p className="text-gray-400 text-sm">No online devices found</p>
              ) : (
                devices.map((device) => (
                  <button
                    key={device.id}
                    onClick={() => connectToDevice(device)}
                    className="w-full text-left p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center text-white">
                        {device.platform === 'windows' ? '🪟' : device.platform === 'macos' ? '🍎' : '🐧'}
                      </div>
                      <div className="flex-1">
                        <div className="text-white font-medium">{device.name}</div>
                        <div className="text-gray-400 text-sm">{device.ip}</div>
                      </div>
                      <div className="w-2 h-2 bg-green-500 rounded-full" title="Online" />
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="mt-6 p-4 bg-gray-700 rounded-lg">
              <h4 className="text-white font-medium mb-2">Connection Info</h4>
              <p className="text-gray-400 text-sm">
                Remote desktop uses secure WebRTC connections. 
                For best performance, ensure both devices are on the same network or have good internet connectivity.
              </p>
            </div>
          </div>
        )}

        {/* Remote Desktop Canvas */}
        <div className="flex-1 relative bg-black flex items-center justify-center">
          {isConnecting && (
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4" />
              <p className="text-white text-lg">Connecting to {selectedDevice?.name}...</p>
              <p className="text-gray-400 text-sm mt-2">Establishing secure connection</p>
            </div>
          )}

          {session?.status === 'connected' && (
            <>
              <canvas
                ref={canvasRef}
                width={1920}
                height={1080}
                className="max-w-full max-h-full cursor-none"
                style={{ objectFit: 'contain' }}
              />
              
              {/* Connection Stats Overlay */}
              <div className="absolute top-4 left-4 bg-black bg-opacity-75 text-white px-3 py-2 rounded text-xs">
                <div>Quality: {session.quality}</div>
                <div>Resolution: {session.resolution}</div>
                <div>Latency: ~20ms</div>
              </div>
            </>
          )}

          {!session && !isConnecting && (
            <div className="text-center text-gray-400">
              <div className="text-6xl mb-4">🖥️</div>
              <p className="text-xl">Select a device to start remote session</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Toolbar */}
      {session?.status === 'connected' && (
        <div className="bg-gray-800 px-4 py-2 border-t border-gray-700 flex justify-between items-center">
          <div className="text-gray-400 text-sm">
            Connected for {Math.floor((Date.now() - new Date(session.startTime).getTime()) / 1000 / 60)} minutes
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => alert('File transfer dialog would open')}
              className="px-3 py-1 bg-gray-700 text-white text-sm rounded hover:bg-gray-600"
            >
              📁 Files
            </button>
            <button
              onClick={() => alert('Chat with user')}
              className="px-3 py-1 bg-gray-700 text-white text-sm rounded hover:bg-gray-600"
            >
              💬 Chat
            </button>
            <button
              onClick={() => alert('Session recording started')}
              className="px-3 py-1 bg-gray-700 text-white text-sm rounded hover:bg-gray-600"
            >
              🔴 Record
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default RemoteDesktop

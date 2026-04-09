import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Device } from '../types/device'
import apiService from '../services/apiService'

const DeviceDetail = () => {
  const { id } = useParams<{ id: string }>()
  const [device, setDevice] = useState<Device | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'hardware' | 'software' | 'logs'>('overview')

  useEffect(() => {
    if (id) {
      loadDevice(id)
    }
  }, [id])

  const loadDevice = async (deviceId: string) => {
    try {
      const data = await apiService.getDevice(deviceId)
      setDevice(data)
    } catch (error) {
      console.error('Failed to load device:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!device) {
    return (
      <div className="text-center text-gray-500 py-12">
        Device not found
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-md">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-3 h-3 rounded-full ${
              device.status === 'online' ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <h1 className="text-2xl font-bold text-gray-900">{device.name}</h1>
            <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-sm">
              {device.platform}
            </span>
          </div>
          
          <div className="flex gap-2">
            <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              Remote Control
            </button>
            <button className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
              Run Script
            </button>
            <button className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
              Send Command
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 border-b border-gray-200">
          <div className="flex gap-6">
            {['overview', 'hardware', 'software', 'logs'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`py-4 text-sm font-medium border-b-2 ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">System Information</h3>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-600">IP Address</span>
                    <span className="font-medium">{device.ip}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-600">Last Seen</span>
                    <span className="font-medium">{new Date(device.last_seen).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-600">Site</span>
                    <span className="font-medium">{device.site}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-600">Client</span>
                    <span className="font-medium">{device.client}</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4">Resource Usage</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-gray-600">CPU</span>
                      <span className="text-sm font-medium">{device.cpu_usage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${device.cpu_usage}%` }}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-gray-600">Memory</span>
                      <span className="text-sm font-medium">{device.memory_usage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-purple-600 h-2 rounded-full"
                        style={{ width: `${device.memory_usage}%` }}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-gray-600">Disk</span>
                      <span className="text-sm font-medium">{device.disk_usage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${device.disk_usage > 90 ? 'bg-red-600' : 'bg-green-600'}`}
                        style={{ width: `${device.disk_usage}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'hardware' && (
            <div className="text-gray-500">
              Hardware information will be displayed here...
            </div>
          )}

          {activeTab === 'software' && (
            <div className="text-gray-500">
              Installed software list will be displayed here...
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="text-gray-500">
              System logs will be displayed here...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default DeviceDetail

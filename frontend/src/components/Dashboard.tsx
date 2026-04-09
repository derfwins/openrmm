import { useState, useEffect } from 'react'
import { Device, DeviceStatus } from '../types/device'
import DeviceCard from './DeviceCard'
import StatCard from './StatCard'
import Sidebar from './Sidebar'
import Header from './Header'

const Dashboard = () => {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'device' | 'workstation' | 'server'>('device')

  // Mock data for now - will connect to Tactical RMM API
  useEffect(() => {
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
        status: 'offline',
        type: 'server',
        platform: 'linux',
        last_seen: new Date(Date.now() - 86400000).toISOString(),
        cpu_usage: 0,
        memory_usage: 0,
        disk_usage: 0,
        ip: '192.168.1.101',
        site: 'Home Lab',
        client: 'Internal',
      },
      {
        id: '3',
        name: 'Ayla PC',
        status: 'online',
        type: 'workstation',
        platform: 'windows',
        last_seen: new Date().toISOString(),
        cpu_usage: 23,
        memory_usage: 45,
        disk_usage: 82,
        ip: '192.168.1.102',
        site: 'Main Office',
        client: 'Internal',
      },
    ]

    setTimeout(() => {
      setDevices(mockDevices)
      setLoading(false)
    }, 1000)
  }, [])

  const onlineCount = devices.filter(d => d.status === 'online').length
  const offlineCount = devices.filter(d => d.status === 'offline').length
  const totalCount = devices.length

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Dashboard" />
        
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-6">
          <{/* Stats Cards */} />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <StatCard 
              title="Total Devices" 
              value={totalCount} 
              icon="computer" 
              color="blue"
            />
            <StatCard 
              title="Online" 
              value={onlineCount} 
              icon="online" 
              color="green"
            />
            <StatCard 
              title="Offline" 
              value={offlineCount} 
              icon="offline" 
              color="red"
            />
            <StatCard 
              title="Critical Alerts" 
              value={0} 
              icon="alert" 
              color="orange"
            />
          </div>

          <{/* Filters */} />
          <div className="flex gap-2 mb-4">
            {['device', 'workstation', 'server'].map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type as any)}
                className={`px-4 py-2 rounded-lg font-medium ${
                  filter === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}s
              </button>
            ))}
          </div>

          <{/* Device Grid */} />
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800">Devices</h2>
            </div>

            <div className="p-6">
              {loading ? (
                <div className="flex justify-center items-center h-64">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
              ) : devices.length === 0 ? (
                <div className="text-center text-gray-500 py-12">
                  No devices found. Install agents to get started.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {devices.map((device) => (
                    <DeviceCard key={device.id} device={device} />
                  ))}
                </div>
              )}
            </div>
          </div>

        </main>
      </div>
    </div>
  )
}

export default Dashboard

import { useState } from 'react'
import DeviceCard from './DeviceCard'
import StatCard from './StatCard'
import Sidebar from './Sidebar'
import Header from './Header'
import { useDevices } from '../hooks/useDevices'

const Dashboard = () => {
  const [filter, setFilter] = useState<'device' | 'workstation' | 'server'>('device')
  const { devices, loading, error, isConnected, onlineCount, offlineCount, refreshDevices } = useDevices()

  const totalCount = devices.length

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Dashboard" />
        
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-6">
          {/* Connection Status */}
          {!isConnected && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
              <span className="text-yellow-600">⚠️</span>
              <span className="text-yellow-800">Real-time updates disconnected. Reconnecting...</span>
            </div>
          )}

          {/* Stats Cards */}
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

          {/* Refresh Button */}
          <div className="flex justify-between items-center mb-4">
            <div className="flex gap-2">
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
            
            <button 
              onClick={refreshDevices}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
            >
              🔄 Refresh
            </button>
          </div>

          {/* Device Grid */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800">Devices</h2>
            </div>

            <div className="p-6">
              {loading ? (
                <div className="flex justify-center items-center h-64">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
              ) : error ? (
                <div className="text-center text-red-500 py-12">
                  {error}
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

import type { Device } from '../types/device'

interface DeviceCardProps {
  device: Device
}

const DeviceCard = ({ device }: DeviceCardProps) => {
  const statusColors = {
    online: 'bg-green-100 text-green-800 border-green-200',
    offline: 'bg-red-100 text-red-800 border-red-200',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    error: 'bg-red-100 text-red-800 border-red-200',
  }

  const platformIcons = {
    windows: '💻',
    macos: '🍎',
    linux: '🐧',
  }

  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow border border-gray-200 p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{platformIcons[device.platform]}</span>
          <div>
            <h3 className="font-semibold text-gray-900">{device.name}</h3>
            <p className="text-sm text-gray-500">{device.ip}</p>
          </div>
        </div>

        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${statusColors[device.status]}`}>
          {device.status}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">CPU</span>
          <div className="flex items-center gap-2">
            <div className="w-20 h-2 bg-gray-200 rounded-full">
              <div
                className="h-2 bg-blue-500 rounded-full transition-all"
                style={{ width: `${device.cpu_usage}%` }}
              />
            </div>
            <span className="text-gray-700 font-mono w-10">{device.cpu_usage}%</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Memory</span>
          <div className="flex items-center gap-2">
            <div className="w-20 h-2 bg-gray-200 rounded-full">
              <div
                className="h-2 bg-purple-500 rounded-full transition-all"
                style={{ width: `${device.memory_usage}%` }}
              />
            </div>
            <span className="text-gray-700 font-mono w-10">{device.memory_usage}%</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Disk</span>
          <div className="flex items-center gap-2">
            <div className="w-20 h-2 bg-gray-200 rounded-full">
              <div
                className={`h-2 rounded-full transition-all ${
                  device.disk_usage > 90 ? 'bg-red-500' : 'bg-green-500'
                }`}
                style={{ width: `${device.disk_usage}%` }}
              />
            </div>
            <span className="text-gray-700 font-mono w-10">{device.disk_usage}%</span>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center">
        <span className="text-xs text-gray-500">
          Site: {device.site}
        </span>
        <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
          Manage →
        </button>
      </div>
    </div>
  )
}

export default DeviceCard

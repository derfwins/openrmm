import { useState } from 'react'

const Reports = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'devices' | 'patches' | 'activity'>('overview')

  const reportTypes = [
    { id: 'device_inventory', name: 'Device Inventory', description: 'Complete list of all managed devices', icon: '💻' },
    { id: 'patch_status', name: 'Patch Status', description: 'Update compliance across all devices', icon: '🔧' },
    { id: 'alert_summary', name: 'Alert Summary', description: 'Critical and warning alerts by device', icon: '🔔' },
    { id: 'software_inventory', name: 'Software Inventory', description: 'Installed applications and versions', icon: '📦' },
    { id: 'agent_health', name: 'Agent Health', description: 'Agent connectivity and status', icon: '❤️' },
    { id: 'audit_log', name: 'Audit Log', description: 'User actions and system events', icon: '📋' },
  ]

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Reports</h2>
          <p className="text-gray-600 mt-1">Generate and download system reports</p>
        </div>

        {/* Report Grid */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reportTypes.map((report) => (
            <div
              key={report.id}
              className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer"
            >
              <div className="text-4xl mb-4">{report.icon}</div>
              <h3 className="text-lg font-semibold text-gray-900">{report.name}</h3>
              <p className="text-gray-600 mt-2">{report.description}</p>
              <div className="mt-4 flex gap-2">
                <button className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                  Generate
                </button>
                <button className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
                  ⬇️
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Reports

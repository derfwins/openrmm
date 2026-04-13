const Reports = () => {
  const reportTypes = [
    { id: 'device_inventory', name: 'Device Inventory', description: 'Complete list of all managed devices', icon: '💻' },
    { id: 'patch_status', name: 'Patch Status', description: 'Update compliance across all devices', icon: '🔧' },
    { id: 'alert_summary', name: 'Alert Summary', description: 'Critical and warning alerts by device', icon: '🔔' },
    { id: 'software_inventory', name: 'Software Inventory', description: 'Installed applications and versions', icon: '📦' },
    { id: 'agent_health', name: 'Agent Health', description: 'Agent connectivity and status', icon: '❤️' },
    { id: 'audit_log', name: 'Audit Log', description: 'User actions and system events', icon: '📋' },
  ]

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Generate and download system reports</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {reportTypes.map(report => (
          <div
            key={report.id}
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer group"
          >
            <div className="text-3xl mb-3">{report.icon}</div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{report.name}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{report.description}</p>
            <div className="mt-4 flex gap-2">
              <button className="flex-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                Generate
              </button>
              <button className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                ⬇️
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Reports
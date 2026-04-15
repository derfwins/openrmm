
const SoftwareManager = () => {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Software Inventory</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage third-party applications across devices</p>
        </div>
        <button className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          🔍 Scan Inventory
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
        <div className="text-4xl mb-3">📦</div>
        <p className="text-sm text-gray-500 dark:text-gray-400">Software inventory will populate when agents report installed software</p>
      </div>
    </div>
  )
}

export default SoftwareManager
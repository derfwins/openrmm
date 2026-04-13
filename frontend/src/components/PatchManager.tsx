import { useState, useEffect } from 'react'
import apiService from '../services/apiService'

const PatchManager = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'patches' | 'policies'>('overview')
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ critical: 0, important: 0, moderate: 0, low: 0 })

  useEffect(() => {
    // Try loading real patch data, fall back to empty
    setLoading(false)
  }, [])

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Patch Management</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage system updates across all devices</p>
        </div>
        <button className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          🔍 Scan for Updates
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        {(['overview', 'patches', 'policies'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <PatchStatCard label="Critical" count={stats.critical} color="red" icon="🔴" />
          <PatchStatCard label="Important" count={stats.important} color="orange" icon="🟠" />
          <PatchStatCard label="Moderate" count={stats.moderate} color="yellow" icon="🟡" />
          <PatchStatCard label="Low" count={stats.low} color="blue" icon="🔵" />
        </div>
      )}

      {/* Patches */}
      {activeTab === 'patches' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
          <div className="text-4xl mb-3">🔧</div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Patch data will appear when agents report update status</p>
        </div>
      )}

      {/* Policies */}
      {activeTab === 'policies' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Create patch policies to automate update approval and scheduling</p>
          <button className="mt-4 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            + Create Policy
          </button>
        </div>
      )}
    </div>
  )
}

const PatchStatCard = ({ label, count, color, icon }: { label: string; count: number; color: string; icon: string }) => {
  const bgMap: Record<string, string> = {
    red: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    orange: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
  }
  const textMap: Record<string, string> = {
    red: 'text-red-600 dark:text-red-400',
    orange: 'text-orange-600 dark:text-orange-400',
    yellow: 'text-yellow-600 dark:text-yellow-400',
    blue: 'text-blue-600 dark:text-blue-400',
  }

  return (
    <div className={`rounded-xl border p-5 ${bgMap[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-3xl font-bold ${textMap[color]}`}>{count}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{label}</p>
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  )
}

export default PatchManager
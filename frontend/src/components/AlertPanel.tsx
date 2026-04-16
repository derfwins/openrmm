import { useState, useEffect } from 'react'
import apiService from '../services/apiService'

const AlertPanel = () => {
  const [alerts, setAlerts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all')

  useEffect(() => { loadAlerts() }, [])

  const loadAlerts = async () => {
    try {
      setLoading(true)
      const data = await apiService.getAlerts()
      setAlerts(Array.isArray(data) ? data : data.results || [])
    } catch {
      // Alerts endpoint may not return GET — show empty state
      setAlerts([])
    } finally {
      setLoading(false)
    }
  }

  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.severity === filter)

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Alerts</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{alerts.length} total alerts</p>
        </div>
        <button onClick={loadAlerts} className="px-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
          ↻ Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['all', 'critical', 'warning', 'info'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)} {f !== 'all' ? `(${alerts.filter(a => a.severity === f).length})` : `(${alerts.length})`}
          </button>
        ))}
      </div>

      {/* Alert list */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent mx-auto"></div>
          </div>
        ) : filtered.length === 0 && alerts.length === 0 ? (
          <div className="flex items-center justify-center py-16 animate-[fadeIn_0.5s_ease-out]">
            <div className="w-64 rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-xl p-8 space-y-3 text-center dark:bg-gray-900/50">
              <div className="text-5xl text-emerald-400">✅</div>
              <h2 className="text-lg font-semibold text-white">All clear!</h2>
              <p className="text-sm text-gray-400">No active alerts. Everything looks good.</p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-4xl mb-3">🔔</div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No alerts match this filter
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {filtered.map((alert, i) => (
              <div key={alert.id || i} className="px-5 py-4 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                <span className="text-lg mt-0.5">
                  {alert.severity === 'critical' ? '🔴' : alert.severity === 'warning' ? '🟡' : '🔵'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                      alert.severity === 'critical' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      : alert.severity === 'warning' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                    }`}>
                      {alert.severity?.toUpperCase() || 'INFO'}
                    </span>
                    {alert.acknowledged && <span className="text-xs text-gray-400">Acknowledged</span>}
                  </div>
                  <p className="text-sm text-gray-900 dark:text-white mt-1">{alert.message || alert.alert_msg || 'Alert'}</p>
                  {alert.timestamp && (
                    <p className="text-xs text-gray-400 mt-1">{new Date(alert.timestamp).toLocaleString()}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default AlertPanel
import { useState, useEffect } from 'react'
import type { Alert } from '../types/alert'

interface AlertPanelProps {
  deviceId?: string
}

const AlertPanel = ({ deviceId }: AlertPanelProps) => {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all')

  useEffect(() => {
    loadAlerts()
  }, [deviceId])

  const loadAlerts = async () => {
    try {
      setLoading(true)
      // TODO: Connect to real API
      // const data = await apiService.getAlerts(deviceId)
      // Mock data for now
      const mockAlerts: Alert[] = [
        {
          id: '1',
          severity: 'critical',
          message: 'Disk space below 10%',
          deviceId: '1',
          timestamp: new Date().toISOString(),
          acknowledged: false,
        },
        {
          id: '2',
          severity: 'warning',
          message: 'High CPU usage detected',
          deviceId: '1',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          acknowledged: false,
        },
        {
          id: '3',
          severity: 'info',
          message: 'System update available',
          deviceId: '2',
          timestamp: new Date(Date.now() - 7200000).toISOString(),
          acknowledged: true,
        },
      ]
      setAlerts(mockAlerts)
    } catch (error) {
      console.error('Failed to load alerts:', error)
    } finally {
      setLoading(false)
    }
  }

  const acknowledgeAlert = async (alertId: string) => {
    try {
      // await apiService.acknowledgeAlert(alertId)
      setAlerts(prev =>
        prev.map(alert =>
          alert.id === alertId ? { ...alert, acknowledged: true } : alert
        )
      )
    } catch (error) {
      console.error('Failed to acknowledge alert:', error)
    }
  }

  const filteredAlerts = alerts.filter(alert => {
    if (filter === 'all') return true
    return alert.severity === filter
  })

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200'
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'info': return 'bg-blue-100 text-blue-800 border-blue-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return '🔴'
      case 'warning': return '🟡'
      case 'info': return '🔵'
      default: return '⚪'
    }
  }

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-800">Alerts</h3>
        <div className="flex gap-2">
          {['all', 'critical', 'warning', 'info'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as any)}
              className={`px-3 py-1 rounded text-sm ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="divide-y divide-gray-200">
        {filteredAlerts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No alerts to display
          </div>
        ) : (
          filteredAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-4 flex items-start gap-3 ${
                alert.acknowledged ? 'opacity-50' : ''
              }`}
            >
              <span className="text-lg">{getSeverityIcon(alert.severity)}</span>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <div>
                    <span
                      className={`inline-block px-2 py-1 text-xs font-medium rounded border ${getSeverityColor(
                        alert.severity
                      )}`}
                    >
                      {alert.severity.toUpperCase()}
                    </span>
                    <p className="mt-1 text-gray-900">{alert.message}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(alert.timestamp).toLocaleString()}
                    </p>
                  </div>
                  {!alert.acknowledged && (
                    <button
                      onClick={() => acknowledgeAlert(alert.id)}
                      className="px-3 py-1 text-sm bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                    >
                      Acknowledge
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default AlertPanel

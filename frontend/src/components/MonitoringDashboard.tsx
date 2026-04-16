import { useState, useEffect, useCallback } from 'react'
import { getMonitoringDashboard } from '../services/monitoringService'
import type { MonitoringDashboard, SensorStatus } from '../types/monitoring'
import { STATUS_COLORS } from '../types/monitoring'
import AddSensorModal from './AddSensorModal'

export default function MonitoringDashboard() {
  const [dash, setDash] = useState<MonitoringDashboard | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = await getMonitoringDashboard()
      setDash(data)
    } catch (e) { console.error('Monitoring dashboard load error:', e) }
    setLoading(false)
  }, [])

  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv) }, [load])

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400 animate-pulse">Loading monitoring data...</div>
  if (!dash) return <div className="text-gray-400 text-center py-12">No monitoring data available</div>

  const tiles: Array<{ label: string; count: number; status: SensorStatus; gradient: string }> = [
    { label: 'OK', count: dash.sensors_ok, status: 'ok', gradient: 'from-emerald-500/10 to-emerald-600/5' },
    { label: 'Warning', count: dash.sensors_warning, status: 'warning', gradient: 'from-amber-500/10 to-amber-600/5' },
    { label: 'Critical', count: dash.sensors_critical, status: 'critical', gradient: 'from-red-500/10 to-red-600/5' },
    { label: 'Unknown', count: dash.sensors_unknown, status: 'unknown', gradient: 'from-gray-500/10 to-gray-600/5' },
    { label: 'Down', count: dash.sensors_down, status: 'down', gradient: 'from-red-900/10 to-red-950/5' },
  ]

  const okPercent = dash.total_sensors > 0 ? Math.round((dash.sensors_ok / dash.total_sensors) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Monitoring</h1>
          <p className="text-sm text-gray-500 mt-1">{dash.total_sensors} sensors across {dash.total_probes} probes ({dash.probes_online} online)</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-300">
            Uptime <span className="text-emerald-400 font-medium">{okPercent}%</span>
          </div>
          <AddSensorModal onCreated={load} />
        </div>
      </div>

      {/* Status Tiles */}
      <div className="grid grid-cols-5 gap-4">
        {tiles.map(t => (
          <div
            key={t.label}
            className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${t.gradient} border border-white/[0.06] p-5 group hover:border-white/20 transition-all duration-300`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-400">{t.label}</span>
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: STATUS_COLORS[t.status], boxShadow: t.count > 0 ? `0 0 8px ${STATUS_COLORS[t.status]}80` : 'none' }}
              />
            </div>
            <div className="text-4xl font-bold text-white tabular-nums">{t.count}</div>
            {t.count > 0 && t.status !== 'ok' && (
              <div className="absolute -right-1 -top-1 w-16 h-16 rounded-full opacity-[0.07]"
                style={{ backgroundColor: STATUS_COLORS[t.status] }} />
            )}
          </div>
        ))}
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-3 gap-4">
        {/* Top Issues */}
        <div className="col-span-2 rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 backdrop-blur-xl">
          <h2 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            Top Issues
          </h2>
          {dash.top_issues.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="text-2xl mb-2">&#10003;</div>
              All systems operational
            </div>
          ) : (
            <div className="space-y-2">
              {dash.top_issues.map((issue, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] transition-colors">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: STATUS_COLORS[issue.status as SensorStatus] }}
                  />
                  <span className="text-sm text-white font-medium flex-1 truncate">{issue.display_name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: STATUS_COLORS[issue.status as SensorStatus] + '20',
                      color: STATUS_COLORS[issue.status as SensorStatus],
                    }}
                  >
                    {issue.status}
                  </span>
                  <span className="text-xs text-gray-500 tabular-nums">{issue.last_value_text || '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Stats */}
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 backdrop-blur-xl space-y-4">
          <h2 className="text-sm font-medium text-gray-300 mb-2">Quick Stats</h2>

          <div className="space-y-3">
            <div className="flex items-center justify-between px-2">
              <span className="text-xs text-gray-500">Total Sensors</span>
              <span className="text-sm text-white font-medium tabular-nums">{dash.total_sensors}</span>
            </div>
            <div className="flex items-center justify-between px-2">
              <span className="text-xs text-gray-500">Probes Online</span>
              <span className="text-sm text-white font-medium tabular-nums">{dash.probes_online} / {dash.total_probes}</span>
            </div>
            <div className="flex items-center justify-between px-2">
              <span className="text-xs text-gray-500">Availability</span>
              <span className="text-sm font-medium tabular-nums" style={{ color: okPercent >= 99 ? '#10B981' : okPercent >= 95 ? '#F59E0B' : '#EF4444' }}>{okPercent}%</span>
            </div>

            {/* Health bar */}
            <div className="mt-4">
              <div className="text-xs text-gray-500 mb-1.5">Health Distribution</div>
              <div className="h-2 rounded-full bg-gray-800 overflow-hidden flex">
                {dash.total_sensors > 0 && <>
                  <div className="bg-emerald-500 transition-all" style={{ width: `${(dash.sensors_ok / dash.total_sensors) * 100}%` }} />
                  <div className="bg-amber-500 transition-all" style={{ width: `${(dash.sensors_warning / dash.total_sensors) * 100}%` }} />
                  <div className="bg-red-500 transition-all" style={{ width: `${(dash.sensors_critical / dash.total_sensors) * 100}%` }} />
                  <div className="bg-gray-600 transition-all" style={{ width: `${(dash.sensors_unknown / dash.total_sensors) * 100}%` }} />
                  <div className="bg-red-900 transition-all" style={{ width: `${(dash.sensors_down / dash.total_sensors) * 100}%` }} />
                </>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
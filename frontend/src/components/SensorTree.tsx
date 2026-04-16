import { useState, useEffect, useCallback } from 'react'
import { getSensors, pauseSensor, resumeSensor, deleteSensor } from '../services/monitoringService'
import type { MonitoringSensor, SensorType, SensorStatus } from '../types/monitoring'
import { SENSOR_TYPE_LABELS, SENSOR_TYPE_ICONS, STATUS_COLORS } from '../types/monitoring'
import AddSensorModal from './AddSensorModal'

export default function SensorTree({ onSensorSelect }: { onSensorSelect: (s: MonitoringSensor) => void }) {
  const [sensors, setSensors] = useState<MonitoringSensor[]>([])
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<SensorStatus | ''>('')

  const load = useCallback(async () => {
    try {
      const params: Record<string, string> = {}
      if (statusFilter) params.status = statusFilter
      const data = await getSensors(params)
      setSensors(data)
    } catch { /* ignore */ }
  }, [statusFilter])

  useEffect(() => { load(); const iv = setInterval(load, 15000); return () => clearInterval(iv) }, [load])

  const filtered = sensors.filter(s =>
    s.display_name.toLowerCase().includes(filter.toLowerCase()) ||
    s.target_host.toLowerCase().includes(filter.toLowerCase())
  )

  const grouped = filtered.reduce<Record<SensorType, MonitoringSensor[]>>((acc, s) => {
    if (!acc[s.sensor_type]) acc[s.sensor_type] = []
    acc[s.sensor_type].push(s)
    return acc
  }, {} as any)

  const handleToggle = async (s: MonitoringSensor) => {
    try {
      if (s.paused) await resumeSensor(s.id); else await pauseSensor(s.id)
      load()
    } catch { /* ignore */ }
  }

  const handleDelete = async (s: MonitoringSensor) => {
    if (!confirm(`Delete sensor "${s.display_name}"?`)) return
    try { await deleteSensor(s.id); load() } catch { /* ignore */ }
  }

  return (
    <div className="flex flex-col h-full bg-gray-950/50 border-r border-white/[0.06]">
      {/* Search & filter */}
      <div className="p-3 space-y-2 border-b border-white/[0.06]">
        <AddSensorModal onCreated={load} />
        <input
          type="text"
          placeholder="Search sensors..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-white/20"
        />
        <div className="flex gap-1 flex-wrap">
          {(['', 'ok', 'warning', 'critical', 'down'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2 py-0.5 text-xs rounded-md transition-colors ${statusFilter === s ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Sensor list */}
      <div className="flex-1 overflow-y-auto p-2">
        {Object.entries(grouped).sort().map(([type, items]) => (
          <div key={type} className="mb-3">
            <div className="px-2 py-1 text-xs font-medium uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
              <span>{SENSOR_TYPE_ICONS[type as SensorType]}</span>
              <span>{SENSOR_TYPE_LABELS[type as SensorType]}</span>
              <span className="text-gray-600">({items.length})</span>
            </div>
            {items.map(s => (
              <div
                key={s.id}
                onClick={() => onSensorSelect(s)}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/[0.04] cursor-pointer group transition-colors"
              >
                <div className="relative flex-shrink-0">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: STATUS_COLORS[s.status] }}
                  />
                  {s.status !== 'ok' && (
                    <div
                      className="absolute inset-0 w-2 h-2 rounded-full animate-ping opacity-30"
                      style={{ backgroundColor: STATUS_COLORS[s.status] }}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{s.display_name}</div>
                  <div className="text-xs text-gray-500 truncate">{s.target_host}</div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={e => { e.stopPropagation(); handleToggle(s) }}
                    className="px-1.5 py-0.5 text-xs rounded bg-white/5 text-gray-400 hover:text-white"
                    title={s.paused ? 'Resume' : 'Pause'}
                  >
                    {s.paused ? '▶' : '⏸'}
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(s) }}
                    className="px-1.5 py-0.5 text-xs rounded bg-white/5 text-gray-400 hover:text-red-400"
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
                <div className="text-xs text-gray-500 tabular-nums flex-shrink-0">
                  {s.last_value_text || '—'}
                </div>
              </div>
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-sm">No sensors found</div>
        )}
      </div>

      {/* Count */}
      <div className="px-3 py-2 border-t border-white/[0.06] text-xs text-gray-500">
        {filtered.length} sensor{filtered.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}
import { useState, useEffect, useCallback, useRef } from 'react'
import { getSensorHistory } from '../services/monitoringService'
import type { MonitoringSensor, MonitoringReading, SensorStatus } from '../types/monitoring'
import { SENSOR_TYPE_LABELS, STATUS_COLORS } from '../types/monitoring'

export default function SensorDetail({ sensor }: { sensor: MonitoringSensor | null }) {
  const [readings, setReadings] = useState<MonitoringReading[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const loadHistory = useCallback(async () => {
    if (!sensor) return
    try {
      const data = await getSensorHistory(sensor.id, 24)
      setReadings(data.reverse())
    } catch { /* ignore */ }
  }, [sensor?.id])

  useEffect(() => { loadHistory(); const iv = setInterval(loadHistory, 30000); return () => clearInterval(iv) }, [loadHistory])

  // Draw mini chart
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || readings.length < 2) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const w = rect.width
    const h = rect.height
    const values = readings.map(r => r.value_float ?? 0)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1
    const pad = 10

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'
    ctx.lineWidth = 1
    for (let i = 0; i < 4; i++) {
      const y = pad + (i / 3) * (h - pad * 2)
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke()
    }

    // Line
    const color = STATUS_COLORS[sensor.status]
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.beginPath()
    values.forEach((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - pad * 2)
      const y = h - pad - ((v - min) / range) * (h - pad * 2)
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    })
    ctx.stroke()

    // Fill gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, color + '30')
    grad.addColorStop(1, color + '00')
    ctx.fillStyle = grad
    ctx.lineTo(w - pad, h - pad)
    ctx.lineTo(pad, h - pad)
    ctx.closePath()
    ctx.fill()
  }, [readings, sensor?.status])

  if (!sensor) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Select a sensor to view details
      </div>
    )
  }

  const statusColor = STATUS_COLORS[sensor.status]

  return (
    <div className="p-5 space-y-5 overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: statusColor, boxShadow: sensor.status !== 'ok' ? `0 0 8px ${statusColor}80` : 'none' }} />
            <h2 className="text-lg font-semibold text-white">{sensor.display_name}</h2>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-xs">{SENSOR_TYPE_LABELS[sensor.sensor_type as keyof typeof SENSOR_TYPE_LABELS]}</span>
            <span>{sensor.target_host}{sensor.target_port ? `:${sensor.target_port}` : ''}</span>
            <span className="text-gray-600">Every {sensor.interval_seconds}s</span>
          </div>
        </div>
        <span
          className="px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wider border"
          style={{ color: statusColor, borderColor: statusColor + '40', backgroundColor: statusColor + '15' }}
        >
          {sensor.status}
        </span>
      </div>

      {/* Current Value */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
          <div className="text-xs text-gray-500 mb-1">Current Value</div>
          <div className="text-2xl font-bold text-white tabular-nums">
            {sensor.last_value_float !== null ? sensor.last_value_float.toFixed(2) : sensor.last_value_text || '—'}
          </div>
        </div>
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
          <div className="text-xs text-gray-500 mb-1">Last Check</div>
          <div className="text-sm text-white">
            {sensor.last_check ? new Date(sensor.last_check).toLocaleTimeString() : 'Never'}
          </div>
        </div>
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
          <div className="text-xs text-gray-500 mb-1">Uptime (24h)</div>
          <div className="text-sm text-white">
            {readings.length > 0 ? Math.round((readings.filter(r => r.status === 'ok').length / readings.length) * 100) : 0}%
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
        <div className="text-xs text-gray-500 mb-2">Last 24 Hours</div>
        <canvas ref={canvasRef} className="w-full h-40 rounded-lg" style={{ width: '100%', height: 160 }} />
      </div>

      {/* Recent Readings */}
      <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
        <div className="text-xs text-gray-500 mb-3">Recent Readings</div>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {readings.slice(-20).reverse().map(r => (
            <div key={r.id} className="flex items-center justify-between px-2 py-1 rounded text-xs">
              <span className="text-gray-400 tabular-nums">{new Date(r.timestamp).toLocaleTimeString()}</span>
              <span className="text-white tabular-nums">{r.value_float?.toFixed(2) ?? r.value_text ?? '—'}</span>
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[r.status as SensorStatus] }} />
            </div>
          ))}
        </div>
      </div>

      {/* Sensor Config */}
      <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
        <div className="text-xs text-gray-500 mb-3">Configuration</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <div className="text-gray-500">Interval</div><div className="text-gray-300">{sensor.interval_seconds}s</div>
          <div className="text-gray-500">Timeout</div><div className="text-gray-300">{sensor.timeout_seconds}s</div>
          <div className="text-gray-500">Warning</div><div className="text-gray-300">{sensor.threshold_warning ?? '—'}</div>
          <div className="text-gray-500">Critical</div><div className="text-gray-300">{sensor.threshold_critical ?? '—'}</div>
          {sensor.snmp_version && <>
            <div className="text-gray-500">SNMP</div><div className="text-gray-300">v{sensor.snmp_version} / {sensor.snmp_community}</div>
          </>}
          <div className="text-gray-500">Paused</div><div className="text-gray-300">{sensor.paused ? 'Yes' : 'No'}</div>
        </div>
      </div>
    </div>
  )
}
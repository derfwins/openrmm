import { useState } from 'react'
import { createSensor } from '../services/monitoringService'
import type { SensorType } from '../types/monitoring'
import { SENSOR_TYPE_LABELS } from '../types/monitoring'

interface Props {
  onCreated: () => void
}

const SENSOR_TYPES: SensorType[] = ['ping', 'port', 'http', 'snmp_system', 'snmp_interface', 'snmp_cpu', 'snmp_disk', 'snmp_custom', 'dns', 'ssl_cert', 'snmp_printer', 'snmp_ups']

export default function AddSensorModal({ onCreated }: Props) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    display_name: '',
    sensor_type: 'ping' as SensorType,
    target_host: '',
    target_port: 80,
    interval_seconds: 60,
    timeout_seconds: 5,
    threshold_warning: null as number | null,
    threshold_critical: null as number | null,
    snmp_version: '2c',
    snmp_community: 'public',
    snmp_oid: '',
  })

  const isSnmp = form.sensor_type.startsWith('snmp')

  const handleSave = async () => {
    if (!form.display_name || !form.target_host) return
    setSaving(true)
    try {
      await createSensor({
        display_name: form.display_name,
        sensor_type: form.sensor_type,
        target_host: form.target_host,
        target_port: form.sensor_type === 'port' || form.sensor_type === 'http' ? form.target_port : undefined,
        interval_seconds: form.interval_seconds,
        timeout_seconds: form.timeout_seconds,
        threshold_warning: form.threshold_warning ?? undefined,
        threshold_critical: form.threshold_critical ?? undefined,
        snmp_version: isSnmp ? form.snmp_version : undefined,
        snmp_community: isSnmp ? form.snmp_community : undefined,
        snmp_oid: form.sensor_type === 'snmp_custom' ? form.snmp_oid : undefined,
      })
      setOpen(false)
      setForm({ display_name: '', sensor_type: 'ping', target_host: '', target_port: 80, interval_seconds: 60, timeout_seconds: 5, threshold_warning: null, threshold_critical: null, snmp_version: '2c', snmp_community: 'public', snmp_oid: '' })
      onCreated()
    } catch (e) {
      alert('Failed to create sensor: ' + e)
    }
    setSaving(false)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
        Add Sensor
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-gray-900 border border-white/10 rounded-xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Add Sensor</h2>
              <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Sensor Type */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Sensor Type</label>
                <select
                  value={form.sensor_type}
                  onChange={e => setForm({ ...form, sensor_type: e.target.value as SensorType })}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-white/20"
                >
                  {SENSOR_TYPES.map(t => <option key={t} value={t}>{SENSOR_TYPE_LABELS[t]}</option>)}
                </select>
              </div>

              {/* Display Name */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Display Name</label>
                <input
                  type="text"
                  value={form.display_name}
                  onChange={e => setForm({ ...form, display_name: e.target.value })}
                  placeholder="e.g. Main Switch - Ping"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/20"
                />
              </div>

              {/* Target Host */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Target Host</label>
                <input
                  type="text"
                  value={form.target_host}
                  onChange={e => setForm({ ...form, target_host: e.target.value })}
                  placeholder="e.g. 10.10.0.1 or switch.local"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/20"
                />
              </div>

              {/* Port (for port/http sensors) */}
              {(form.sensor_type === 'port' || form.sensor_type === 'http') && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Port</label>
                  <input
                    type="number"
                    value={form.target_port}
                    onChange={e => setForm({ ...form, target_port: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-white/20"
                  />
                </div>
              )}

              {/* SNMP Config */}
              {isSnmp && (
                <div className="space-y-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                  <div className="text-xs font-medium text-gray-300">SNMP Configuration</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Version</label>
                      <select value={form.snmp_version} onChange={e => setForm({ ...form, snmp_version: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-white/20">
                        <option value="1">v1</option>
                        <option value="2c">v2c</option>
                        <option value="3">v3</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Community</label>
                      <input type="text" value={form.snmp_community} onChange={e => setForm({ ...form, snmp_community: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-white/20" />
                    </div>
                  </div>
                  {form.sensor_type === 'snmp_custom' && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">OID</label>
                      <input type="text" value={form.snmp_oid} onChange={e => setForm({ ...form, snmp_oid: e.target.value })} placeholder="1.3.6.1.2.1.1.3.0"
                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/20" />
                    </div>
                  )}
                </div>
              )}

              {/* Check Settings */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Interval (seconds)</label>
                  <input type="number" value={form.interval_seconds} onChange={e => setForm({ ...form, interval_seconds: parseInt(e.target.value) || 60 })}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-white/20" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Timeout (seconds)</label>
                  <input type="number" value={form.timeout_seconds} onChange={e => setForm({ ...form, timeout_seconds: parseInt(e.target.value) || 5 })}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-white/20" />
                </div>
              </div>

              {/* Thresholds */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Warning Threshold</label>
                  <input type="number" value={form.threshold_warning ?? ''} onChange={e => setForm({ ...form, threshold_warning: e.target.value ? parseFloat(e.target.value) : null })} placeholder="e.g. 100"
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/20" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Critical Threshold</label>
                  <input type="number" value={form.threshold_critical ?? ''} onChange={e => setForm({ ...form, threshold_critical: e.target.value ? parseFloat(e.target.value) : null })} placeholder="e.g. 200"
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/20" />
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-white/[0.06] flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.display_name || !form.target_host}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors">
                {saving ? 'Creating...' : 'Create Sensor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
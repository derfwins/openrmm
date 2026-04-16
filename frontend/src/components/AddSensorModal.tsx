import { useState } from 'react'
import { createSensor, discoverDevice } from '../services/monitoringService'
import type { DiscoverResult } from '../services/monitoringService'
import { SENSOR_TYPE_LABELS } from '../types/monitoring'

interface Props {
  onCreated: () => void
}

const DEVICE_LABELS: Record<string, string> = {
  cisco: 'Cisco IOS/NX-OS',
  juniper: 'Juniper Junos',
  arista: 'Arista EOS',
  hp_aruba: 'HP/Aruba',
  mikrotik: 'Mikrotik RouterOS',
  ubiquiti: 'Ubiquiti',
  palo_alto: 'Palo Alto PAN-OS',
  fortinet: 'Fortinet FortiGate',
  dell: 'Dell Networking',
  windows: 'Windows Server',
  linux: 'Linux Server',
  printer: 'Network Printer',
  ups: 'UPS',
  synology: 'Synology NAS',
  qnap: 'QNAP NAS',
  snmp_device: 'SNMP Device',
}

export default function AddSensorModal({ onCreated }: Props) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'discover' | 'results'>('discover')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [targetHost, setTargetHost] = useState('')
  const [snmpCommunity, setSnmpCommunity] = useState('public')
  const [discovery, setDiscovery] = useState<DiscoverResult | null>(null)
  const [selectedSensors, setSelectedSensors] = useState<Set<number>>(new Set())

  const handleDiscover = async () => {
    if (!targetHost) return
    setLoading(true)
    try {
      const result = await discoverDevice(targetHost, snmpCommunity)
      setDiscovery(result)
      setSelectedSensors(new Set(result.suggested_sensors.map((_, i) => i)))
      setStep('results')
    } catch (e) {
      alert('Discovery failed: ' + e)
    }
    setLoading(false)
  }

  const handleCreate = async () => {
    if (!discovery) return
    setSaving(true)
    try {
      const sensorsToCreate = discovery.suggested_sensors.filter((_, i) => selectedSensors.has(i))
      for (const s of sensorsToCreate) {
        await createSensor({
          display_name: s.display_name,
          sensor_type: s.sensor_type as import('../types/monitoring').SensorType,
          target_host: s.target_host,
          snmp_community: snmpCommunity,
          snmp_version: '2c',
          interval_seconds: 60,
          timeout_seconds: 5,
        })
      }
      setOpen(false)
      resetState()
      onCreated()
    } catch (e) {
      alert('Failed to create sensors: ' + e)
    }
    setSaving(false)
  }

  const resetState = () => {
    setStep('discover')
    setTargetHost('')
    setSnmpCommunity('public')
    setDiscovery(null)
    setSelectedSensors(new Set())
  }

  const toggleSensor = (idx: number) => {
    const next = new Set(selectedSensors)
    if (next.has(idx)) next.delete(idx); else next.add(idx)
    setSelectedSensors(next)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
        Add Device
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setOpen(false); resetState() }}>
          <div className="bg-gray-900 border border-white/10 rounded-xl w-full max-w-xl shadow-2xl" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                {step === 'discover' ? 'Discover Device' : 'Discovered Device'}
              </h2>
              <button onClick={() => { setOpen(false); resetState() }} className="text-gray-500 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-5">
              {step === 'discover' ? (
                /* Step 1: Discover */
                <div className="space-y-4">
                  <p className="text-sm text-gray-400">Enter an IP address or hostname. We'll probe it and auto-detect the device type using SNMP.</p>

                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">IP Address / Hostname</label>
                    <input
                      type="text"
                      value={targetHost}
                      onChange={e => setTargetHost(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleDiscover()}
                      placeholder="e.g. 10.10.0.1 or switch.local"
                      className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">SNMP Community String</label>
                    <input
                      type="text"
                      value={snmpCommunity}
                      onChange={e => setSnmpCommunity(e.target.value)}
                      placeholder="public"
                      className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
                    />
                  </div>

                  <button
                    onClick={handleDiscover}
                    disabled={loading || !targetHost}
                    className="w-full px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-75" /></svg>
                        Scanning...
                      </span>
                    ) : 'Discover Device'}
                  </button>
                </div>
              ) : (
                /* Step 2: Results & Select Sensors */
                <div className="space-y-4">
                  {/* Device Info Card */}
                  {discovery && (
                    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`w-3 h-3 rounded-full ${discovery.alive ? 'bg-emerald-400' : 'bg-red-500'}`}
                          style={{ boxShadow: discovery.alive ? '0 0 8px #10B98180' : '0 0 8px #EF444480' }} />
                        <span className="text-white font-medium">{targetHost}</span>
                        {discovery.device_type && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30">
                            {DEVICE_LABELS[discovery.device_type] || discovery.device_type}
                          </span>
                        )}
                      </div>
                      {discovery.sys_descr && (
                        <p className="text-xs text-gray-400 mb-2 break-all">{discovery.sys_descr}</p>
                      )}
                      {discovery.sys_name && (
                        <p className="text-xs text-gray-500">Hostname: <span className="text-gray-300">{discovery.sys_name}</span></p>
                      )}
                      {!discovery.alive && (
                        <p className="text-xs text-red-400">Device did not respond to ping</p>
                      )}
                    </div>
                  )}

                  {/* Suggested Sensors */}
                  {discovery && discovery.suggested_sensors.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-300">Suggested Sensors</span>
                        <button
                          onClick={() => {
                            if (selectedSensors.size === discovery.suggested_sensors.length) {
                              setSelectedSensors(new Set())
                            } else {
                              setSelectedSensors(new Set(discovery.suggested_sensors.map((_, i) => i)))
                            }
                          }}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          {selectedSensors.size === discovery.suggested_sensors.length ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        {discovery.suggested_sensors.map((s, i) => (
                          <label
                            key={i}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                              selectedSensors.has(i) ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04]'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedSensors.has(i)}
                              onChange={() => toggleSensor(i)}
                              className="rounded accent-blue-500"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-white">{s.display_name}</div>
                              <div className="text-xs text-gray-500">{s.description}</div>
                            </div>
                            <span className="px-2 py-0.5 rounded-md text-xs bg-white/5 border border-white/10 text-gray-400">
                              {SENSOR_TYPE_LABELS[s.sensor_type as keyof typeof SENSOR_TYPE_LABELS] || s.sensor_type}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {discovery && discovery.suggested_sensors.length === 0 && discovery.alive && (
                    <p className="text-sm text-gray-400 text-center py-4">
                      Device is alive but no sensors could be auto-detected.
                      You can add manual sensors from the monitoring page.
                    </p>
                  )}

                  {/* Back / Create buttons */}
                  <div className="flex justify-between pt-2">
                    <button
                      onClick={() => setStep('discover')}
                      className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleCreate}
                      disabled={saving || selectedSensors.size === 0}
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                    >
                      {saving ? 'Creating...' : `Create ${selectedSensors.size} Sensor${selectedSensors.size !== 1 ? 's' : ''}`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
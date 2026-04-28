import { useState, useEffect, useCallback } from 'react'
import { getProbes, deleteProbe } from '../services/monitoringService'
import type { MonitoringProbe } from '../types/monitoring'

export default function ProbeManager() {
  const [probes, setProbes] = useState<MonitoringProbe[]>([])
  const [showDeploy, setShowDeploy] = useState(false)

  const load = useCallback(async () => {
    try { setProbes(await getProbes()) } catch { /* ignore */ }
  }, [])

  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv) }, [load])

  const handleDelete = async (p: MonitoringProbe) => {
    if (!confirm(`Remove probe "${p.name}"?`)) return
    try { await deleteProbe(p.id); load() } catch { /* ignore */ }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white tracking-tight">Monitoring Probes</h1>
        <button
          onClick={() => setShowDeploy(!showDeploy)}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
        >
          + Deploy Probe
        </button>
      </div>

      {/* Deploy instructions */}
      {showDeploy && (
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 backdrop-blur-xl space-y-4">
          <h3 className="text-sm font-medium text-white">Deploy a Monitoring Probe</h3>
          <p className="text-xs text-gray-400">Install the probe on a machine at the client site. It will monitor local devices and report back to OpenRMM.</p>

          <div>
            <div className="text-xs font-medium text-gray-300 mb-1">Windows (PowerShell as Admin)</div>
            <pre className="text-xs bg-black/30 border border-white/[0.06] rounded-lg p-3 text-emerald-400 overflow-x-auto">
{`Invoke-WebRequest -Uri "https://openrmm.derfwins.com/probe/install.ps1" -OutFile install.ps1
./install.ps1 -Server https://openrmm.derfwins.com -SiteId 1`}
            </pre>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-300 mb-1">Linux (Bash)</div>
            <pre className="text-xs bg-black/30 border border-white/[0.06] rounded-lg p-3 text-emerald-400 overflow-x-auto">
{`curl -sSL https://openrmm.derfwins.com/probe/install.sh | bash -s -- -s https://openrmm.derfwins.com -c 1`}
            </pre>
          </div>
          <button onClick={() => setShowDeploy(false)} className="text-xs text-gray-400 hover:text-white">Close</button>
        </div>
      )}

      {/* Probe list */}
      <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">IP</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Last Seen</th>
              <th className="px-4 py-3 text-left font-medium">Version</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {probes.map(p => (
              <tr key={p.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3 text-white font-medium">{p.name}</td>
                <td className="px-4 py-3 text-gray-400 capitalize">{p.probe_type}</td>
                <td className="px-4 py-3 text-gray-400 tabular-nums">{p.ip_address || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 text-xs ${p.status === 'online' ? 'text-emerald-400' : 'text-gray-500'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${p.status === 'online' ? 'bg-emerald-400' : 'bg-gray-600'}`} />
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs tabular-nums">
                  {p.last_seen ? new Date(p.last_seen).toLocaleString() : 'Never'}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{p.version || '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleDelete(p)} className="text-xs text-gray-500 hover:text-red-400 transition-colors">Remove</button>
                </td>
              </tr>
            ))}
            {probes.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No probes deployed yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
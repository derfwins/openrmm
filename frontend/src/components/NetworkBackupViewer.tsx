import { useState, useEffect, useCallback } from 'react'
import { getBackups, getBackupDiff } from '../services/monitoringService'
import type { MonitoringBackup, MonitoringSensor } from '../types/monitoring'

export default function NetworkBackupViewer({ sensor }: { sensor: MonitoringSensor | null }) {
  const [backups, setBackups] = useState<MonitoringBackup[]>([])
  const [selectedA, setSelectedA] = useState<number | null>(null)
  const [selectedB, setSelectedB] = useState<number | null>(null)
  const [diff, setDiff] = useState<{ from: string; to: string } | null>(null)

  const load = useCallback(async () => {
    if (!sensor) return
    try { setBackups(await getBackups(sensor.id)) } catch { /* ignore */ }
  }, [sensor?.id])

  useEffect(() => { load() }, [load])

  const showDiff = async () => {
    if (!sensor || !selectedA || !selectedB) return
    try {
      const data = await getBackupDiff(sensor.id, selectedA, selectedB)
      setDiff(data)
    } catch { /* ignore */ }
  }

  const renderDiff = (from: string, to: string) => {
    const fromLines = from.split('\n')
    const toLines = to.split('\n')
    const lines: Array<{ type: 'same' | 'add' | 'remove'; text: string }> = []
    const maxLen = Math.max(fromLines.length, toLines.length)
    for (let i = 0; i < maxLen; i++) {
      const f = fromLines[i] ?? ''
      const t = toLines[i] ?? ''
      if (f === t) {
        lines.push({ type: 'same', text: t })
      } else {
        if (f) lines.push({ type: 'remove', text: f })
        if (t) lines.push({ type: 'add', text: t })
      }
    }
    return lines
  }

  if (!sensor) return <div className="flex items-center justify-center h-full text-gray-500">Select a sensor with backups</div>

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Network Config Backups</h2>
        <span className="text-xs text-gray-500">{sensor.display_name} ({sensor.target_host})</span>
      </div>

      {/* Backup list */}
      <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-3 py-2 text-left font-medium">Timestamp</th>
              <th className="px-3 py-2 text-left font-medium">Type</th>
              <th className="px-3 py-2 text-left font-medium">Size</th>
              <th className="px-3 py-2 text-left font-medium">Diff</th>
              <th className="px-3 py-2 text-center font-medium">A</th>
              <th className="px-3 py-2 text-center font-medium">B</th>
            </tr>
          </thead>
          <tbody>
            {backups.map(b => (
              <tr key={b.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                <td className="px-3 py-2 text-gray-300 tabular-nums text-xs">{new Date(b.timestamp).toLocaleString()}</td>
                <td className="px-3 py-2 text-gray-400 text-xs capitalize">{b.backup_type}</td>
                <td className="px-3 py-2 text-gray-400 tabular-nums text-xs">{b.file_size ? `${(b.file_size / 1024).toFixed(1)}KB` : '—'}</td>
                <td className="px-3 py-2 text-xs">
                  {b.diff_from_last ? (
                    <span className="text-amber-400">{b.diff_from_last.split('\n').length} lines changed</span>
                  ) : (
                    <span className="text-gray-600">Baseline</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  <input type="radio" name="diff_a" checked={selectedA === b.id} onChange={() => setSelectedA(b.id)} className="accent-blue-500" />
                </td>
                <td className="px-3 py-2 text-center">
                  <input type="radio" name="diff_b" checked={selectedB === b.id} onChange={() => setSelectedB(b.id)} className="accent-blue-500" />
                </td>
              </tr>
            ))}
            {backups.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500 text-xs">No backups yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedA && selectedB && (
        <button onClick={showDiff} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
          Compare Selected
        </button>
      )}

      {/* Diff viewer */}
      {diff && (
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
          <div className="px-4 py-2 border-b border-white/[0.06] text-xs text-gray-400 flex items-center justify-between">
            <span>Configuration Diff</span>
            <button onClick={() => setDiff(null)} className="text-gray-500 hover:text-white">Close</button>
          </div>
          <div className="overflow-auto max-h-96 text-xs font-mono">
            {renderDiff(diff.from, diff.to).map((line, i) => (
              <div
                key={i}
                className={`px-4 py-0.5 ${
                  line.type === 'add' ? 'bg-emerald-500/10 text-emerald-400' :
                  line.type === 'remove' ? 'bg-red-500/10 text-red-400' :
                  'text-gray-400'
                }`}
              >
                <span className="inline-block w-4 text-gray-600 tabular-nums select-none">
                  {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                </span>
                {line.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
import { useState, useEffect } from 'react'
import { ReportType } from '../types/report'
import type { Report, ReportSchedule, ReportDateRange, ReportFilters } from '../types/report'
import {
  generateReport,
  listReports,
  downloadReport,
  listSchedules,
  createSchedule,
  deleteSchedule,
  toggleSchedule,
} from '../services/reportService'

const REPORT_CARDS: { type: ReportType; label: string; desc: string; icon: string }[] = [
  { type: ReportType.SystemHealth, label: 'System Health', desc: 'CPU, memory, disk across all devices', icon: '❤️' },
  { type: ReportType.PatchCompliance, label: 'Patch Compliance', desc: 'Update status and missing patches', icon: '🔧' },
  { type: ReportType.AuditLog, label: 'Audit Log', desc: 'User actions and system events', icon: '📋' },
  { type: ReportType.DeviceInventory, label: 'Device Inventory', desc: 'Complete managed device listing', icon: '💻' },
  { type: ReportType.AgentActivity, label: 'Agent Activity', desc: 'Agent connectivity and check-ins', icon: '📡' },
]

const FORMAT_OPTIONS: { value: 'pdf' | 'csv'; label: string }[] = [
  { value: 'pdf', label: 'PDF' },
  { value: 'csv', label: 'CSV' },
]

const FREQ_OPTIONS: { value: 'daily' | 'weekly' | 'monthly'; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

export default function Reports() {
  const [tab, setTab] = useState<'generate' | 'history' | 'schedules'>('generate')
  const [selectedType, setSelectedType] = useState<ReportType>(ReportType.DeviceInventory)
  const [format, setFormat] = useState<'pdf' | 'csv'>('pdf')
  const [dateStart, setDateStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10)
  })
  const [dateEnd, setDateEnd] = useState(() => new Date().toISOString().slice(0, 10))
  const [filterClient, setFilterClient] = useState('')
  const [filterSite, setFilterSite] = useState('')
  const [generating, setGenerating] = useState(false)
  const [reports, setReports] = useState<Report[]>([])
  const [schedules, setSchedules] = useState<ReportSchedule[]>([])
  const [schedFreq, setSchedFreq] = useState<'daily' | 'weekly' | 'monthly'>('weekly')
  const [error, setError] = useState('')

  useEffect(() => {
    if (tab === 'history') listReports().then(setReports).catch(() => {})
    if (tab === 'schedules') listSchedules().then(setSchedules).catch(() => {})
  }, [tab])

  const dateRange: ReportDateRange = { start: dateStart, end: dateEnd }
  const filters: ReportFilters = {
    ...(filterClient && { client: filterClient }),
    ...(filterSite && { site: filterSite }),
  }

  async function handleGenerate() {
    setGenerating(true); setError('')
    try {
      await generateReport(selectedType, dateRange, filters, format)
      setTab('history')
    } catch (e: any) { setError(e.message) }
    finally { setGenerating(false) }
  }

  async function handleDownload(r: Report) {
    try {
      const blob = await downloadReport(r.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${r.type}_${r.id}.${r.format}`; a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) { setError(e.message) }
  }

  async function handleSchedule() {
    setError('')
    try {
      await createSchedule({ type: selectedType, date_range: dateRange, filters, format, frequency: schedFreq, enabled: true })
      const s = await listSchedules(); setSchedules(s)
    } catch (e: any) { setError(e.message) }
  }

  async function handleDeleteSchedule(id: string) {
    await deleteSchedule(id)
    setSchedules(schedules.filter(s => s.id !== id))
  }

  async function handleToggleSchedule(id: string, enabled: boolean) {
    const updated = await toggleSchedule(id, !enabled)
    setSchedules(schedules.map(s => s.id === id ? updated : s))
  }

  // Summary stats
  const completedReports = reports.filter(r => r.status === 'completed').length
  const activeSchedules = schedules.filter(s => s.enabled).length

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Generate, schedule, and download system reports</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Reports', value: reports.length, icon: '📊' },
          { label: 'Completed', value: completedReports, icon: '✅' },
          { label: 'Scheduled', value: schedules.length, icon: '📅' },
          { label: 'Active Schedules', value: activeSchedules, icon: '⏰' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{s.icon}</span>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        {(['generate', 'history', 'schedules'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {t === 'generate' ? 'Generate' : t === 'history' ? 'History' : 'Schedules'}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-4 py-2 rounded-lg text-sm">{error}</div>
      )}

      {/* Generate Tab */}
      {tab === 'generate' && (
        <div className="space-y-6">
          {/* Report Type Cards */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Report Type</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {REPORT_CARDS.map(rc => (
                <button
                  key={rc.type}
                  onClick={() => setSelectedType(rc.type)}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    selectedType === rc.type
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="text-2xl mb-2">{rc.icon}</div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{rc.label}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{rc.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Config Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Date Range */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Date Range</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Start</label>
                  <input
                    type="date"
                    value={dateStart}
                    onChange={e => setDateStart(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">End</label>
                  <input
                    type="date"
                    value={dateEnd}
                    onChange={e => setDateEnd(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Filters</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Client</label>
                  <input
                    type="text"
                    placeholder="All clients"
                    value={filterClient}
                    onChange={e => setFilterClient(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Site</label>
                  <input
                    type="text"
                    placeholder="All sites"
                    value={filterSite}
                    onChange={e => setFilterSite(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Format & Actions */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Format:</span>
                {FORMAT_OPTIONS.map(f => (
                  <button
                    key={f.value}
                    onClick={() => setFormat(f.value)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      format === f.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex-1" />
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {generating ? 'Generating...' : 'Generate Report'}
              </button>
              <button
                onClick={handleSchedule}
                className="px-5 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
              >
                Schedule
              </button>
            </div>

            {/* Schedule frequency (inline) */}
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">Schedule frequency:</span>
              {FREQ_OPTIONS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setSchedFreq(f.value)}
                  className={`px-2 py-1 text-xs rounded-md transition-colors ${
                    schedFreq === f.value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* History Tab */}
      {tab === 'history' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Type</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Format</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Date Range</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Generated</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {reports.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center">
                  <div className="flex items-center justify-center animate-[fadeIn_0.5s_ease-out]">
                    <div className="w-56 rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-xl p-6 space-y-3 dark:bg-gray-900/50">
                      <div className="text-4xl">📊</div>
                      <h2 className="text-sm font-semibold text-white">No reports generated yet</h2>
                      <p className="text-xs text-gray-400">Generate your first report to get started.</p>
                    </div>
                  </div>
                </td></tr>
              ) : reports.map(r => (
                <tr key={r.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">{r.type.replace('_', ' ')}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 uppercase">{r.format}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.date_range.start} → {r.date_range.end}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      r.status === 'completed' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : r.status === 'failed' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                    }`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.generated_at ?? '—'}</td>
                  <td className="px-4 py-3">
                    {r.status === 'completed' && (
                      <button onClick={() => handleDownload(r)} className="text-blue-600 dark:text-blue-400 hover:underline text-xs font-medium">Download</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Schedules Tab */}
      {tab === 'schedules' && (
        <div className="space-y-3">
          {schedules.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-400 dark:text-gray-500">
              No scheduled reports. Create one from the Generate tab.
            </div>
          ) : schedules.map(s => (
            <div key={s.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{s.type.replace('_', ' ')} — {s.format.toUpperCase()}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {s.frequency} · {s.date_range.start} → {s.date_range.end}
                  {s.last_run && ` · Last: ${s.last_run}`}
                </p>
              </div>
              <button
                onClick={() => handleToggleSchedule(s.id, s.enabled)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  s.enabled
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}
              >
                {s.enabled ? 'Active' : 'Paused'}
              </button>
              <button
                onClick={() => handleDeleteSchedule(s.id)}
                className="px-3 py-1.5 text-xs bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
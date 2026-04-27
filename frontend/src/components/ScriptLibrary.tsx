import { useState, useEffect, useCallback } from 'react'
import apiService from '../services/apiService'

type ShellType = 'powershell' | 'bash' | 'python'
type CategoryType = 'Community' | 'Custom' | 'AI-Generated' | 'Diagnostics' | 'Network' | 'Cleanup' | 'Repair' | 'Security' | 'Power Management'

interface Script {
  id: number
  name: string
  description: string
  script_body: string
  shell: ShellType
  script_type?: string
  timeout: number
  category: CategoryType
}

interface Device {
  id: string
  hostname: string
  operating_system?: string
}

const SHELLS: ShellType[] = ['powershell', 'bash', 'python']
const CATEGORIES: CategoryType[] = ['Community', 'Custom', 'AI-Generated', 'Diagnostics', 'Network', 'Cleanup', 'Repair', 'Security', 'Power Management']

const shellIcon = (shell: string) => {
  switch (shell) {
    case 'powershell': case 'cmd': return '🪟'
    case 'bash': case 'shell': return '🐧'
    case 'python': case 'py': return '🐍'
    default: return '📝'
  }
}

const categoryColor = (cat: string) => {
  switch (cat) {
    case 'Community': return 'bg-blue-900/50 text-blue-300'
    case 'AI-Generated': return 'bg-purple-900/50 text-purple-300'
    case 'Diagnostics': return 'bg-amber-900/50 text-amber-300'
    case 'Network': return 'bg-cyan-900/50 text-cyan-300'
    case 'Cleanup': return 'bg-green-900/50 text-green-300'
    case 'Repair': return 'bg-orange-900/50 text-orange-300'
    case 'Security': return 'bg-red-900/50 text-red-300'
    case 'Power Management': return 'bg-yellow-900/50 text-yellow-300'
    default: return 'bg-gray-700 text-gray-300'
  }
}

const categoryEmoji = (cat: string) => {
  switch (cat) {
    case 'Community': return '👥'
    case 'Custom': return '✏️'
    case 'AI-Generated': return '🤖'
    case 'Diagnostics': return '🔍'
    case 'Network': return '🌐'
    case 'Cleanup': return '🧹'
    case 'Repair': return '🔧'
    case 'Security': return '🛡️'
    case 'Power Management': return '⚡'
    default: return '📦'
  }
}

const emptyScript = (): Omit<Script, 'id'> => ({
  name: '',
  description: '',
  script_body: '',
  shell: 'powershell',
  timeout: 300,
  category: 'Custom',
})

const ScriptLibrary = () => {
  const [scripts, setScripts] = useState<Script[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterShell, setFilterShell] = useState<ShellType | ''>('')
  const [filterCategory, setFilterCategory] = useState<CategoryType | ''>('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<number | null>(null)

  // Create/Edit modal
  const [showEditor, setShowEditor] = useState(false)
  const [editingScript, setEditingScript] = useState<Script | null>(null)
  const [form, setForm] = useState(emptyScript())
  const [saving, setSaving] = useState(false)

  // Delete modal
  const [showDelete, setShowDelete] = useState(false)
  const [deletingScript, setDeletingScript] = useState<Script | null>(null)

  // Run modal
  const [showRun, setShowRun] = useState(false)
  const [runScript, setRunScript] = useState<Script | null>(null)
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [runLoading, setRunLoading] = useState(false)
  const [runOutput, setRunOutput] = useState('')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [scriptData, deviceData] = await Promise.all([
        apiService.getScripts(),
        apiService.getDevices(),
      ])
      setScripts(Array.isArray(scriptData) ? scriptData : scriptData.results || [])
      const devList = Array.isArray(deviceData) ? deviceData : deviceData.results || []
      setDevices(devList.map((d: Record<string, unknown>) => ({
        id: d.id as string || d.agent_id as string,
        hostname: (d.hostname || d.computer_name || d.name || 'Unknown') as string,
        operating_system: (d.operating_system || d.os || '') as string,
      })))
    } catch {
      setScripts([])
      setDevices([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const filtered = scripts.filter(s => {
    const q = search.toLowerCase()
    const matchSearch = (s.name || '').toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q)
    const matchShell = !filterShell || s.shell === filterShell || s.script_type === filterShell
    const matchCat = !filterCategory || s.category === filterCategory
    return matchSearch && matchShell && matchCat
  })

  const handleCopy = async (script: Script) => {
    await navigator.clipboard.writeText(script.script_body || '')
    setCopyFeedback(script.id)
    setTimeout(() => setCopyFeedback(null), 2000)
  }

  const openCreate = () => {
    setEditingScript(null)
    setForm(emptyScript())
    setShowEditor(true)
  }

  const openEdit = (script: Script) => {
    setEditingScript(script)
    setForm({
      name: script.name,
      description: script.description || '',
      script_body: script.script_body || '',
      shell: script.shell || 'powershell',
      timeout: script.timeout || 300,
      category: script.category || 'Custom',
    })
    setShowEditor(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editingScript) {
        await apiService.updateScript(editingScript.id, form)
      } else {
        await apiService.createScript(form)
      }
      setShowEditor(false)
      await loadData()
    } catch {
      // error handled silently - could add toast later
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deletingScript) return
    try {
      await apiService.deleteScript(deletingScript.id)
      setShowDelete(false)
      setDeletingScript(null)
      setExpandedId(null)
      await loadData()
    } catch {
      // silently fail
    }
  }

  const openRun = (script: Script) => {
    setRunScript(script)
    setSelectedAgents([])
    setRunOutput('')
    setShowRun(true)
  }

  const handleRun = async () => {
    if (!runScript || selectedAgents.length === 0) return
    setRunLoading(true)
    setRunOutput('')
    try {
      const result = await apiService.runScriptOnAgents(runScript.id, selectedAgents)
      const online = result.dispatched || 0
      const offline = result.offline?.length || 0
      const lines: string[] = []
      if (online > 0) lines.push(`✅ Dispatched to ${online} agent${online !== 1 ? 's' : ''}`)
      if (offline > 0) lines.push(`⚠️ ${offline} agent${offline !== 1 ? 's' : ''} offline`)
      if (result.session_ids?.length) lines.push(`Session IDs: ${result.session_ids.join(', ')}`)
      setRunOutput(lines.join('\n'))
    } catch (e: any) {
      setRunOutput(`❌ Failed: ${e.message}`)
    }
    setRunLoading(false)
  }

  const toggleAgent = (id: string) => {
    setSelectedAgents(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    )
  }

  const lineNumbers = (code: string) => {
    const count = code.split('\n').length
    return Array.from({ length: count }, (_, i) => i + 1).join('\n')
  }

  return (
    <div className="p-6 bg-gray-900 min-h-screen space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Script Library</h1>
          <p className="text-gray-400 text-sm mt-1">{scripts.length} scripts available</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="px-4 py-2 text-sm bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors">
            ↻ Refresh
          </button>
          <button onClick={openCreate} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            + New Script
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute left-3 top-2.5 text-gray-500">🔍</span>
          <input
            type="text"
            placeholder="Search scripts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500"
          />
        </div>
        <select
          value={filterShell}
          onChange={e => setFilterShell(e.target.value as ShellType | '')}
          className="px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Shells</option>
          {SHELLS.map(s => <option key={s} value={s}>{shellIcon(s)} {s}</option>)}
        </select>
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value as CategoryType | '')}
          className="px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{categoryEmoji(c)} {c}</option>)}
        </select>
      </div>

      {/* Script List */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-4xl mb-3">📜</div>
            <p className="text-sm text-gray-400">
              {scripts.length === 0 ? 'No scripts yet. Create one to get started.' : 'No scripts match your filters'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {filtered.map(script => (
              <div key={script.id}>
                <div
                  className="px-5 py-4 hover:bg-gray-750 transition-colors cursor-pointer"
                  onClick={() => setExpandedId(expandedId === script.id ? null : script.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-lg">{shellIcon(script.shell || script.script_type)}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium text-white truncate">{script.name}</h3>
                          <span className={`px-2 py-0.5 text-xs rounded ${categoryColor(script.category)}`}>
                            {categoryEmoji(script.category || 'Custom')} {script.category || 'Custom'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{script.description || 'No description'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4 shrink-0" onClick={e => e.stopPropagation()}>
                      <span className="px-2 py-0.5 text-xs bg-gray-700 text-gray-400 rounded">
                        {script.shell || script.script_type || 'script'}
                      </span>
                      {script.timeout && (
                        <span className="px-2 py-0.5 text-xs bg-gray-700 text-gray-500 rounded">
                          {script.timeout}s
                        </span>
                      )}
                      <button
                        onClick={() => handleCopy(script)}
                        className="px-2 py-1.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
                        title="Copy script"
                      >
                        {copyFeedback === script.id ? '✓' : '📋'}
                      </button>
                      <button
                        onClick={() => openRun(script)}
                        className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        ▶ Run
                      </button>
                      <button
                        onClick={() => openEdit(script)}
                        className="px-2 py-1.5 text-xs bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                        title="Edit"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => { setDeletingScript(script); setShowDelete(true) }}
                        className="px-2 py-1.5 text-xs bg-gray-700 text-red-400 rounded-lg hover:bg-red-900/50 transition-colors"
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
                {expandedId === script.id && script.script_body && (
                  <div className="px-5 pb-4">
                    <div className="flex overflow-x-auto bg-gray-950 rounded-lg text-xs font-mono">
                      <div className="py-3 px-3 text-right text-gray-600 select-none border-r border-gray-800 leading-5 whitespace-pre">
                        {lineNumbers(script.script_body)}
                      </div>
                      <pre className="py-3 px-4 text-green-400 leading-5 whitespace-pre flex-1 overflow-x-auto">
                        {script.script_body}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showEditor && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowEditor(false)}>
          <div className="bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-700">
              <h3 className="text-lg font-semibold text-white">{editingScript ? 'Edit Script' : 'New Script'}</h3>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Name</label>
                <input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Description</label>
                <input
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm text-gray-400 mb-1">Shell</label>
                  <select
                    value={form.shell}
                    onChange={e => setForm({ ...form, shell: e.target.value as ShellType })}
                    className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                  >
                    {SHELLS.map(s => <option key={s} value={s}>{shellIcon(s)} {s}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-gray-400 mb-1">Category</label>
                  <select
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value as CategoryType })}
                    className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{categoryEmoji(c)} {c}</option>)}
                  </select>
                </div>
                <div className="w-24">
                  <label className="block text-sm text-gray-400 mb-1">Timeout (s)</label>
                  <input
                    type="number"
                    value={form.timeout}
                    onChange={e => setForm({ ...form, timeout: parseInt(e.target.value) || 300 })}
                    className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Script Body</label>
                <textarea
                  value={form.script_body}
                  onChange={e => setForm({ ...form, script_body: e.target.value })}
                  rows={12}
                  spellCheck={false}
                  className="w-full px-4 py-3 text-sm bg-gray-950 border border-gray-700 rounded-lg text-green-400 font-mono leading-5 focus:ring-2 focus:ring-blue-500 resize-y"
                  placeholder="Enter your script..."
                />
              </div>
            </div>
            <div className="p-5 border-t border-gray-700 flex justify-end gap-2">
              <button onClick={() => setShowEditor(false)} className="px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-lg">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : editingScript ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDelete && deletingScript && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowDelete(false)}>
          <div className="bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-5">
              <h3 className="text-lg font-semibold text-white mb-2">Delete Script</h3>
              <p className="text-sm text-gray-400">
                Are you sure you want to delete <strong className="text-white">{deletingScript.name}</strong>? This cannot be undone.
              </p>
            </div>
            <div className="p-5 border-t border-gray-700 flex justify-end gap-2">
              <button onClick={() => setShowDelete(false)} className="px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-lg">
                Cancel
              </button>
              <button onClick={confirmDelete} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Run Script Modal */}
      {showRun && runScript && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowRun(false)}>
          <div className="bg-gray-800 rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-700">
              <h3 className="text-lg font-semibold text-white">Run: {runScript.name}</h3>
              <p className="text-xs text-gray-400 mt-1">{shellIcon(runScript.shell)} {runScript.shell} • {runScript.category}</p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Select target agents:</label>
                {devices.length === 0 ? (
                  <p className="text-sm text-gray-500">No agents available</p>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {devices.map(d => (
                      <label key={d.id} className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedAgents.includes(d.id)}
                          onChange={() => toggleAgent(d.id)}
                          className="rounded bg-gray-900 border-gray-600 text-blue-500 focus:ring-blue-500"
                        />
                        <span className="text-sm text-white">{d.hostname}</span>
                        {d.operating_system && <span className="text-xs text-gray-500 ml-auto">{d.operating_system}</span>}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              {runOutput && (
                <pre className="bg-gray-950 text-green-400 p-3 rounded-lg text-xs font-mono overflow-x-auto max-h-64 whitespace-pre-wrap">
                  {runOutput}
                </pre>
              )}
            </div>
            <div className="p-5 border-t border-gray-700 flex justify-end gap-2">
              <button onClick={() => setShowRun(false)} className="px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-lg">
                Close
              </button>
              <button
                onClick={handleRun}
                disabled={runLoading || selectedAgents.length === 0}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {runLoading ? 'Running...' : `Run on ${selectedAgents.length} agent${selectedAgents.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ScriptLibrary
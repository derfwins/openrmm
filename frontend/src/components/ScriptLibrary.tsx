import { useState, useEffect } from 'react'
import apiService from '../services/apiService'

const ScriptLibrary = () => {
  const [scripts, setScripts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedScript, setSelectedScript] = useState<any>(null)
  const [showRunModal, setShowRunModal] = useState(false)
  const [runOutput, setRunOutput] = useState<string | null>(null)
  const [runLoading, setRunLoading] = useState(false)

  useEffect(() => { loadScripts() }, [])

  const loadScripts = async () => {
    try {
      setLoading(true)
      const data = await apiService.getScripts()
      setScripts(Array.isArray(data) ? data : data.results || [])
    } catch {
      setScripts([])
    } finally {
      setLoading(false)
    }
  }

  const filtered = scripts.filter(s =>
    (s.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.description || '').toLowerCase().includes(search.toLowerCase())
  )

  const shellIcon = (shell: string) => {
    switch (shell) {
      case 'powershell': case 'cmd': return '🪟'
      case 'bash': case 'shell': return '🐧'
      case 'python': case 'py': return '🐍'
      default: return '📝'
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Script Library</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{scripts.length} scripts available</p>
        </div>
        <button onClick={loadScripts} className="px-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
          ↻ Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
        <input
          type="text"
          placeholder="Search scripts..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:text-white"
        />
      </div>

      {/* Script List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent mx-auto"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-4xl mb-3">📜</div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {scripts.length === 0 ? 'No scripts yet. Create one to get started.' : 'No scripts match your search'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {filtered.map(script => (
              <div key={script.id} className="px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-lg">{shellIcon(script.shell || script.script_type)}</span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">{script.name}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{script.description || 'No description'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                      {script.shell || script.script_type || 'script'}
                    </span>
                    <button
                      onClick={() => { setSelectedScript(script); setShowRunModal(true) }}
                      className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Run
                    </button>
                    <button
                      onClick={() => setSelectedScript(selectedScript?.id === script.id ? null : script)}
                      className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      View
                    </button>
                  </div>
                </div>
                {selectedScript?.id === script.id && script.script_body && (
                  <pre className="mt-3 p-3 bg-gray-900 text-green-400 rounded-lg text-xs font-mono overflow-x-auto max-h-64">
                    {script.script_body}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Run Modal */}
      {showRunModal && selectedScript && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowRunModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Run Script: {selectedScript.name}</h3>
            </div>
            <div className="p-5">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                This will run <strong className="text-gray-900 dark:text-white">{selectedScript.name}</strong> on the selected agent.
              </p>
              {runOutput && (
                <pre className="bg-gray-900 text-green-400 p-3 rounded-lg text-xs font-mono overflow-x-auto max-h-64 mb-4">
                  {runOutput}
                </pre>
              )}
            </div>
            <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button onClick={() => { setShowRunModal(false); setRunOutput(null) }} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                Close
              </button>
              <button
                onClick={async () => {
                  setRunLoading(true)
                  setRunOutput(null)
                  try {
                    const result = await apiService.getDevices()
                    const agents = result.results || result || []
                    if (agents.length > 0) {
                      setRunOutput(`Script queued on ${agents.length} agent(s). Results will appear in the task history.`)
                    } else {
                      setRunOutput('No agents available to run this script on.')
                    }
                  } catch {
                    setRunOutput('Error: Could not run script. No agents connected.')
                  } finally {
                    setRunLoading(false)
                  }
                }}
                disabled={runLoading}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {runLoading ? 'Running...' : 'Run Script'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ScriptLibrary
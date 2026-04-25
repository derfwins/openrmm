import { useState } from 'react'
import { createClient, createSite } from '../services/clientService'
import { useClient } from '../contexts/ClientContext'
import { IconPlus, IconChevronRight } from './Icons'

export function Clients() {
  const { clients, selectClient, selectedClient, loading, refresh } = useClient()
  const [showAddClient, setShowAddClient] = useState(false)
  const [showAddSite, setShowAddSite] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [newSiteName, setNewSiteName] = useState('')
  const [saving, setSaving] = useState(false)
  const [expandedClient, setExpandedClient] = useState<number | null>(null)

  const handleCreateClient = async () => {
    if (!newClientName.trim()) return
    setSaving(true)
    try {
      await createClient({ name: newClientName.trim() })
      setShowAddClient(false)
      setNewClientName('')
      window.location.reload()
    } catch (e) {
      alert('Failed: ' + e)
    }
    setSaving(false)
  }

  const handleCreateSite = async () => {
    if (!expandedClient || !newSiteName.trim()) return
    setSaving(true)
    try {
      await createSite(expandedClient, { name: newSiteName.trim() })
      setShowAddSite(false)
      setNewSiteName('')
      window.location.reload()
    } catch (e) {
      alert('Failed: ' + e)
    }
    setSaving(false)
  }

  if (loading) return <div className="text-gray-400">Loading...</div>

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-white">Clients</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors flex items-center gap-1"
            title="Refresh"
          >
            ↻ Refresh
          </button>
          <button
            onClick={() => setShowAddClient(true)}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors flex items-center gap-2"
          >
            <IconPlus size={16} /> Add Client
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {clients.map(client => {
          const isExpanded = expandedClient === client.id
          const isSelected = selectedClient?.id === client.id
          return (
            <div key={client.id} className={`rounded-xl border transition-all duration-200 ${
              isSelected
                ? 'bg-blue-600/10 border-blue-500/30 shadow-lg shadow-blue-500/10'
                : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
            }`}>
              {/* Client header row */}
              <div className="flex items-center gap-3 px-5 py-4">
                <button
                  onClick={() => setExpandedClient(isExpanded ? null : client.id)}
                  className="text-gray-500 hover:text-gray-300 transition-transform duration-200"
                  style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                >
                  <IconChevronRight size={16} />
                </button>
                <button
                  onClick={() => selectClient(client)}
                  className="flex-1 text-left"
                >
                  <div className="text-white font-medium text-lg">{client.name}</div>
                  <div className="text-xs text-gray-400">
                    {client.sites?.length || 0} site{(client.sites?.length || 0) !== 1 ? 's' : ''}
                  </div>
                </button>
                {isSelected && (
                  <span className="text-xs text-blue-400 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    Selected
                  </span>
                )}
              </div>

              {/* Expanded: Sites list + Add Site */}
              {isExpanded && (
                <div className="border-t border-white/[0.06] px-5 py-3 space-y-1">
                  {(client.sites || []).length === 0 && (
                    <p className="text-xs text-gray-600 py-2">No sites yet. Add a site to enroll agents.</p>
                  )}
                  {(client.sites || []).map(site => (
                    <div
                      key={site.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.04]"
                    >
                      <div className="w-2 h-2 rounded-full bg-blue-500/50" />
                      <span className="text-sm text-gray-300">{site.name}</span>
                    </div>
                  ))}
                  <button
                    onClick={() => { setShowAddSite(true); setNewSiteName('') }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 transition-colors"
                  >
                    <IconPlus size={14} /> Add Site
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {clients.length === 0 && (
          <div className="flex items-center justify-center py-16 animate-[fadeIn_0.5s_ease-out]">
            <div className="w-64 rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-xl p-8 space-y-3 text-center">
              <h2 className="text-lg font-semibold text-white">No clients yet</h2>
              <p className="text-sm text-gray-400">Get started by adding your first client.</p>
              <button
                onClick={() => setShowAddClient(true)}
                className="inline-block px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
              >
                Add Client
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Client Modal */}
      {showAddClient && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowAddClient(false)}>
          <div className="bg-gray-900 border border-white/10 rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/[0.06]">
              <h2 className="text-lg font-semibold text-white">Add Client</h2>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Client Name</label>
                <input
                  type="text"
                  value={newClientName}
                  onChange={e => setNewClientName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateClient()}
                  placeholder="e.g. Acme Corporation"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/20"
                  autoFocus
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-white/[0.06] flex justify-end gap-2">
              <button onClick={() => setShowAddClient(false)} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleCreateClient} disabled={saving || !newClientName.trim()} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors">
                {saving ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Site Modal */}
      {showAddSite && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowAddSite(false)}>
          <div className="bg-gray-900 border border-white/10 rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/[0.06]">
              <h2 className="text-lg font-semibold text-white">Add Site</h2>
              <p className="text-xs text-gray-500 mt-1">
                for {clients.find(c => c.id === expandedClient)?.name}
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Site Name</label>
                <input
                  type="text"
                  value={newSiteName}
                  onChange={e => setNewSiteName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateSite()}
                  placeholder="e.g. Main Office, Data Center"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/20"
                  autoFocus
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-white/[0.06] flex justify-end gap-2">
              <button onClick={() => setShowAddSite(false)} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleCreateSite} disabled={saving || !newSiteName.trim()} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors">
                {saving ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

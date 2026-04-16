import { useState } from 'react'
import { createClient } from '../services/clientService'
import { useClient } from '../contexts/ClientContext'

export function Clients() {
  const { clients, selectClient, selectedClient, loading } = useClient()
  const [showModal, setShowModal] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    if (!newClientName.trim()) return
    setSaving(true)
    try {
      await createClient({ name: newClientName.trim() })
      setShowModal(false)
      setNewClientName('')
      window.location.reload() // Refresh to get updated list
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
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
        >
          Add Client
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clients.map(client => (
          <button
            key={client.id}
            onClick={() => selectClient(client)}
            className={`text-left p-5 rounded-xl border transition-all duration-200 ${
              selectedClient?.id === client.id
                ? 'bg-blue-600/10 border-blue-500/30 shadow-lg shadow-blue-500/10'
                : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
            }`}
          >
            <div className="text-white font-medium text-lg mb-1">{client.name}</div>
            <div className="text-xs text-gray-400">
              {client.sites?.length || 0} site{client.sites?.length !== 1 ? 's' : ''}
            </div>
            {selectedClient?.id === client.id && (
              <div className="mt-3 text-xs text-blue-400 flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                Selected
              </div>
            )}
          </button>
        ))}
        {clients.length === 0 && (
          <div className="col-span-full flex items-center justify-center py-16 animate-[fadeIn_0.5s_ease-out]">
            <div className="w-64 rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-xl p-8 space-y-3 text-center">
              <div className="text-5xl">🏢</div>
              <h2 className="text-lg font-semibold text-white">No clients yet</h2>
              <p className="text-sm text-gray-400">Get started by adding your first client.</p>
              <button
                onClick={() => setShowModal(true)}
                className="inline-block px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
              >
                Add Client
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Client Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
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
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  placeholder="e.g. Acme Corporation"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/20"
                  autoFocus
                />
              </div>
              <p className="text-xs text-gray-500">You can add sites to this client later.</p>
            </div>
            <div className="px-5 py-4 border-t border-white/[0.06] flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleCreate} disabled={saving || !newClientName.trim()} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors">
                {saving ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
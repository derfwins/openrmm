import { API_BASE_URL } from '../config'
import { useState, useEffect } from 'react'
import apiService from '../services/apiService'

interface Site {
  id: number
  name: string
  client: number
  client_name: string
  agent_count?: number
}

interface Client {
  id: number
  name: string
  sites: Site[]
  agent_count?: number
}

const Clients = () => {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddClient, setShowAddClient] = useState(false)
  const [showAddSite, setShowAddSite] = useState<number | null>(null)
  const [newClientName, setNewClientName] = useState('')
  const [newClientSiteName, setNewClientSiteName] = useState('')
  const [newSiteName, setNewSiteName] = useState('')
  const [newSiteClientId, setNewSiteClientId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [expandedClient, setExpandedClient] = useState<number | null>(null)
  const [error, setError] = useState('')

  const token = localStorage.getItem('token')
  const apiUrl = window.location.hostname === 'localhost'
    ? 'http://10.10.0.122:8000'
    : `${window.location.protocol}//${window.location.hostname}:8000`

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  }

  const fetchClients = async () => {
    try {
      const resp = await fetch(`${apiUrl}/clients/`, { headers })
      const data = await resp.json()
      setClients(data)
    } catch (err) {
      setError('Failed to load clients')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchClients() }, [])

  const addClient = async () => {
    if (!newClientName.trim() || !newClientSiteName.trim()) return
    setSaving(true)
    try {
      const resp = await fetch(`${apiUrl}/clients/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          client: { name: newClientName.trim() },
          site: { name: newClientSiteName.trim() },
        }),
      })
      if (!resp.ok) {
        const err = await resp.json()
        setError(typeof err === 'object' ? JSON.stringify(err) : 'Failed to add client')
        setSaving(false)
        return
      }
      setShowAddClient(false)
      setNewClientName('')
      setNewClientSiteName('')
      await fetchClients()
    } catch {
      setError('Failed to add client')
    }
    setSaving(false)
  }

  const addSite = async () => {
    if (!newSiteName.trim() || !newSiteClientId) return
    setSaving(true)
    try {
      const resp = await fetch(`${apiUrl}/clients/sites/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          site: { client: newSiteClientId, name: newSiteName.trim() },
        }),
      })
      if (!resp.ok) {
        const err = await resp.json()
        setError(typeof err === 'object' ? JSON.stringify(err) : 'Failed to add site')
        setSaving(false)
        return
      }
      setShowAddSite(null)
      setNewSiteName('')
      setNewSiteClientId(null)
      await fetchClients()
    } catch {
      setError('Failed to add site')
    }
    setSaving(false)
  }

  const deleteClient = async (id: number, name: string) => {
    if (!confirm(`Delete client "${name}" and all its sites?`)) return
    try {
      await fetch(`${apiUrl}/clients/${id}/`, { method: 'DELETE', headers })
      await fetchClients()
    } catch {
      setError('Failed to delete client')
    }
  }

  const deleteSite = async (id: number, name: string) => {
    if (!confirm(`Delete site "${name}"?`)) return
    try {
      await fetch(`${apiUrl}/clients/sites/${id}/`, { method: 'DELETE', headers })
      await fetchClients()
    } catch {
      setError('Failed to delete site')
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Clients & Sites</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Organize your managed devices by client and site</p>
        </div>
        <button
          onClick={() => setShowAddClient(true)}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <span>+</span> Add Client
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-600 dark:text-red-400 text-sm flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-300">✕</button>
        </div>
      )}

      {/* Add Client Modal */}
      {showAddClient && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">New Client</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client Name</label>
              <input
                type="text"
                value={newClientName}
                onChange={e => setNewClientName(e.target.value)}
                placeholder="e.g. Acme Corp"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Initial Site Name</label>
              <input
                type="text"
                value={newClientSiteName}
                onChange={e => setNewClientSiteName(e.target.value)}
                placeholder="e.g. Headquarters"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={addClient} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Create Client'}
            </button>
            <button onClick={() => { setShowAddClient(false); setNewClientName(''); setNewClientSiteName('') }} className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add Site under Client */}
      {showAddSite !== null && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            Add Site to {clients.find(c => c.id === showAddSite)?.name}
          </h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Site Name</label>
            <input
              type="text"
              value={newSiteName}
              onChange={e => setNewSiteName(e.target.value)}
              placeholder="e.g. Branch Office"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={addSite} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Add Site'}
            </button>
            <button onClick={() => { setShowAddSite(null); setNewSiteName('') }} className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Client List */}
      {clients.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <p className="text-gray-400 dark:text-gray-500 text-lg">No clients yet</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Add a client to start organizing your devices</p>
        </div>
      ) : (
        <div className="space-y-3">
          {clients.map(client => (
            <div key={client.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {/* Client Header */}
              <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                onClick={() => setExpandedClient(expandedClient === client.id ? null : client.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 dark:text-gray-500 text-sm transition-transform" style={{ transform: expandedClient === client.id ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{client.name}</h3>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{(client.sites || []).length} site{(client.sites || []).length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={e => { e.stopPropagation(); setShowAddSite(client.id); setNewSiteClientId(client.id) }}
                    className="px-2.5 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    + Site
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); deleteClient(client.id, client.name) }}
                    className="px-2.5 py-1 text-xs bg-red-500/10 text-red-600 dark:text-red-400 rounded-md hover:bg-red-500/20"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Sites */}
              {expandedClient === client.id && (client.sites || []).length > 0 && (
                <div className="border-t border-gray-200 dark:border-gray-700">
                  {(client.sites || []).map((site: any) => (
                    <div key={site.id} className="flex items-center justify-between px-5 py-3 pl-12 border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 dark:text-gray-500">📍</span>
                        <span className="text-sm text-gray-700 dark:text-gray-300">{site.name}</span>
                        {site.agent_count !== undefined && (
                          <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                            {site.agent_count} agent{site.agent_count !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => deleteSite(site.id, site.name)}
                        className="px-2 py-1 text-xs text-red-500 hover:text-red-400"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {expandedClient === client.id && (client.sites || []).length === 0 && (
                <div className="border-t border-gray-200 dark:border-gray-700 px-5 py-3 pl-12 text-sm text-gray-400">
                  No sites — click "+ Site" to add one
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Clients
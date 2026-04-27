import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import type { Client, Site } from '../services/clientService'
import { getClients } from '../services/clientService'

interface ClientContextValue {
  clients: Client[]
  selectedClient: Client | null
  selectedSite: Site | null
  selectClient: (client: Client | null) => void
  selectSite: (site: Site | null) => void
  loading: boolean
  refresh: () => void
}

const ClientContext = createContext<ClientContextValue | null>(null)

export function ClientProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [selectedSite, setSelectedSite] = useState<Site | null>(null)
  const [loading, setLoading] = useState(true)
  const [authFailed, setAuthFailed] = useState(false)

  // Refs so load() can read current selection without capturing stale closures
  const selectedClientRef = useRef(selectedClient)
  const selectedSiteRef = useRef(selectedSite)
  selectedClientRef.current = selectedClient
  selectedSiteRef.current = selectedSite

  const load = useCallback(async () => {
    // Don't poll if we have no token — avoid 401 flood
    const token = localStorage.getItem('token')
    if (!token) {
      setLoading(false)
      setAuthFailed(true)
      return
    }

    setLoading(true)
    try {
      const data = await getClients()
      setClients(data)
      setAuthFailed(false)  // Reset on success
      // Preserve selection if client still exists (reading from refs)
      const currentClient = selectedClientRef.current
      const currentSite = selectedSiteRef.current
      if (currentClient) {
        const still = data.find(c => c.id === currentClient.id)
        if (still) {
          setSelectedClient(still)
          if (currentSite) {
            const s = still.sites?.find(s => s.id === currentSite.id)
            if (s) setSelectedSite(s)
          }
        } else {
          setSelectedClient(null)
          setSelectedSite(null)
        }
      }
    } catch (e) {
      console.error('Failed to load clients:', e)
      // handleUnauthorized in clientService will redirect to login on 401/403
      // Stop polling to avoid hammering the server
      setAuthFailed(true)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (authFailed) return  // Stop polling if auth failed
    load()
    const iv = setInterval(load, 30000)
    return () => clearInterval(iv)
  }, [load, authFailed])

  const selectClient = useCallback((client: Client | null) => {
    setSelectedClient(client)
    setSelectedSite(null)
    // Persist to localStorage
    if (client) localStorage.setItem('selected_client_id', String(client.id))
    else localStorage.removeItem('selected_client_id')
  }, [])

  const selectSite = useCallback((site: Site | null) => {
    setSelectedSite(site)
    if (site) localStorage.setItem('selected_site_id', String(site.id))
    else localStorage.removeItem('selected_site_id')
  }, [])

  // Restore selection on mount
  useEffect(() => {
    if (clients.length > 0 && !selectedClient) {
      const savedId = localStorage.getItem('selected_client_id')
      if (savedId) {
        const c = clients.find(c => c.id === parseInt(savedId))
        if (c) {
          setSelectedClient(c)
          const savedSiteId = localStorage.getItem('selected_site_id')
          if (savedSiteId) {
            const s = c.sites?.find(s => s.id === parseInt(savedSiteId))
            if (s) setSelectedSite(s)
          }
        }
      }
    }
  }, [clients])

  return (
    <ClientContext.Provider value={{ clients, selectedClient, selectedSite, selectClient, selectSite, loading, refresh: load }}>
      {children}
    </ClientContext.Provider>
  )
}

export function useClient() {
  const ctx = useContext(ClientContext)
  if (!ctx) throw new Error('useClient must be used within ClientProvider')
  return ctx
}
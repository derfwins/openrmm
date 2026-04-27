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

  // Refs so load() can read current selection without capturing stale closures
  const selectedClientRef = useRef(selectedClient)
  const selectedSiteRef = useRef(selectedSite)
  selectedClientRef.current = selectedClient
  selectedSiteRef.current = selectedSite

  const load = useCallback(async () => {
    // Don't fetch if we have no token — skip silently
    const token = localStorage.getItem('token')
    if (!token) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const data = await getClients()
      setClients(data)
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
    }
    setLoading(false)
  }, [])

  // Poll every 30s. load() will skip if no token, so this is safe even when logged out.
  // When login sets the token, the next interval or navigation-triggered refresh will pick it up.
  useEffect(() => {
    load()
    const iv = setInterval(load, 30000)
    return () => clearInterval(iv)
  }, [load])

  // Also listen for storage events (cross-tab) and custom login event (same-tab)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'token') {
        // Token changed (login/logout in another tab, or set by login page)
        if (e.newValue) load()  // Token appeared — refresh
        else setClients([])     // Token removed — clear data
      }
    }
    // Custom event fired by Login after setting token
    const onLogin = () => load()

    window.addEventListener('storage', onStorage)
    window.addEventListener('auth-login', onLogin)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('auth-login', onLogin)
    }
  }, [load])

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
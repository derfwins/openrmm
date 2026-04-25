import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
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

  const load = useCallback(async () => {
    try {
      const data = await getClients()
      setClients(data)
      // Preserve selection if client still exists
      if (selectedClient) {
        const still = data.find(c => c.id === selectedClient.id)
        if (still) {
          setSelectedClient(still)
          if (selectedSite) {
            const s = still.sites?.find(s => s.id === selectedSite.id)
            if (s) setSelectedSite(s)
          }
        } else {
          setSelectedClient(null)
          setSelectedSite(null)
        }
      }
    } catch (e) {
      console.error('Failed to load clients:', e)
    }
    setLoading(false)
  }, [selectedClient?.id, selectedSite?.id])

  useEffect(() => {
    load()
    const iv = setInterval(load, 30000)
    return () => clearInterval(iv)
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
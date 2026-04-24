import { useState, useEffect } from 'react'
import type { Device } from '../types/device'
import apiService from '../services/apiService'
import wsService from '../services/websocketService'

const STALE_THRESHOLD_MS = 3 * 60 * 1000 // 3 minutes — same as backend

function deriveStatus(agent: Record<string, unknown>): Device['status'] {
  const rawStatus = String(agent.status || 'offline')
  // If backend says online, verify with last_seen timestamp
  if (rawStatus === 'online' || rawStatus === 'overdue') {
    const lastSeen = agent.last_seen ? new Date(String(agent.last_seen)) : null
    const now = Date.now()
    const staleMs = now - (lastSeen ? lastSeen.getTime() : 0)
    if (!lastSeen || staleMs > 15 * 60 * 1000) {
      return 'offline'  // No heartbeat for 15+ min → offline
    }
    if (staleMs > STALE_THRESHOLD_MS) {
      return 'warning'  // 3-15 min overdue → warning (yellow)
    }
    return 'online'
  }
  if (rawStatus === 'offline') return 'offline'
  if (rawStatus === 'warning') return 'warning'
  return 'offline'
}

export const useDevices = () => {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    loadDevices()

    const token = localStorage.getItem('token')
    if (token) {
      wsService.connect(token)

      wsService.onConnectionChange((connected) => {
        setIsConnected(connected)
      })

      wsService.subscribe('agents', (data: unknown) => {
        const update = data as Device
        setDevices(prev => prev.map(d => d.id === update.id ? update : d))
      })
    }

    // Refresh every 30 seconds
    const interval = setInterval(loadDevices, 30000)

    return () => {
      wsService.disconnect()
      clearInterval(interval)
    }
  }, [])

  const loadDevices = async () => {
    try {
      setLoading(true)
      const data = await apiService.getDevices()
      const transformedDevices = data.results?.map((agent: Record<string, unknown>) => ({
        id: String(agent.id || agent.agent_id || ''),
        name: String(agent.hostname || agent.name || 'Unknown'),
        status: deriveStatus(agent),
        type: String(agent.monitoring_type || agent.type || 'workstation') as Device['type'],
        platform: String(agent.plat || agent.platform || 'windows') as Device['platform'],
        last_seen: String(agent.last_seen || new Date().toISOString()),
        cpu_usage: Number(agent.cpu_usage || 0),
        memory_usage: Number(agent.memory_usage || 0),
        disk_usage: Number(agent.disk_usage || 0),
        ip: String(agent.local_ip || agent.public_ip || agent.ip || ''),
        site: String(agent.site || ''),
        client: String(agent.client || ''),
      })) || (Array.isArray(data) ? data : [])

      setDevices(transformedDevices)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load devices')
    } finally {
      setLoading(false)
    }
  }

  return { devices, loading, error, isConnected, refresh: loadDevices }
}

export default useDevices
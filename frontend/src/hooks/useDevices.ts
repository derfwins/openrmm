import { useState, useEffect } from 'react'
import type { Device } from '../types/device'
import apiService from '../services/apiService'
import wsService from '../services/websocketService'

export const useDevices = () => {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    // Load initial devices
    loadDevices()

    // Setup WebSocket for real-time updates
    const token = localStorage.getItem('token')
    if (token) {
      wsService.connect(token)
      
      wsService.on('connected', () => {
        setIsConnected(true)
        console.log('WebSocket connected')
      })

      wsService.on('disconnected', () => {
        setIsConnected(false)
        console.log('WebSocket disconnected')
      })

      wsService.on('device_update', (data: Device) => {
        updateDevice(data)
      })

      wsService.on('device_offline', (data: { device_id: string }) => {
        markDeviceOffline(data.device_id)
      })
    }

    return () => {
      wsService.disconnect()
    }
  }, [])

  const loadDevices = async () => {
    try {
      setLoading(true)
      const data = await apiService.getDevices()
      // Transform Tactical RMM format to our format
      const transformedDevices = data.results?.map((agent: any) => ({
        id: agent.agent_id,
        name: agent.hostname,
        status: agent.status === 'online' ? 'online' : 'offline',
        type: agent.monitoring_type === 'server' ? 'server' : 'workstation',
        platform: agent.plat === 'windows' ? 'windows' : agent.plat === 'darwin' ? 'macos' : 'linux',
        last_seen: agent.last_seen,
        cpu_usage: agent.checks?.cpu_percent || 0,
        memory_usage: agent.checks?.memory_percent || 0,
        disk_usage: agent.checks?.disk_usage || 0,
        ip: agent.wan_ip || agent.local_ip,
        site: agent.site_name || 'Default',
        client: agent.client_name || 'Internal',
      })) || []
      setDevices(transformedDevices)
    } catch (err) {
      setError('Failed to load devices')
      console.error('Load devices error:', err)
    } finally {
      setLoading(false)
    }
  }

  const updateDevice = (updatedDevice: Device) => {
    setDevices(prev => 
      prev.map(device => 
        device.id === updatedDevice.id ? updatedDevice : device
      )
    )
  }

  const markDeviceOffline = (deviceId: string) => {
    setDevices(prev =>
      prev.map(device =>
        device.id === deviceId 
          ? { ...device, status: 'offline' as const }
          : device
      )
    )
  }

  const refreshDevices = () => {
    loadDevices()
  }

  const onlineCount = devices.filter(d => d.status === 'online').length
  const offlineCount = devices.filter(d => d.status === 'offline').length

  return {
    devices,
    loading,
    error,
    isConnected,
    onlineCount,
    offlineCount,
    refreshDevices,
  }
}

export default useDevices

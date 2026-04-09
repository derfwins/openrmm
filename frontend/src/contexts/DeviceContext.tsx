// Device context for managing selected device across components
import React, { createContext, useContext, useState } from 'react'
import type { Device } from '../types/device'

interface DeviceContextType {
  selectedDevice: Device | null
  setSelectedDevice: (device: Device | null) => void
  refreshSelectedDevice: () => Promise<void>
}

const DeviceContext = createContext<DeviceContextType | undefined>(undefined)

export const DeviceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)

  const refreshSelectedDevice = async () => {
    // TODO: Implement refresh logic
    console.log('Refreshing selected device...')
  }

  return (
    <DeviceContext.Provider value={{ selectedDevice, setSelectedDevice, refreshSelectedDevice }}>
      {children}
    </DeviceContext.Provider>
  )
}

export const useDeviceContext = () => {
  const context = useContext(DeviceContext)
  if (!context) {
    throw new Error('useDeviceContext must be used within DeviceProvider')
  }
  return context
}

export default DeviceContext

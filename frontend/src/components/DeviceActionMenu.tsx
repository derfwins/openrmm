import { useState } from 'react'
import type { Device } from '../types/device'
import apiService from '../services/apiService'

interface DeviceActionMenuProps {
  device: Device
  onAction: (action: string) => void
}

const DeviceActionMenu = ({ device, onAction }: DeviceActionMenuProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const actions = [
    { id: 'remote', label: 'Remote Control', icon: '🖥️' },
    { id: 'command', label: 'Send Command', icon: '⌨️' },
    { id: 'script', label: 'Run Script', icon: '📜' },
    { id: 'reboot', label: 'Reboot', icon: '🔄' },
    { id: 'shutdown', label: 'Shutdown', icon: '⏻️' },
    { id: 'wake', label: 'Wake on LAN', icon: '⚡' },
  ]

  const handleAction = async (actionId: string) => {
    setLoading(true)
    onAction(actionId)
    
    try {
      switch (actionId) {
        case 'remote':
          // Open remote desktop
          window.open(`/remote/${device.id}`, '_blank')
          break
        case 'reboot':
          await apiService.sendCommand(device.id, 'shutdown /r /t 0', 'powershell')
          break
        case 'shutdown':
          await apiService.sendCommand(device.id, 'shutdown /s /t 0', 'powershell')
          break
      }
    } catch (error) {
      console.error('Action failed:', error)
    } finally {
      setLoading(false)
      setIsOpen(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
        disabled={loading}
      >
        ⋮
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
            {actions.map((action) => (
              <button
                key={action.id}
                onClick={() => handleAction(action.id)}
                className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2"
                disabled={loading}
              >
                <span>{action.icon}</span>
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default DeviceActionMenu

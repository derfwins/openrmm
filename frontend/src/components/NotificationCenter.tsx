import { useState } from 'react'
import type { ReactNode } from 'react'

interface Notification {
  id: string
  type: 'alert' | 'task' | 'system'
  title: string
  description: string
  timestamp: string
  read: boolean
}

const mockNotifications: Notification[] = [
  { id: '1', type: 'alert', title: 'Critical: Disk Space Low', description: 'DESKTOP-460RMO6 has less than 10% disk space', timestamp: new Date(Date.now() - 300000).toISOString(), read: false },
  { id: '2', type: 'task', title: 'Script Completed', description: 'Disk cleanup finished on 3 devices', timestamp: new Date(Date.now() - 1800000).toISOString(), read: false },
  { id: '3', type: 'system', title: 'Agent Online', description: 'fhowland-plex reconnected', timestamp: new Date(Date.now() - 3600000).toISOString(), read: true },
  { id: '4', type: 'alert', title: 'Patch Available', description: '8 critical patches pending approval', timestamp: new Date(Date.now() - 7200000).toISOString(), read: true },
]

interface Props {
  children?: ReactNode
}

const NotificationCenter = ({ children }: Props) => {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState(mockNotifications)
  const [filter, setFilter] = useState<'all' | 'alert' | 'task' | 'system'>('all')

  const unreadCount = notifications.filter(n => !n.read).length

  const filteredNotifications = filter === 'all'
    ? notifications
    : notifications.filter(n => n.type === filter)

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const markRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'alert': return '🔔'
      case 'task': return '✅'
      case 'system': return '⚙️'
      default: return '📌'
    }
  }

  const formatTime = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return new Date(ts).toLocaleDateString()
  }

  return (
    <>
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-1.5 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-gray-200"
        title="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-gray-800 rounded-xl shadow-2xl border border-gray-700 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
            <h3 className="font-semibold text-white text-sm">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-blue-400 hover:text-blue-300">
                  Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white text-xs">✕</button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex border-b border-gray-700">
            {(['all', 'alert', 'task', 'system'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  filter === f ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f === 'alert' && unreadCount > 0 && (
                  <span className="ml-1 px-1 py-0.5 bg-red-500/20 text-red-400 rounded-full text-[10px]">{unreadCount}</span>
                )}
              </button>
            ))}
          </div>

          {/* Notification List */}
          <div className="max-h-80 overflow-y-auto">
            {filteredNotifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500 text-sm">
                No notifications
              </div>
            ) : (
              filteredNotifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-700/50 transition-colors border-b border-gray-700/50 ${
                    !n.read ? 'bg-blue-500/5' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg mt-0.5">{getNotificationIcon(n.type)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${!n.read ? 'text-white' : 'text-gray-300'}`}>
                          {n.title}
                        </span>
                        {!n.read && <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{n.description}</p>
                      <p className="text-xs text-gray-600 mt-1">{formatTime(n.timestamp)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
      {children}
    </>
  )
}

export default NotificationCenter
export interface Alert {
  id: string
  severity: 'critical' | 'warning' | 'info'
  message: string
  deviceId?: string
  timestamp: string
  acknowledged: boolean
}

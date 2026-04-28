import type { ReactNode } from 'react'
import {
  IconDashboard, IconDevices, IconClients, IconInstall, IconAlerts,
  IconScripts, IconAutomation, IconSoftware, IconPatches, IconReports,
  IconAI, IconAudit, IconLock, IconMonitor, IconBell, IconWrench,
  IconClipboardList, IconGear, IconChartBar, IconCheck, IconKeyboard,
  IconDesktop, IconSearch, IconTerminal, IconUsers, IconCopy
} from '../components/Icons'

// Map of icon name → component factory (size param for flexibility)
const iconComponents: Record<string, ({ size }: { size: number }) => ReactNode> = {
  dashboard: ({ size }) => <IconDashboard size={size} />,
  devices: ({ size }) => <IconDevices size={size} />,
  clients: ({ size }) => <IconClients size={size} />,
  install: ({ size }) => <IconInstall size={size} />,
  alerts: ({ size }) => <IconAlerts size={size} />,
  scripts: ({ size }) => <IconScripts size={size} />,
  automation: ({ size }) => <IconAutomation size={size} />,
  software: ({ size }) => <IconSoftware size={size} />,
  patches: ({ size }) => <IconPatches size={size} />,
  reports: ({ size }) => <IconReports size={size} />,
  ai: ({ size }) => <IconAI size={size} />,
  audit: ({ size }) => <IconAudit size={size} />,
  lock: ({ size }) => <IconLock size={size} />,
  monitor: ({ size }) => <IconMonitor size={size} />,
  desktop: ({ size }) => <IconDesktop size={size} />,
  bell: ({ size }) => <IconBell size={size} />,
  wrench: ({ size }) => <IconWrench size={size} />,
  clipboard: ({ size }) => <IconClipboardList size={size} />,
  gear: ({ size }) => <IconGear size={size} />,
  chart: ({ size }) => <IconChartBar size={size} />,
  check: ({ size }) => <IconCheck size={size} />,
  keyboard: ({ size }) => <IconKeyboard size={size} />,
  search: ({ size }) => <IconSearch size={size} />,
  terminal: ({ size }) => <IconTerminal size={size} />,
  users: ({ size }) => <IconUsers size={size} />,
  copy: ({ size }) => <IconCopy size={size} />,
}

export function getIcon(name: string, size: number = 18): ReactNode {
  const factory = iconComponents[name]
  return factory ? factory({ size }) : name
}

export default iconComponents
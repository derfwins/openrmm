import type { ReactNode } from 'react'
import {
  IconDashboard, IconDevices, IconClients, IconInstall, IconAlerts,
  IconScripts, IconAutomation, IconSoftware, IconPatches, IconReports,
  IconAI, IconAudit, IconLock, IconMonitor, IconBell, IconWrench,
  IconClipboardList, IconGear, IconChartBar, IconCheck, IconKeyboard,
  IconDesktop, IconSearch, IconTerminal, IconUsers, IconCopy
} from '../components/Icons'

const iconMap: Record<string, ReactNode> = {
  dashboard: <IconDashboard size={18} />,
  devices: <IconDevices size={18} />,
  clients: <IconClients size={18} />,
  install: <IconInstall size={18} />,
  alerts: <IconAlerts size={18} />,
  scripts: <IconScripts size={18} />,
  automation: <IconAutomation size={18} />,
  software: <IconSoftware size={18} />,
  patches: <IconPatches size={18} />,
  reports: <IconReports size={18} />,
  ai: <IconAI size={18} />,
  audit: <IconAudit size={18} />,
  lock: <IconLock size={18} />,
  monitor: <IconMonitor size={18} />,
  desktop: <IconDesktop size={18} />,
  bell: <IconBell size={18} />,
  wrench: <IconWrench size={18} />,
  clipboard: <IconClipboardList size={18} />,
  gear: <IconGear size={18} />,
  chart: <IconChartBar size={18} />,
  check: <IconCheck size={18} />,
  keyboard: <IconKeyboard size={18} />,
  search: <IconSearch size={18} />,
  terminal: <IconTerminal size={18} />,
  users: <IconUsers size={18} />,
  copy: <IconCopy size={18} />,
}

export function getIcon(name: string, size: number = 18): ReactNode {
  return iconMap[name] || name
}

export default iconMap
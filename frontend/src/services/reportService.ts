import type { Report, ReportSchedule, ReportType, ReportDateRange, ReportFilters } from '../types/report'
import { API_BASE_URL } from '../config'

// Auto-logout on 401
const handleUnauthorized = (res: Response) => {
  if (res.status === 401) {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    window.location.href = '/login'
    return true
  }
  return false
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token')
  const res = await fetch(`${API_BASE_URL}/openrmm${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  })
  if (handleUnauthorized(res)) throw new Error('Session expired')
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  return res.json()
}

export async function generateReport(
  type: ReportType,
  date_range: ReportDateRange,
  filters: ReportFilters,
  format: 'pdf' | 'csv'
): Promise<Report> {
  return request<Report>('/reports/generate/', {
    method: 'POST',
    body: JSON.stringify({ type, date_range, filters, format }),
  })
}

export async function listReports(): Promise<Report[]> {
  return request<Report[]>('/reports/')
}

export async function downloadReport(reportId: string): Promise<Blob> {
  const token = localStorage.getItem('token')
  const res = await fetch(`${API_BASE_URL}/openrmm/reports/${reportId}/download/`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (handleUnauthorized(res)) throw new Error('Session expired')
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  return res.blob()
}

export async function listSchedules(): Promise<ReportSchedule[]> {
  return request<ReportSchedule[]>('/report-schedules/')
}

export async function createSchedule(schedule: Omit<ReportSchedule, 'id' | 'last_run' | 'next_run' | 'created_at'>): Promise<ReportSchedule> {
  return request<ReportSchedule>('/report-schedules/', {
    method: 'POST',
    body: JSON.stringify(schedule),
  })
}

export async function deleteSchedule(id: string): Promise<void> {
  await request(`/report-schedules/${id}/`, { method: 'DELETE' })
}

export async function toggleSchedule(id: string, enabled: boolean): Promise<ReportSchedule> {
  return request<ReportSchedule>(`/report-schedules/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  })
}
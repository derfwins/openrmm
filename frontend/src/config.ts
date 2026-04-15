// Shared configuration for API URLs
// Detects environment and constructs appropriate URLs

function getApiBaseUrl(): string {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL
  const h = window.location.hostname
  if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:8000'
  // If on app/rmmapp subdomain, API is on the SAME host (nginx proxies it)
  if (h.startsWith('rmmapp.') || h.startsWith('app.')) {
    return `${window.location.protocol}//${window.location.host}`
  }
  // Otherwise assume API is same host, port 8000
  return `${window.location.protocol}//${h}:8000`
}

export const API_BASE_URL = getApiBaseUrl()
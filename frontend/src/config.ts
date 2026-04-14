// Shared configuration for API URLs
// Detects environment and constructs appropriate URLs

function getApiBaseUrl(): string {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL
  const h = window.location.hostname
  if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:8000'
  // If on app/rmmapp subdomain, assume API is on the base domain (strip 'app' prefix)
  if (h.startsWith('rmmapp.') || h.startsWith('app.')) {
    return `${window.location.protocol}//${h.replace(/^rmmapp\./, 'rmm.').replace(/^app\./, '')}`
  }
  // Otherwise assume API is same host, port 8000
  return `${window.location.protocol}//${h}:8000`
}

export const API_BASE_URL = getApiBaseUrl()
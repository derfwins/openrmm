import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../config'

interface CoreSettings {
  id: number
  company_name: string
  timezone: string
  date_format: string
  agent_auto_update: boolean
  api_url: string
  frontend_url: string
  mesh_site: string
  mesh_username: string
  mesh_token_key: string
  mesh_device_group: string
  mesh_sync: boolean
  smtp_host: string
  smtp_port: number
  smtp_username: string
  smtp_password: string
  smtp_from: string
  smtp_use_tls: boolean
  alert_warning: boolean
  alert_info: boolean
  server_scripts: boolean
  web_terminal: boolean
  enable_sso: boolean
  debug_level: number
  data_retention_days: number
  openai_api_key: string
  ai_model: string
  all_timezones?: string[]
}

const Settings = () => {
  const [activeTab, setActiveTab] = useState<string>('domain')
  const [settings, setSettings] = useState<CoreSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [apiDomain, setApiDomain] = useState('')
  const [uiDomain, setUiDomain] = useState('')
  const [meshDomain, setMeshDomain] = useState('')

  const token = localStorage.getItem('token')
  const serverBase = API_BASE_URL

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  }

  const fetchSettings = async () => {
    try {
      const resp = await fetch(`${serverBase}/core/settings/`, { headers })
      const data = await resp.json()
      setSettings(data)
      if (data.mesh_site) {
        try {
          const url = new URL(data.mesh_site)
          setMeshDomain(url.hostname)
        } catch {
          setMeshDomain(data.mesh_site.replace(/^https?:\/\//, ''))
        }
      }
      const apiHost = serverBase.replace(/^https?:\/\//, '')
      if (!apiDomain) setApiDomain(apiHost)
    } catch {
      setError('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSettings() }, [])

  const update = (key: string, value: any) => {
    if (!settings) return
    setSettings({ ...settings, [key]: value } as CoreSettings)
  }

  const saveSettings = async () => {
    if (!settings) return
    setSaving(true)
    setError('')
    try {
      const resp = await fetch(`${serverBase}/core/settings/`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(settings),
      })
      if (!resp.ok) {
        const err = await resp.json()
        setError(typeof err === 'object' ? JSON.stringify(err) : 'Save failed')
        setSaving(false)
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setError('Failed to save settings')
    }
    setSaving(false)
  }

  const applyDomain = async () => {
    if (!settings || !apiDomain.trim()) return
    setSaving(true)
    setError('')
    try {
      const meshSite = meshDomain.trim() ? `https://${meshDomain.trim()}` : settings.mesh_site
      const updated = {
        ...settings,
        api_url: `https://${apiDomain.trim()}`,
        frontend_url: uiDomain.trim() ? `https://${uiDomain.trim()}` : settings.frontend_url,
        mesh_site: meshSite,
      }
      const resp = await fetch(`${serverBase}/core/settings/`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updated),
      })
      if (!resp.ok) {
        setError('Failed to save domain settings')
        setSaving(false)
        return
      }
      setSettings(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Failed to apply domain')
    }
    setSaving(false)
  }

  const tabs = [
    { id: 'domain', label: 'Domain', icon: '🌐' },
    { id: 'general', label: 'General', icon: '⚙️' },
    { id: 'mesh', label: 'Mesh Central', icon: '🔗' },
    { id: 'email', label: 'Email', icon: '📧' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'security', label: 'Security', icon: '🔒' },
    { id: 'ai', label: 'AI', icon: '🤖' },
  ]

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <p className="text-red-500">Failed to load settings</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Configure OpenRMM</p>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-600 dark:text-red-400 text-sm flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-300">✕</button>
        </div>
      )}

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-48 shrink-0">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-2 space-y-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-2 text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">

          {/* ===== DOMAIN TAB ===== */}
          {activeTab === 'domain' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Custom Domains</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Set domains for each service — Cloudflare handles SSL, DNS, and tunneling</p>
              </div>

              <div className="space-y-5">
                {/* API Domain */}
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-medium text-blue-700 dark:text-blue-400">🖥️ API Backend</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">FastAPI backend, REST API, and admin. Agents connect here.</p>
                  <input
                    type="text"
                    value={apiDomain}
                    onChange={e => setApiDomain(e.target.value)}
                    placeholder="rmm.derfwins.com"
                    className="w-full px-4 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white"
                  />
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>Cloudflare tunnel →</span>
                    <code>http://localhost:8000</code>
                  </div>
                </div>

                {/* UI Domain */}
                <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-medium text-green-700 dark:text-green-400">🎨 Frontend UI</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">React dashboard and web interface</p>
                  <input
                    type="text"
                    value={uiDomain}
                    onChange={e => setUiDomain(e.target.value)}
                    placeholder="rmmapp.derfwins.com"
                    className="w-full px-4 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white"
                  />
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>Cloudflare tunnel →</span>
                    <code>http://localhost:5173</code>
                  </div>
                </div>

                {/* Mesh Domain */}
                <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-medium text-purple-700 dark:text-purple-400">🔗 Mesh Central</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Remote desktop, terminal, and file transfer</p>
                  <input
                    type="text"
                    value={meshDomain}
                    onChange={e => setMeshDomain(e.target.value)}
                    placeholder="mesh.derfwins.com"
                    className="w-full px-4 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white"
                  />
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>Cloudflare tunnel →</span>
                    <code>http://localhost:8080</code>
                  </div>
                </div>

                {/* Cloudflare Docs */}
                <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-medium text-orange-700 dark:text-orange-400">☁️ Cloudflare Tunnel Setup</h3>
                  <div className="text-sm text-gray-600 dark:text-gray-400 space-y-3">
                    <p>For each domain above, create a tunnel in Cloudflare Zero Trust:</p>
                    <ol className="list-decimal list-inside text-xs space-y-2">
                      <li>Go to <a href="https://one.dash.cloudflare.com/" target="_blank" rel="noopener" className="text-blue-500 hover:underline">Cloudflare Zero Trust</a> → Networks → Tunnels</li>
                      <li>Create a tunnel and install the connector (<code className="px-1 bg-gray-100 dark:bg-gray-700 rounded">cloudflared</code>) on this server</li>
                      <li>Add a <strong>Public Hostname</strong> for each service, pointing to the localhost URL shown above</li>
                      <li>SSL is handled automatically — no certbot needed ✅</li>
                    </ol>
                  </div>
                </div>

                {/* Current config */}
                <div className="bg-gray-500/5 border border-gray-500/20 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-400">Current Configuration</h3>
                  <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <div className="flex justify-between">
                      <span>API:</span>
                      <code className="text-gray-900 dark:text-white">{settings.api_url || apiDomain || 'Not set'}</code>
                    </div>
                    <div className="flex justify-between">
                      <span>Frontend:</span>
                      <code className="text-gray-900 dark:text-white">{settings.frontend_url || uiDomain || 'Not set'}</code>
                    </div>
                    <div className="flex justify-between">
                      <span>Mesh:</span>
                      <code className="text-gray-900 dark:text-white">{settings.mesh_site || 'Not set'}</code>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={applyDomain}
                disabled={saving || !apiDomain.trim()}
                className="px-5 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Applying...' : 'Apply Domains'}
              </button>
            </div>
          )}

          {/* ===== GENERAL TAB ===== */}
          {activeTab === 'general' && settings && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">General</h2>
              <Field label="Company Name" value={settings.company_name} onChange={v => update('company_name', v)} />
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Timezone</label>
                <select value={settings.timezone} onChange={e => update('timezone', e.target.value)} className="w-full px-4 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white">
                  {(settings.all_timezones || ['UTC', 'US/Eastern', 'US/Central', 'US/Mountain', 'US/Pacific', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo']).map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date Format</label>
                <select value={settings.date_format} onChange={e => update('date_format', e.target.value)} className="w-full px-4 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white">
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  <option value="MMM-DD-YYYY">MMM-DD-YYYY</option>
                </select>
              </div>
              <Toggle label="Agent Auto Update" desc="Automatically update agents when new versions are available" checked={settings.agent_auto_update} onChange={v => update('agent_auto_update', v)} />
            </div>
          )}

          {/* ===== MESH TAB ===== */}
          {activeTab === 'mesh' && settings && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Mesh Central</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Remote desktop, terminal, and file transfer</p>
              <Field label="Mesh Site URL" value={settings.mesh_site} onChange={v => update('mesh_site', v)} placeholder="https://mesh.yourdomain.com" />
              <Field label="Mesh Username" value={settings.mesh_username} onChange={v => update('mesh_username', v)} />
              <Field label="Mesh Token" value={settings.mesh_token_key} onChange={v => update('mesh_token_key', v)} type="password" />
              <Field label="Device Group" value={settings.mesh_device_group} onChange={v => update('mesh_device_group', v)} />
              <Toggle label="Sync Mesh Agents" desc="Automatically sync mesh agent groups" checked={settings.mesh_sync} onChange={v => update('mesh_sync', v)} />
            </div>
          )}

          {/* ===== EMAIL TAB ===== */}
          {activeTab === 'email' && settings && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Email / SMTP</h2>
              <Field label="From Email" value={settings.smtp_from} onChange={v => update('smtp_from', v)} />
              <Field label="SMTP Host" value={settings.smtp_host} onChange={v => update('smtp_host', v)} />
              <Field label="SMTP User" value={settings.smtp_username} onChange={v => update('smtp_username', v)} />
              <Field label="SMTP Password" value={settings.smtp_password} onChange={v => update('smtp_password', v)} type="password" />
              <Field label="SMTP Port" value={String(settings.smtp_port)} onChange={v => update('smtp_port', parseInt(v) || 587)} type="number" />
              <Toggle label="Use TLS" desc="Enable TLS for SMTP connections" checked={settings.smtp_use_tls} onChange={v => update('smtp_use_tls', v)} />
            </div>
          )}

          {/* ===== NOTIFICATIONS TAB ===== */}
          {activeTab === 'notifications' && settings && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Notifications</h2>
              <Toggle label="Notify on Warning Alerts" desc="Send alerts for warning-level check failures" checked={settings.alert_warning} onChange={v => update('alert_warning', v)} />
              <Toggle label="Notify on Info Alerts" desc="Send alerts for info-level notifications" checked={settings.alert_info} onChange={v => update('alert_info', v)} />
            </div>
          )}

          {/* ===== SECURITY TAB ===== */}
          {activeTab === 'security' && settings && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Security</h2>
              <Toggle label="Server Scripts" desc="Allow running scripts on the server" checked={settings.server_scripts} onChange={v => update('server_scripts', v)} />
              <Toggle label="Web Terminal" desc="Enable web-based terminal access" checked={settings.web_terminal} onChange={v => update('web_terminal', v)} />
              <Toggle label="Enable SSO" desc="Enable Single Sign-On authentication" checked={settings.enable_sso} onChange={v => update('enable_sso', v)} />
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Agent Debug Level</label>
                <select value={settings.debug_level} onChange={e => update('debug_level', parseInt(e.target.value))} className="w-full px-4 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white">
                  <option value={0}>None (0)</option>
                  <option value={1}>Info (1)</option>
                  <option value={2}>Warning (2)</option>
                  <option value={3}>Error (3)</option>
                  <option value={4}>Debug (4)</option>
                  <option value={5}>Trace (5)</option>
                </select>
              </div>
              <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Data Retention</h3>
                <Field label="Retention Days" value={String(settings.data_retention_days)} onChange={v => update('data_retention_days', parseInt(v) || 0)} type="number" />
              </div>
            </div>
          )}

          {/* ===== AI TAB ===== */}
          {activeTab === 'ai' && settings && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">AI Integration</h2>
              <Field label="OpenAI API Key" value={settings.openai_api_key} onChange={v => update('openai_api_key', v)} type="password" placeholder="sk-..." />
              <Field label="Model" value={settings.ai_model} onChange={v => update('ai_model', v)} placeholder="gpt-4" />
              <p className="text-xs text-gray-500 dark:text-gray-400">Used for AI-powered script generation and copilot features</p>
            </div>
          )}

          {/* Save Button (all tabs except Domain which has Apply) */}
          {activeTab !== 'domain' && (
            <div className="mt-6 pt-5 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button onClick={fetchSettings} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">Reset</button>
              <button onClick={saveSettings} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving...' : saved ? '✅ Saved!' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const Field = ({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full px-4 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white" />
  </div>
)

const Toggle = ({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <div className="flex items-center justify-between py-2">
    <div>
      <h3 className="text-sm font-medium text-gray-900 dark:text-white">{label}</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400">{desc}</p>
    </div>
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
    >
      <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  </div>
)

export default Settings
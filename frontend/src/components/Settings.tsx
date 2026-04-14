import { useState, useEffect } from 'react'

interface CoreSettings {
  id: number
  mesh_site: string
  mesh_token: string
  mesh_username: string
  mesh_device_group: string
  mesh_company_name: string | null
  default_time_zone: string
  smtp_from_email: string
  smtp_from_name: string | null
  smtp_host: string
  smtp_host_user: string
  smtp_host_password: string
  smtp_port: number
  smtp_requires_auth: boolean
  open_ai_token: string | null
  open_ai_model: string
  agent_auto_update: boolean
  agent_debug_level: string
  enable_server_scripts: boolean
  enable_server_webterminal: boolean
  notify_on_info_alerts: boolean
  notify_on_warning_alerts: boolean
  date_format: string
  check_history_prune_days: number
  resolved_alerts_prune_days: number
  agent_history_prune_days: number
  sync_mesh_with_trmm: boolean
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
  const serverBase = window.location.hostname === 'localhost'
    ? 'http://10.10.0.122:8000'
    : `${window.location.protocol}//${window.location.hostname}:8000`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Token ${token}`,
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
      // Try to get current API/UI domains from server base
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
    if (!apiDomain.trim()) return
    setSaving(true)
    setError('')
    try {
      // Update mesh_site in CoreSettings
      const meshSite = meshDomain.trim() ? `https://${meshDomain.trim()}` : settings!.mesh_site
      const updated = { ...settings!, mesh_site: meshSite }
      const resp = await fetch(`${serverBase}/core/settings/`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updated),
      })
      if (!resp.ok) {
        setError('Failed to save backend settings')
        setSaving(false)
        return
      }
      setSettings(updated)

      // Update ALLOWED_HOSTS and server config via a server-side script
      const configResp = await fetch(`${serverBase}/core/settings/`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updated),
      })

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

  const domainBase = apiDomain ? apiDomain.split('.').slice(-2).join('.') : 'yourdomain.com'

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
                  <h3 className="text-sm font-medium text-blue-700 dark:text-blue-400">🖥️ API + Admin Backend</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Django backend, REST API, and Django Admin. Agents connect here.</p>
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
                      <code className="text-gray-900 dark:text-white">{settings?.mesh_site || 'Not set'}</code>
                    </div>
                    <div className="flex justify-between">
                      <span>Frontend:</span>
                      <code className="text-gray-900 dark:text-white">{uiDomain || 'Not set'}</code>
                    </div>
                    <div className="flex justify-between">
                      <span>Mesh:</span>
                      <code className="text-gray-900 dark:text-white">{settings?.mesh_site || 'Not set'}</code>
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
              <Field label="Company Name" value={settings.mesh_company_name || ''} onChange={v => update('mesh_company_name', v)} />
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Timezone</label>
                <select value={settings.default_time_zone} onChange={e => update('default_time_zone', e.target.value)} className="w-full px-4 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white">
                  {(settings.all_timezones || []).map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date Format</label>
                <select value={settings.date_format} onChange={e => update('date_format', e.target.value)} className="w-full px-4 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white">
                  <option value="MMM-DD-YYYY - HH:mm">MMM-DD-YYYY - HH:mm</option>
                  <option value="DD-MMM-YYYY - HH:mm">DD-MMM-YYYY - HH:mm</option>
                  <option value="YYYY-MM-DD - HH:mm">YYYY-MM-DD - HH:mm</option>
                  <option value="MM/DD/YYYY - HH:mm">MM/DD/YYYY - HH:mm</option>
                  <option value="DD/MM/YYYY - HH:mm">DD/MM/YYYY - HH:mm</option>
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
              <Field label="Mesh Token" value={settings.mesh_token || ''} onChange={v => update('mesh_token', v)} type="password" />
              <Field label="Device Group" value={settings.mesh_device_group} onChange={v => update('mesh_device_group', v)} />
              <Toggle label="Sync Mesh with TRMM" desc="Automatically sync mesh agent groups" checked={settings.sync_mesh_with_trmm} onChange={v => update('sync_mesh_with_trmm', v)} />
            </div>
          )}

          {/* ===== EMAIL TAB ===== */}
          {activeTab === 'email' && settings && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Email / SMTP</h2>
              <Field label="From Email" value={settings.smtp_from_email} onChange={v => update('smtp_from_email', v)} />
              <Field label="From Name" value={settings.smtp_from_name || ''} onChange={v => update('smtp_from_name', v)} />
              <Field label="SMTP Host" value={settings.smtp_host} onChange={v => update('smtp_host', v)} />
              <Field label="SMTP User" value={settings.smtp_host_user} onChange={v => update('smtp_host_user', v)} />
              <Field label="SMTP Password" value={settings.smtp_host_password} onChange={v => update('smtp_host_password', v)} type="password" />
              <Field label="SMTP Port" value={String(settings.smtp_port)} onChange={v => update('smtp_port', parseInt(v) || 587)} type="number" />
              <Toggle label="SMTP Requires Auth" desc="Enable SMTP authentication" checked={settings.smtp_requires_auth} onChange={v => update('smtp_requires_auth', v)} />
            </div>
          )}

          {/* ===== NOTIFICATIONS TAB ===== */}
          {activeTab === 'notifications' && settings && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Notifications</h2>
              <Toggle label="Notify on Warning Alerts" desc="Send alerts for warning-level check failures" checked={settings.notify_on_warning_alerts} onChange={v => update('notify_on_warning_alerts', v)} />
              <Toggle label="Notify on Info Alerts" desc="Send alerts for info-level notifications" checked={settings.notify_on_info_alerts} onChange={v => update('notify_on_info_alerts', v)} />
            </div>
          )}

          {/* ===== SECURITY TAB ===== */}
          {activeTab === 'security' && settings && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Security</h2>
              <Toggle label="Server Scripts" desc="Allow running scripts on the server" checked={settings.enable_server_scripts} onChange={v => update('enable_server_scripts', v)} />
              <Toggle label="Web Terminal" desc="Enable web-based terminal access" checked={settings.enable_server_webterminal} onChange={v => update('enable_server_webterminal', v)} />
              <Toggle label="Block Local User Logon" desc="Prevent local user login (SSO only)" checked={settings.block_local_user_logon} onChange={v => update('block_local_user_logon', v)} />
              <Toggle label="SSO Enabled" desc="Enable Single Sign-On" checked={settings.sso_enabled} onChange={v => update('sso_enabled', v)} />
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Agent Debug Level</label>
                <select value={settings.agent_debug_level} onChange={e => update('agent_debug_level', e.target.value)} className="w-full px-4 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white">
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                  <option value="debug">Debug</option>
                  <option value="trace">Trace</option>
                </select>
              </div>
              <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Data Retention (days)</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Check History" value={String(settings.check_history_prune_days)} onChange={v => update('check_history_prune_days', parseInt(v) || 0)} type="number" />
                  <Field label="Resolved Alerts" value={String(settings.resolved_alerts_prune_days)} onChange={v => update('resolved_alerts_prune_days', parseInt(v) || 0)} type="number" />
                  <Field label="Agent History" value={String(settings.agent_history_prune_days)} onChange={v => update('agent_history_prune_days', parseInt(v) || 0)} type="number" />
                </div>
              </div>
            </div>
          )}

          {/* ===== AI TAB ===== */}
          {activeTab === 'ai' && settings && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">AI Integration</h2>
              <Field label="OpenAI API Key" value={settings.open_ai_token || ''} onChange={v => update('open_ai_token', v)} type="password" placeholder="sk-..." />
              <Field label="Model" value={settings.open_ai_model} onChange={v => update('open_ai_model', v)} />
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
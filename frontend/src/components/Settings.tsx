import { useState } from 'react'

const Settings = () => {
  const [activeTab, setActiveTab] = useState<'general' | 'integrations' | 'notifications' | 'security'>('general')
  const [settings, setSettings] = useState({
    appName: 'OpenRMM',
    timezone: 'America/Los_Angeles',
    groqApiKey: '',
    ollamaUrl: 'http://localhost:11434',
    emailAlerts: true,
    pushNotifications: false,
    twoFactorAuth: false,
    sessionTimeout: '30',
  })

  const update = (key: string, value: any) => setSettings(prev => ({ ...prev, [key]: value }))

  const tabs = [
    { id: 'general', label: 'General', icon: '⚙️' },
    { id: 'integrations', label: 'Integrations', icon: '🔌' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'security', label: 'Security', icon: '🔒' },
  ]

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Configure OpenRMM preferences</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-48 shrink-0">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-2 space-y-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
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
          {activeTab === 'general' && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">General</h2>
              <Field label="Application Name" value={settings.appName} onChange={v => update('appName', v)} />
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Timezone</label>
                <select value={settings.timezone} onChange={e => update('timezone', e.target.value)} className="w-full px-4 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white">
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">Eastern Time</option>
                  <option value="America/Chicago">Central Time</option>
                  <option value="America/Denver">Mountain Time</option>
                  <option value="America/Los_Angeles">Pacific Time</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Integrations</h2>
              <div className="border-b border-gray-200 dark:border-gray-700 pb-5">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">🤖 AI Integration</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Groq API Key</label>
                  <input type="password" value={settings.groqApiKey} onChange={e => update('groqApiKey', e.target.value)} placeholder="gsk_..." className="w-full px-4 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white" />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Get your key from <a href="https://console.groq.com" className="text-blue-500 hover:underline">console.groq.com</a></p>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">📧 Email (SMTP)</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Configure email alerts in the backend admin panel at <a href="http://10.10.0.122:8000/admin/" className="text-blue-500 hover:underline">/admin/</a></p>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Notifications</h2>
              <Toggle label="Email Alerts" desc="Receive alerts via email" checked={settings.emailAlerts} onChange={v => update('emailAlerts', v)} />
              <Toggle label="Push Notifications" desc="Browser push notifications" checked={settings.pushNotifications} onChange={v => update('pushNotifications', v)} />
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Security</h2>
              <Field label="Session Timeout (minutes)" value={settings.sessionTimeout} onChange={v => update('sessionTimeout', v)} type="number" />
              <Toggle label="Two-Factor Authentication" desc="Require 2FA for all users" checked={settings.twoFactorAuth} onChange={v => update('twoFactorAuth', v)} />
            </div>
          )}

          <div className="mt-6 pt-5 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
            <button className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">Reset</button>
            <button className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const Field = ({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
    <input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full px-4 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white" />
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
import { useState } from 'react'

const Settings = () => {
  const [activeTab, setActiveTab] = useState<'general' | 'integrations' | 'notifications' | 'security' | 'advanced'>('general')
  
  const [settings, setSettings] = useState({
    // General
    appName: 'OpenRMM',
    timezone: 'UTC',
    dateFormat: 'MM/DD/YYYY',
    language: 'en',
    
    // Integrations
    groqApiKey: '',
    ollamaUrl: 'http://localhost:11434',
    smtpServer: '',
    smtpPort: '587',
    emailFrom: '',
    
    // Notifications
    emailAlerts: true,
    pushNotifications: false,
    alertCritical: true,
    alertWarning: true,
    alertInfo: false,
    
    // Security
    sessionTimeout: '30',
    twoFactorAuth: false,
    ipWhitelist: '',
    
    // Advanced
    logLevel: 'info',
    retentionDays: '90',
    autoCleanup: true,
  })

  const updateSetting = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  const saveSettings = () => {
    console.log('Saving settings:', settings)
    // TODO: Save to backend
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
          <p className="text-gray-600 mt-1">Configure OpenRMM preferences</p>
        </div>

        <div className="flex">
          {/* Sidebar */}
          <div className="w-64 border-r border-gray-200 p-4">
            {[
              { id: 'general', label: 'General', icon: '⚙️' },
              { id: 'integrations', label: 'Integrations', icon: '🔌' },
              { id: 'notifications', label: 'Notifications', icon: '🔔' },
              { id: 'security', label: 'Security', icon: '🔒' },
              { id: 'advanced', label: 'Advanced', icon: '⚡' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 ${
                  activeTab === tab.id
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span>{tab.icon}</span>
                <span className="font-medium">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 p-6">
            {/* General Settings */}
            {activeTab === 'general' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Application Name
                  </label>
                  <input
                    type="text"
                    value={settings.appName}
                    onChange={(e) => updateSetting('appName', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Timezone
                  </label>
                  <select
                    value={settings.timezone}
                    onChange={(e) => updateSetting('timezone', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">Eastern Time</option>
                    <option value="America/Chicago">Central Time</option>
                    <option value="America/Denver">Mountain Time</option>
                    <option value="America/Los_Angeles">Pacific Time</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date Format
                  </label>
                  <select
                    value={settings.dateFormat}
                    onChange={(e) => updateSetting('dateFormat', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </div>
              </div>
            )}

            {/* Integrations */}
            {activeTab === 'integrations' && (
              <div className="space-y-6">
                <div className="border-b border-gray-200 pb-6">
                  <h3 className="text-lg font-semibold mb-4">🤖 AI Integration</h3>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Groq API Key
                    </label>
                    <input
                      type="password"
                      value={settings.groqApiKey}
                      onChange={(e) => updateSetting('groqApiKey', e.target.value)}
                      placeholder="gsk_..."
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      Get your API key from <a href="https://console.groq.com" className="text-blue-600">console.groq.com</a>
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ollama URL (Optional)
                    </label>
                    <input
                      type="text"
                      value={settings.ollamaUrl}
                      onChange={(e) => updateSetting('ollamaUrl', e.target.value)}
                      placeholder="http://localhost:11434"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      For local AI processing (optional)
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-4">📧 Email Configuration</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        SMTP Server
                      </label>
                      <input
                        type="text"
                        value={settings.smtpServer}
                        onChange={(e) => updateSetting('smtpServer', e.target.value)}
                        placeholder="smtp.gmail.com"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        SMTP Port
                      </label>
                      <input
                        type="text"
                        value={settings.smtpPort}
                        onChange={(e) => updateSetting('smtpPort', e.target.value)}
                        placeholder="587"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      From Email
                    </label>
                    <input
                      type="email"
                      value={settings.emailFrom}
                      onChange={(e) => updateSetting('emailFrom', e.target.value)}
                      placeholder="noreply@example.com"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Notifications */}
            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">Email Alerts</h3>
                    <p className="text-sm text-gray-500">Receive alerts via email</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.emailAlerts}
                    onChange={(e) => updateSetting('emailAlerts', e.target.checked)}
                    className="h-5 w-5 text-blue-600 rounded"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">Push Notifications</h3>
                    <p className="text-sm text-gray-500">Browser push notifications</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.pushNotifications}
                    onChange={(e) => updateSetting('pushNotifications', e.target.checked)}
                    className="h-5 w-5 text-blue-600 rounded"
                  />
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <h3 className="font-medium text-gray-900 mb-4">Alert Severity Levels</h3>
                  
                  {[
                    { key: 'alertCritical', label: 'Critical Alerts', desc: 'System failures, security breaches' },
                    { key: 'alertWarning', label: 'Warning Alerts', desc: 'High resource usage, offline devices' },
                    { key: 'alertInfo', label: 'Info Alerts', desc: 'General notifications, updates' },
                  ].map((alert) => (
                    <div key={alert.key} className="flex items-center justify-between py-2">
                      <div>
                        <h4 className="font-medium text-gray-900">{alert.label}</h4>
                        <p className="text-sm text-gray-500">{alert.desc}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings[alert.key as keyof typeof settings] as boolean}
                        onChange={(e) => updateSetting(alert.key, e.target.checked)}
                        className="h-5 w-5 text-blue-600 rounded"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Security */}
            {activeTab === 'security' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Session Timeout (minutes)
                  </label>
                  <input
                    type="number"
                    value={settings.sessionTimeout}
                    onChange={(e) => updateSetting('sessionTimeout', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">Two-Factor Authentication</h3>
                    <p className="text-sm text-gray-500">Require 2FA for all users</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.twoFactorAuth}
                    onChange={(e) => updateSetting('twoFactorAuth', e.target.checked)}
                    className="h-5 w-5 text-blue-600 rounded"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    IP Whitelist (one per line)
                  </label>
                  <textarea
                    value={settings.ipWhitelist}
                    onChange={(e) => updateSetting('ipWhitelist', e.target.value)}
                    placeholder="192.168.1.0/24&#10;10.0.0.1"
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
            )}

            {/* Advanced */}
            {activeTab === 'advanced' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Log Level
                  </label>
                  <select
                    value={settings.logLevel}
                    onChange={(e) => updateSetting('logLevel', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="debug">Debug</option>
                    <option value="info">Info</option>
                    <option value="warn">Warning</option>
                    <option value="error">Error</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data Retention (days)
                  </label>
                  <input
                    type="number"
                    value={settings.retentionDays}
                    onChange={(e) => updateSetting('retentionDays', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">Auto Cleanup</h3>
                    <p className="text-sm text-gray-500">Automatically delete old logs and data</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.autoCleanup}
                    onChange={(e) => updateSetting('autoCleanup', e.target.checked)}
                    className="h-5 w-5 text-blue-600 rounded"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded">
            Reset to Defaults
          </button>
          <button
            onClick={saveSettings}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

export default Settings

import { useState } from 'react'
import type { Automation, AutomationTrigger, AutomationAction } from '../types/automation'

const AutomationBuilder = () => {
  const [automations, setAutomations] = useState<Automation[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null)

  const [newAutomation, setNewAutomation] = useState<Partial<Automation>>({
    name: '',
    description: '',
    enabled: true,
    trigger: { type: 'manual' },
    conditions: [],
    actions: [],
  })

  const saveAutomation = () => {
    if (!newAutomation.name) return

    const automation: Automation = {
      id: editingAutomation?.id || Date.now().toString(),
      name: newAutomation.name || '',
      description: newAutomation.description || '',
      trigger: newAutomation.trigger as AutomationTrigger,
      conditions: newAutomation.conditions || [],
      actions: newAutomation.actions || [],
      enabled: newAutomation.enabled || true,
      createdAt: editingAutomation?.createdAt || new Date().toISOString(),
      runCount: editingAutomation?.runCount || 0,
    }

    if (editingAutomation) {
      setAutomations(prev => prev.map(a => a.id === editingAutomation.id ? automation : a))
    } else {
      setAutomations(prev => [...prev, automation])
    }

    setShowCreateModal(false)
    setEditingAutomation(null)
    setNewAutomation({
      name: '',
      description: '',
      enabled: true,
      trigger: { type: 'manual' },
      conditions: [],
      actions: [],
    })
  }

  const deleteAutomation = (id: string) => {
    setAutomations(prev => prev.filter(a => a.id !== id))
  }

  const toggleAutomation = (id: string) => {
    setAutomations(prev =>
      prev.map(a =>
        a.id === id ? { ...a, enabled: !a.enabled } : a
      )
    )
  }

  const getTriggerDescription = (trigger: AutomationTrigger) => {
    switch (trigger.type) {
      case 'schedule':
        return `⏰ ${trigger.schedule?.frequency} at ${trigger.schedule?.time}`
      case 'event':
        return `📡 On ${trigger.event?.type}`
      case 'webhook':
        return '🔗 Webhook'
      case 'manual':
        return '👤 Manual'
      default:
        return 'Unknown'
    }
  }

  const getActionCount = (actions: AutomationAction[]) => {
    return actions.length
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Automation Workflows</h2>
            <p className="text-gray-600 mt-1">Create automated tasks and responses</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            + Create Automation
          </button>
        </div>

        {/* Automation List */}
        <div className="divide-y divide-gray-200">
          {automations.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <div className="text-6xl mb-4">🤖</div>
              <h3 className="text-lg font-semibold mb-2">No automations yet</h3>
              <p>Create your first automation to get started</p>
            </div>
          ) : (
            automations.map((automation) => (
              <div key={automation.id} className="p-6 hover:bg-gray-50">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {automation.name}
                      </h3>
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded ${
                          automation.enabled
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {automation.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    <p className="mt-1 text-gray-600">{automation.description}</p>
                    <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                      <span>{getTriggerDescription(automation.trigger)}</span>
                      <span>•</span>
                      <span>{automation.conditions.length} conditions</span>
                      <span>•</span>
                      <span>{getActionCount(automation.actions)} actions</span>
                      <span>•</span>
                      <span>Run {automation.runCount} times</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleAutomation(automation.id)}
                      className={`px-3 py-1 rounded text-sm ${
                        automation.enabled
                          ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                      }`}
                    >
                      {automation.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => {
                        setEditingAutomation(automation)
                        setNewAutomation(automation)
                        setShowCreateModal(true)
                      }}
                      className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteAutomation(automation.id)}
                      className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-xl font-semibold">
                {editingAutomation ? 'Edit Automation' : 'Create Automation'}
              </h3>
            </div>
            <div className="p-6 space-y-6">
              {/* Name & Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={newAutomation.name}
                  onChange={(e) =>
                    setNewAutomation({ ...newAutomation, name: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g., Reboot Server on High CPU"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newAutomation.description}
                  onChange={(e) =>
                    setNewAutomation({ ...newAutomation, description: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg h-20"
                  placeholder="What does this automation do?"
                />
              </div>

              {/* Trigger */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Trigger
                </label>
                <select
                  value={newAutomation.trigger?.type}
                  onChange={(e) =>
                    setNewAutomation({
                      ...newAutomation,
                      trigger: { type: e.target.value as any },
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="manual">👤 Manual</option>
                  <option value="schedule">⏰ Schedule</option>
                  <option value="event">📡 Event</option>
                  <option value="webhook">🔗 Webhook</option>
                </select>
              </div>

              {/* Enabled Toggle */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={newAutomation.enabled}
                  onChange={(e) =>
                    setNewAutomation({ ...newAutomation, enabled: e.target.checked })
                  }
                  className="h-4 w-4 text-blue-600 rounded"
                />
                <label htmlFor="enabled" className="ml-2 text-sm text-gray-700">
                  Enable automation immediately
                </label>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setEditingAutomation(null)
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={saveAutomation}
                disabled={!newAutomation.name}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {editingAutomation ? 'Save Changes' : 'Create Automation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AutomationBuilder

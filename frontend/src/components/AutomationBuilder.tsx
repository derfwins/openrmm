import { useState } from 'react'
import { getIcon } from '../utils/iconMap'
import type {
  AutomationTask,
  AutomationTriggerType,
  AutomationTrigger,
  AutomationActionStep,
  AutomationActionType,
  AutomationTargets,
  AutomationHistory,
  AutomationSchedule,
} from '../types/automation'
// import automationService from '../services/automationService'

type Tab = 'tasks' | 'history'

const TRIGGER_OPTIONS: { type: AutomationTriggerType; label: string; icon: string }[] = [
  { type: 'schedule', label: 'Schedule', icon: 'gear' },
  { type: 'alert', label: 'Alert', icon: 'bell' },
  { type: 'event', label: 'Event', icon: 'wrench' },
  { type: 'threshold', label: 'Threshold', icon: 'chart' },
]

const ACTION_OPTIONS: { type: AutomationActionType; label: string; icon: string }[] = [
  { type: 'reboot', label: 'Reboot Device', icon: 'wrench' },
  { type: 'run_script', label: 'Run Script', icon: 'clipboard' },
  { type: 'patch', label: 'Install Patches', icon: 'lock' },
  { type: 'send_email', label: 'Send Email', icon: 'bell' },
  { type: 'create_ticket', label: 'Create Ticket', icon: 'clipboard' },
]

const TARGET_OPTIONS: { type: AutomationTargets['type']; label: string }[] = [
  { type: 'all', label: 'All Devices' },
  { type: 'group', label: 'Specific Groups' },
  { type: 'specific', label: 'Specific Devices' },
]

// @ts-expect-error demo data for future use
const DEMO_HISTORY: AutomationHistory[] = [
  { id: 'h1', taskId: '1', taskName: 'Weekly Patch Cycle', startedAt: '2024-04-14T02:00:00Z', completedAt: '2024-04-14T02:15:00Z', status: 'completed', actions: [{ actionType: 'patch', startedAt: '2024-04-14T02:00:00Z', completedAt: '2024-04-14T02:15:00Z', status: 'completed', output: '14 patches installed' }] },
  { id: 'h2', taskId: '2', taskName: 'High CPU Auto-Reboot', startedAt: '2024-04-13T14:30:00Z', completedAt: '2024-04-13T14:35:00Z', status: 'completed', actions: [{ actionType: 'reboot', startedAt: '2024-04-13T14:30:00Z', completedAt: '2024-04-13T14:35:00Z', status: 'completed', output: 'Device server-01 rebooted' }] },
  { id: 'h3', taskId: '1', taskName: 'Weekly Patch Cycle', startedAt: '2024-04-07T02:00:00Z', completedAt: '2024-04-07T02:20:00Z', status: 'completed', actions: [{ actionType: 'patch', startedAt: '2024-04-07T02:00:00Z', completedAt: '2024-04-07T02:20:00Z', status: 'completed', output: '8 patches installed' }] },
]

// @ts-expect-error demo data for future use
const DEMO_TASKS: AutomationTask[] = [
  {
    id: '1', name: 'Weekly Patch Cycle', description: 'Install approved patches every Saturday at 2 AM', enabled: true, status: 'active',
    trigger: { type: 'schedule', schedule: { cron: '0 2 * * 6', timezone: 'UTC', frequency: 'weekly', label: 'Every Saturday 2:00 AM' } },
    actions: [{ id: 'a1', type: 'patch', config: { severityFilter: ['critical', 'important'] }, continueOnError: false, timeout: 3600 }],
    targets: { type: 'all' },
    createdAt: '2024-03-01T00:00:00Z', updatedAt: '2024-04-01T00:00:00Z', lastRunAt: '2024-04-14T02:00:00Z', nextRunAt: '2024-04-20T02:00:00Z', runCount: 7,
  },
  {
    id: '2', name: 'High CPU Auto-Reboot', description: 'Reboot device when CPU stays above 95% for 10 minutes', enabled: true, status: 'active',
    trigger: { type: 'threshold', threshold: { metric: 'cpu_percent', operator: '>', value: 95, duration: '10m' } },
    actions: [{ id: 'a2', type: 'reboot', config: { force: false, message: 'Rebooting due to high CPU usage' }, continueOnError: false }],
    targets: { type: 'specific', deviceIds: ['server-01'] },
    createdAt: '2024-02-15T00:00:00Z', updatedAt: '2024-03-20T00:00:00Z', lastRunAt: '2024-04-13T14:30:00Z', runCount: 3,
  },
  {
    id: '3', name: 'Alert Email Notification', description: 'Send email when critical alert is triggered', enabled: false, status: 'disabled',
    trigger: { type: 'alert', alert: { alertType: 'critical', severity: 'critical' } },
    actions: [{ id: 'a3', type: 'send_email', config: { recipients: ['admin@example.com'], template: 'critical-alert' }, continueOnError: true }],
    targets: { type: 'all' },
    createdAt: '2024-01-10T00:00:00Z', updatedAt: '2024-01-10T00:00:00Z', runCount: 0,
  },
]

const AutomationBuilder = () => {
  const [activeTab, setActiveTab] = useState<Tab>('tasks')
  const [tasks, setTasks] = useState<AutomationTask[]>([])
  const [history] = useState<AutomationHistory[]>([])
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingTask, setEditingTask] = useState<AutomationTask | null>(null)

  const toggleEnabled = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, enabled: !t.enabled, status: t.enabled ? 'disabled' as const : 'active' as const } : t))
  }

  const deleteTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  const saveTask = (task: AutomationTask) => {
    if (editingTask) {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t))
    } else {
      setTasks(prev => [...prev, task])
    }
    setShowBuilder(false)
    setEditingTask(null)
  }

  const openEdit = (task: AutomationTask) => {
    setEditingTask(task)
    setShowBuilder(true)
  }

  const closeBuilder = () => {
    setShowBuilder(false)
    setEditingTask(null)
  }

  const runNow = (_id: string) => {
    // Trigger immediate execution
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Automation Workflows</h1>
          <p className="text-gray-400 text-sm mt-1">{tasks.filter(t => t.enabled).length} active / {tasks.length} total</p>
        </div>
        <button onClick={() => { setEditingTask(null); setShowBuilder(true) }}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          + Create Automation
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
        {(['tasks', 'history'] as Tab[]).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors capitalize ${
              activeTab === tab ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
            }`}>
            {tab}
          </button>
        ))}
      </div>

      {/* Tasks */}
      {activeTab === 'tasks' && (
        <div className="space-y-3">
          {tasks.map(task => (
            <div key={task.id} className="bg-gray-800 rounded-xl border border-gray-700 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{getIcon(TRIGGER_OPTIONS.find(t => t.type === task.trigger.type)?.icon as string)}</span>
                  <div>
                    <h3 className="text-white font-medium">{task.name}</h3>
                    <p className="text-gray-400 text-xs mt-0.5">{task.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${task.enabled ? 'bg-green-900/30 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                    {task.enabled ? 'Active' : 'Disabled'}
                  </span>
                  <button onClick={() => toggleEnabled(task.id)} className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600">
                    {task.enabled ? 'Disable' : 'Enable'}
                  </button>
                  {task.enabled && (
                    <button onClick={() => runNow(task.id)} className="px-2 py-1 text-xs bg-blue-900/30 text-blue-400 rounded hover:bg-blue-900/50">
                      ▶ Run Now
                    </button>
                  )}
                  <button onClick={() => openEdit(task)} className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600">Edit</button>
                  <button onClick={() => deleteTask(task.id)} className="px-2 py-1 text-xs bg-red-900/30 text-red-400 rounded hover:bg-red-900/50">Delete</button>
                </div>
              </div>
              {/* Task details */}
              <div className="flex flex-wrap gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  {getIcon(TRIGGER_OPTIONS.find(t => t.type === task.trigger.type)?.icon as string)}
                  {task.trigger.type === 'schedule' ? task.trigger.schedule?.label || task.trigger.schedule?.cron : task.trigger.type}
                </span>
                <span className="flex items-center gap-1">
                  ⚡ {task.actions.map(a => ACTION_OPTIONS.find(o => o.type === a.type)?.label).join(' → ')}
                </span>
                <span className="flex items-center gap-1">
                  🎯 {task.targets.type === 'all' ? 'All devices' : task.targets.type === 'group' ? `${task.targets.groupIds?.length || 0} group(s)` : `${task.targets.deviceIds?.length || 0} device(s)`}
                </span>
                {task.runCount > 0 && <span>📊 {task.runCount} runs</span>}
                {task.lastRunAt && <span>🕐 Last: {new Date(task.lastRunAt).toLocaleDateString()}</span>}
                {task.nextRunAt && <span>⏭️ Next: {new Date(task.nextRunAt).toLocaleDateString()}</span>}
              </div>
            </div>
          ))}
          {tasks.length === 0 && (
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-8 text-center">
              <div className="text-4xl mb-3">⚡</div>
              <p className="text-sm text-gray-400">No automations yet. Create one to automate repetitive tasks.</p>
            </div>
          )}
        </div>
      )}

      {/* History */}
      {activeTab === 'history' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400 text-left">
                <th className="px-4 py-3">Task</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {history.map(h => {
                const duration = h.completedAt
                  ? Math.round((new Date(h.completedAt).getTime() - new Date(h.startedAt).getTime()) / 60000)
                  : null
                return (
                  <tr key={h.id} className="hover:bg-gray-750 transition-colors">
                    <td className="px-4 py-3 text-white">{h.taskName}</td>
                    <td className="px-4 py-3 text-gray-300">{new Date(h.startedAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-300">{duration !== null ? `${duration}m` : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        h.status === 'completed' ? 'bg-green-900/30 text-green-400' :
                        h.status === 'failed' ? 'bg-red-900/30 text-red-400' :
                        h.status === 'running' ? 'bg-blue-900/30 text-blue-400' :
                        'bg-gray-700 text-gray-400'
                      }`}>{h.status}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {h.actions.map(a => a.output || a.actionType).join('; ')}
                    </td>
                  </tr>
                )
              })}
              {history.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No execution history yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Builder Modal */}
      {showBuilder && (
        <TaskBuilderModal
          task={editingTask}
          onClose={closeBuilder}
          onSave={saveTask}
        />
      )}
    </div>
  )
}

const TaskBuilderModal = ({ task, onClose, onSave }: { task: AutomationTask | null; onClose: () => void; onSave: (t: AutomationTask) => void }) => {
  const [name, setName] = useState(task?.name || '')
  const [description, setDescription] = useState(task?.description || '')
  const [triggerType, setTriggerType] = useState<AutomationTriggerType>(task?.trigger.type || 'schedule')
  const [schedule, setSchedule] = useState<AutomationSchedule>(task?.trigger.schedule || { cron: '0 2 * * 6', timezone: 'UTC', frequency: 'weekly' })
  const [thresholdMetric, setThresholdMetric] = useState(task?.trigger.threshold?.metric || 'cpu_percent')
  const [thresholdOp, setThresholdOp] = useState(task?.trigger.threshold?.operator || '>')
  const [thresholdValue, setThresholdValue] = useState(task?.trigger.threshold?.value || 95)
  const [thresholdDuration, setThresholdDuration] = useState(task?.trigger.threshold?.duration || '10m')
  const [actions, setActions] = useState<AutomationActionStep[]>(task?.actions || [])
  const [targetType, setTargetType] = useState<AutomationTargets['type']>(task?.targets.type || 'all')

  // const addTriggerIcon

  const addAction = (type: AutomationActionType) => {
    setActions(prev => [...prev, { id: crypto.randomUUID(), type, config: {}, continueOnError: false }])
  }

  const removeAction = (id: string) => {
    setActions(prev => prev.filter(a => a.id !== id))
  }

  const updateAction = (id: string, updates: Partial<AutomationActionStep>) => {
    setActions(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a))
  }

  const handleSave = () => {
    if (!name.trim() || actions.length === 0) return

    const trigger: AutomationTrigger = (() => {
      switch (triggerType) {
        case 'schedule': return { type: 'schedule' as const, schedule }
        case 'threshold': return { type: 'threshold' as const, threshold: { metric: thresholdMetric, operator: thresholdOp, value: thresholdValue, duration: thresholdDuration } }
        case 'alert': return { type: 'alert' as const, alert: { alertType: 'critical', severity: 'critical' } }
        case 'event': return { type: 'event' as const, event: { eventType: 'device_offline' as const } }
      }
    })()

    const now = new Date().toISOString()
    const newTask: AutomationTask = {
      id: task?.id || crypto.randomUUID(),
      name: name.trim(),
      description: description.trim(),
      enabled: task?.enabled ?? true,
      status: (task?.enabled ?? true) ? 'active' : 'disabled',
      trigger,
      actions,
      targets: { type: targetType },
      createdAt: task?.createdAt || now,
      updatedAt: now,
      lastRunAt: task?.lastRunAt,
      nextRunAt: task?.nextRunAt,
      runCount: task?.runCount || 0,
    }
    onSave(newTask)
  }

  const cronPresets: { label: string; cron: string; freq: AutomationSchedule['frequency'] }[] = [
    { label: 'Every hour', cron: '0 * * * *', freq: 'hourly' },
    { label: 'Daily at midnight', cron: '0 0 * * *', freq: 'daily' },
    { label: 'Daily at 2 AM', cron: '0 2 * * *', freq: 'daily' },
    { label: 'Weekly (Sat 2 AM)', cron: '0 2 * * 6', freq: 'weekly' },
    { label: 'Monthly (1st 2 AM)', cron: '0 2 1 * *', freq: 'monthly' },
  ]

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">{task ? 'Edit Automation' : 'Create Automation'}</h3>
        </div>

        <div className="p-5 space-y-6">
          {/* Name & Description */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Weekly Patch Cycle"
                className="w-full px-4 py-2 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="What does this automation do?"
                className="w-full px-4 py-2 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
          </div>

          {/* Trigger */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Trigger</label>
            <div className="grid grid-cols-4 gap-2">
              {TRIGGER_OPTIONS.map(opt => (
                <button key={opt.type} onClick={() => setTriggerType(opt.type)}
                  className={`p-3 rounded-lg text-center transition-colors ${
                    triggerType === opt.type ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}>
                  <div className="text-xl mb-1">{getIcon(opt.icon as string)}</div>
                  <div className="text-xs">{opt.label}</div>
                </button>
              ))}
            </div>

            {/* Schedule config */}
            {triggerType === 'schedule' && (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap gap-2">
                  {cronPresets.map(p => (
                    <button key={p.cron} onClick={() => setSchedule(prev => ({ ...prev, cron: p.cron, frequency: p.freq, label: p.label }))}
                      className={`px-3 py-1.5 text-xs rounded-lg ${schedule.cron === p.cron ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-3">
                  <input type="text" value={schedule.cron} onChange={e => setSchedule(prev => ({ ...prev, cron: e.target.value, frequency: 'custom' }))}
                    placeholder="Cron expression"
                    className="flex-1 px-3 py-2 text-sm font-mono bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500" />
                  <select value={schedule.timezone} onChange={e => setSchedule(prev => ({ ...prev, timezone: e.target.value }))}
                    className="px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500">
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">Eastern</option>
                    <option value="America/Chicago">Central</option>
                    <option value="America/Denver">Mountain</option>
                    <option value="America/Los_Angeles">Pacific</option>
                  </select>
                </div>
              </div>
            )}

            {/* Threshold config */}
            {triggerType === 'threshold' && (
              <div className="mt-3 flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">Metric</label>
                  <select value={thresholdMetric} onChange={e => setThresholdMetric(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white">
                    <option value="cpu_percent">CPU %</option>
                    <option value="memory_percent">Memory %</option>
                    <option value="disk_percent">Disk %</option>
                    <option value="disk_free_gb">Disk Free (GB)</option>
                  </select>
                </div>
                <div className="w-20">
                  <label className="block text-xs text-gray-400 mb-1">Operator</label>
                  <select value={thresholdOp} onChange={e => setThresholdOp(e.target.value as '>' | '<' | '>=' | '<=' | '==')}
                    className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white">
                    <option value=">">&gt;</option>
                    <option value="<">&lt;</option>
                    <option value=">=">≥</option>
                    <option value="<=">≤</option>
                  </select>
                </div>
                <div className="w-24">
                  <label className="block text-xs text-gray-400 mb-1">Value</label>
                  <input type="number" value={thresholdValue} onChange={e => setThresholdValue(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white" />
                </div>
                <div className="w-24">
                  <label className="block text-xs text-gray-400 mb-1">For</label>
                  <select value={thresholdDuration} onChange={e => setThresholdDuration(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white">
                    <option value="5m">5 min</option>
                    <option value="10m">10 min</option>
                    <option value="30m">30 min</option>
                    <option value="1h">1 hour</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Actions</label>
            <div className="space-y-2">
              {actions.map((action, idx) => (
                <div key={action.id} className="flex items-center gap-3 bg-gray-900 rounded-lg p-3 border border-gray-700">
                  <span className="text-gray-500 text-xs font-mono w-6">{idx + 1}.</span>
                  <span className="text-lg">{getIcon(ACTION_OPTIONS.find(o => o.type === action.type)?.icon as string)}</span>
                  <span className="text-white text-sm flex-1">{ACTION_OPTIONS.find(o => o.type === action.type)?.label}</span>
                  <label className="flex items-center gap-1.5 text-xs text-gray-400">
                    <input type="checkbox" checked={action.continueOnError} onChange={e => updateAction(action.id, { continueOnError: e.target.checked })}
                      className="rounded bg-gray-700 border-gray-600" />
                    Continue on error
                  </label>
                  <button onClick={() => removeAction(action.id)} className="text-red-400 hover:text-red-300 text-sm">✕</button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2 pt-2">
                {ACTION_OPTIONS.map(opt => (
                  <button key={opt.type} onClick={() => addAction(opt.type)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 flex items-center gap-1.5">
                    <span>{getIcon(opt.icon as string)}</span> {opt.label}
                  </button>
                ))}
              </div>
              {actions.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-2">Add at least one action to continue</p>
              )}
            </div>
          </div>

          {/* Targets */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Targets</label>
            <div className="flex gap-2">
              {TARGET_OPTIONS.map(opt => (
                <button key={opt.type} onClick={() => setTargetType(opt.type)}
                  className={`flex-1 px-4 py-2 text-sm rounded-lg ${targetType === opt.type ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-gray-700 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-lg">Cancel</button>
          <button onClick={handleSave} disabled={!name.trim() || actions.length === 0}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {task ? 'Save Changes' : 'Create Automation'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AutomationBuilder
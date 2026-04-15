import { API_BASE_URL } from '../config'
import { useState, useEffect } from 'react'

interface Role {
  id: number
  name: string
  is_superuser: boolean
  can_list_agents: boolean
  can_use_mesh: boolean
  can_uninstall_agents: boolean
  can_update_agents: boolean
  can_edit_agent: boolean
  can_manage_procs: boolean
  can_view_eventlogs: boolean
  can_send_cmd: boolean
  can_reboot_agents: boolean
  can_install_agents: boolean
  can_run_scripts: boolean
  can_run_bulk: boolean
  can_list_agent_history: boolean
  can_list_notes: boolean
  can_manage_notes: boolean
  can_view_core_settings: boolean
  can_edit_core_settings: boolean
  can_list_checks: boolean
  can_manage_checks: boolean
  can_run_checks: boolean
  can_list_clients: boolean
  can_manage_clients: boolean
  can_list_sites: boolean
  can_manage_sites: boolean
  can_list_scripts: boolean
  can_manage_scripts: boolean
  can_list_alerts: boolean
  can_manage_alerts: boolean
  can_list_autotasks: boolean
  can_manage_autotasks: boolean
  can_run_autotasks: boolean
  can_list_accounts: boolean
  can_manage_accounts: boolean
  can_list_roles: boolean
  can_manage_roles: boolean
  can_list_api_keys: boolean
  can_manage_api_keys: boolean
  can_manage_winsvcs: boolean
  can_list_software: boolean
  can_manage_software: boolean
  can_manage_winupdates: boolean
  can_view_auditlogs: boolean
  can_view_debuglogs: boolean
  can_view_reports: boolean
  can_manage_reports: boolean
  user_count?: number
  [key: string]: any
}

interface User {
  id: number
  username: string
  first_name: string
  last_name: string
  email: string
  is_active: boolean
  last_login: string | null
  last_login_ip: string | null
  role: number | null
  block_dashboard_login: boolean
}

const PERMISSION_GROUPS = [
  {
    label: 'Agents',
    prefix: 'can_',
    perms: [
      { key: 'can_list_agents', label: 'View Agents' },
      { key: 'can_edit_agent', label: 'Edit Agents' },
      { key: 'can_install_agents', label: 'Install Agents' },
      { key: 'can_uninstall_agents', label: 'Uninstall Agents' },
      { key: 'can_update_agents', label: 'Update Agents' },
      { key: 'can_recover_agents', label: 'Recover Agents' },
      { key: 'can_use_mesh', label: 'Use Mesh (Remote Desktop)' },
      { key: 'can_manage_procs', label: 'Manage Processes' },
      { key: 'can_send_cmd', label: 'Send Commands' },
      { key: 'can_run_scripts', label: 'Run Scripts' },
      { key: 'can_run_bulk', label: 'Run Bulk Actions' },
      { key: 'can_reboot_agents', label: 'Reboot Agents' },
      { key: 'can_view_eventlogs', label: 'View Event Logs' },
      { key: 'can_list_agent_history', label: 'View Agent History' },
      { key: 'can_send_wol', label: 'Send Wake-on-LAN' },
      { key: 'can_use_registry', label: 'Use Registry Editor' },
    ],
  },
  {
    label: 'Clients & Sites',
    prefix: 'can_',
    perms: [
      { key: 'can_list_clients', label: 'View Clients' },
      { key: 'can_manage_clients', label: 'Manage Clients' },
      { key: 'can_list_sites', label: 'View Sites' },
      { key: 'can_manage_sites', label: 'Manage Sites' },
    ],
  },
  {
    label: 'Checks & Tasks',
    prefix: 'can_',
    perms: [
      { key: 'can_list_checks', label: 'View Checks' },
      { key: 'can_manage_checks', label: 'Manage Checks' },
      { key: 'can_run_checks', label: 'Run Checks' },
      { key: 'can_list_autotasks', label: 'View Automated Tasks' },
      { key: 'can_manage_autotasks', label: 'Manage Automated Tasks' },
      { key: 'can_run_autotasks', label: 'Run Automated Tasks' },
    ],
  },
  {
    label: 'Scripts & Software',
    prefix: 'can_',
    perms: [
      { key: 'can_list_scripts', label: 'View Scripts' },
      { key: 'can_manage_scripts', label: 'Manage Scripts' },
      { key: 'can_list_software', label: 'View Software' },
      { key: 'can_manage_software', label: 'Manage Software' },
      { key: 'can_manage_winsvcs', label: 'Manage Windows Services' },
      { key: 'can_manage_winupdates', label: 'Manage Windows Updates' },
    ],
  },
  {
    label: 'Alerts & Monitoring',
    prefix: 'can_',
    perms: [
      { key: 'can_list_alerts', label: 'View Alerts' },
      { key: 'can_manage_alerts', label: 'Manage Alerts' },
      { key: 'can_list_notes', label: 'View Notes' },
      { key: 'can_manage_notes', label: 'Manage Notes' },
    ],
  },
  {
    label: 'Administration',
    prefix: 'can_',
    perms: [
      { key: 'can_view_core_settings', label: 'View Core Settings' },
      { key: 'can_edit_core_settings', label: 'Edit Core Settings' },
      { key: 'can_list_accounts', label: 'View Accounts' },
      { key: 'can_manage_accounts', label: 'Manage Accounts' },
      { key: 'can_list_roles', label: 'View Roles' },
      { key: 'can_manage_roles', label: 'Manage Roles' },
      { key: 'can_list_api_keys', label: 'View API Keys' },
      { key: 'can_manage_api_keys', label: 'Manage API Keys' },
      { key: 'can_view_auditlogs', label: 'View Audit Logs' },
      { key: 'can_view_debuglogs', label: 'View Debug Logs' },
      { key: 'can_view_reports', label: 'View Reports' },
      { key: 'can_manage_reports', label: 'Manage Reports' },
      { key: 'can_do_server_maint', label: 'Server Maintenance' },
      { key: 'can_run_server_scripts', label: 'Run Server Scripts' },
      { key: 'can_use_webterm', label: 'Use Web Terminal' },
    ],
  },
]

const UserManagement = () => {
  const [activeView, setActiveView] = useState<'users' | 'roles'>('users')
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Add user form
  const [showAddUser, setShowAddUser] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', email: '', password: '', first_name: '', last_name: '', role: 0 })

  // Edit user state
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editForm, setEditForm] = useState({ first_name: '', last_name: '', email: '', is_active: true, role: 0 as number | null, block_dashboard_login: false })
  const [newPassword, setNewPassword] = useState('')
  const [_saved, setSaved] = useState(false)

  // Add role form
  const [showAddRole, setShowAddRole] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [roleForm, setRoleForm] = useState<Partial<Role>>({ name: '', is_superuser: false })

  const token = localStorage.getItem('token')
  const serverBase = API_BASE_URL

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      const [usersResp, rolesResp] = await Promise.all([
        fetch(`${serverBase}/accounts/users/`, { headers }),
        fetch(`${serverBase}/accounts/roles/`, { headers }),
      ])
      const usersData = usersResp.ok ? await usersResp.json() : []
      const rolesData = rolesResp.ok ? await rolesResp.json() : []
      setUsers(Array.isArray(usersData) ? usersData : [])
      setRoles(Array.isArray(rolesData) ? rolesData : [])
      if (!usersResp.ok) {
        if (usersResp.status === 401) {
          setError('Session expired — please log out and log back in')
        } else {
          setError(`Failed to load users (HTTP ${usersResp.status})`)
        }
      } else if (!rolesResp.ok) {
        if (rolesResp.status === 401) {
          setError('Session expired — please log out and log back in')
        } else {
          setError(`Failed to load roles (HTTP ${rolesResp.status})`)
        }
      }
    } catch (e) { setError('Failed to load data: ' + (e instanceof Error ? e.message : String(e))) }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const addUser = async () => {
    if (!newUser.username || !newUser.password) return
    setSaving(true)
    setError('')
    try {
      const body: any = { username: newUser.username, email: newUser.email, password: newUser.password }
      if (newUser.first_name) body.first_name = newUser.first_name
      if (newUser.last_name) body.last_name = newUser.last_name
      if (newUser.role) body.role = newUser.role
      const resp = await fetch(`${serverBase}/accounts/users/`, { method: 'POST', headers, body: JSON.stringify(body) })
      if (!resp.ok) {
        const err = await resp.text()
        setError(err)
        setSaving(false)
        return
      }
      setShowAddUser(false)
      setNewUser({ username: '', email: '', password: '', first_name: '', last_name: '', role: 0 })
      await fetchData()
    } catch { setError('Failed to add user') }
    setSaving(false)
  }

  const deleteUser = async (id: number, username: string) => {
    if (!confirm(`Delete user "${username}"?`)) return
    try {
      await fetch(`${serverBase}/accounts/${id}/users/`, { method: 'DELETE', headers })
      await fetchData()
    } catch { setError('Failed to delete user') }
  }



  const openEditUser = (user: User) => {
    setEditingUser(user)
    setEditForm({
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      is_active: user.is_active,
      role: user.role,
      block_dashboard_login: user.block_dashboard_login,
    })
    setNewPassword('')
  }

  const saveEditUser = async () => {
    if (!editingUser) return
    setSaving(true)
    setError('')
    try {
      const resp = await fetch(`${serverBase}/accounts/${editingUser.id}/users/`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(editForm),
      })
      if (!resp.ok) {
        const err = await resp.text()
        setError(err)
        setSaving(false)
        return
      }
      // If password was provided, reset it separately
      if (newPassword) {
        const pwResp = await fetch(`${serverBase}/accounts/users/reset/`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ id: editingUser.id, password: newPassword }),
        })
        if (!pwResp.ok) {
          setError('User saved but password reset failed')
          setSaving(false)
          return
        }
      }
      setEditingUser(null)
      setNewPassword('')
      await fetchData()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch { setError('Failed to update user') }
    setSaving(false)
  }

  const resetMFA = async (userId: number) => {
    if (!confirm('Reset this user\'s 2FA/MFA? They will need to set it up again on next login.')) return
    try {
      await fetch(`${serverBase}/accounts/users/reset_totp/`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ id: userId }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch { setError('Failed to reset MFA') }
  }

  const setupMFA = async (userId: number) => {
    if (!confirm('Enable 2FA/MFA for this user? A TOTP key will be generated. They will need an authenticator app.')) return
    try {
      await fetch(`${serverBase}/accounts/users/setup_totp/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ id: userId }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch { setError('Failed to setup MFA') }
  }

  const createRole = async () => {
    if (!roleForm.name) return
    setSaving(true)
    setError('')
    try {
      const resp = await fetch(`${serverBase}/accounts/roles/`, { method: 'POST', headers, body: JSON.stringify(roleForm) })
      if (!resp.ok) {
        const err = await resp.text()
        setError(err)
        setSaving(false)
        return
      }
      setShowAddRole(false)
      setRoleForm({ name: '', is_superuser: false })
      await fetchData()
    } catch { setError('Failed to create role') }
    setSaving(false)
  }

  const updateRole = async () => {
    if (!editingRole) return
    setSaving(true)
    setError('')
    try {
      const resp = await fetch(`${serverBase}/accounts/roles/${editingRole.id}/`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(roleForm),
      })
      if (!resp.ok) {
        const err = await resp.text()
        setError(err)
        setSaving(false)
        return
      }
      setEditingRole(null)
      setRoleForm({ name: '', is_superuser: false })
      await fetchData()
    } catch { setError('Failed to update role') }
    setSaving(false)
  }

  const deleteRole = async (id: number, name: string) => {
    if (!confirm(`Delete role "${name}"?`)) return
    try {
      await fetch(`${serverBase}/accounts/roles/${id}/`, { method: 'DELETE', headers })
      await fetchData()
    } catch { setError('Failed to delete role') }
  }

  const editRole = (role: Role) => {
    setEditingRole(role)
    setRoleForm({ ...role })
  }

  const toggleRolePerm = (key: string) => {
    setRoleForm(prev => ({ ...prev, [key]: !(prev as any)[key] }))
  }

  const enableAllInGroup = (groupIdx: number) => {
    const updated = { ...roleForm }
    PERMISSION_GROUPS[groupIdx].perms.forEach(p => { (updated as any)[p.key] = true })
    setRoleForm(updated)
  }

  const disableAllInGroup = (groupIdx: number) => {
    const updated = { ...roleForm }
    PERMISSION_GROUPS[groupIdx].perms.forEach(p => { (updated as any)[p.key] = false })
    setRoleForm(updated)
  }

  const getRoleName = (roleId: number | null) => {
    if (!roleId) return '—'
    const role = roles.find(r => r.id === roleId)
    return role ? role.name : '—'
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Users & Roles</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage user accounts and role-based access control</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setActiveView('users')} className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${activeView === 'users' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
            👤 Users
          </button>
          <button onClick={() => setActiveView('roles')} className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${activeView === 'roles' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
            🛡️ Roles
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-600 dark:text-red-400 text-sm flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-300">✕</button>
        </div>
      )}

      {/* ===== USERS VIEW ===== */}
      {activeView === 'users' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowAddUser(true)} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">+ Add User</button>
          </div>

          {showAddUser && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">New User</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username *</label>
                  <input type="text" value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password *</label>
                  <input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name</label>
                  <input type="text" value={newUser.first_name} onChange={e => setNewUser({ ...newUser, first_name: e.target.value })} className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
                  <input type="text" value={newUser.last_name} onChange={e => setNewUser({ ...newUser, last_name: e.target.value })} className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                  <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: parseInt(e.target.value) })} className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white">
                    <option value={0}>No role</option>
                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}{r.is_superuser ? ' (Superuser)' : ''}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={addUser} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? 'Creating...' : 'Create User'}</button>
                <button onClick={() => { setShowAddUser(false); setNewUser({ username: '', email: '', password: '', first_name: '', last_name: '', role: 0 }) }} className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">Cancel</button>
              </div>
            </div>
          )}

          {/* Edit User Modal */}
          {editingUser && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Edit User: {editingUser.username}</h2>
                <button onClick={() => { setEditingUser(null); setNewPassword('') }} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name</label>
                  <input type="text" value={editForm.first_name} onChange={e => setEditForm({ ...editForm, first_name: e.target.value })} className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
                  <input type="text" value={editForm.last_name} onChange={e => setEditForm({ ...editForm, last_name: e.target.value })} className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                  <select value={editForm.role || 0} onChange={e => setEditForm({ ...editForm, role: e.target.value ? parseInt(e.target.value) : null })} className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white">
                    <option value={0}>No role</option>
                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}{r.is_superuser ? ' (Superuser)' : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Leave blank to keep current" className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white" />
                </div>
                <div className="flex items-end gap-4">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditForm({ ...editForm, is_active: !editForm.is_active })} className={`relative w-10 h-6 rounded-full transition-colors ${editForm.is_active ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`} >
                      <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${editForm.is_active ? 'translate-x-4' : ''}`} />
                    </button>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{editForm.is_active ? 'Active' : 'Disabled'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditForm({ ...editForm, block_dashboard_login: !editForm.block_dashboard_login })} className={`relative w-10 h-6 rounded-full transition-colors ${editForm.block_dashboard_login ? 'bg-red-600' : 'bg-gray-300 dark:bg-gray-600'}`} >
                      <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${editForm.block_dashboard_login ? 'translate-x-4' : ''}`} />
                    </button>
                    <span className="text-sm text-gray-700 dark:text-gray-300">Block Login</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">🔒 MFA / Two-Factor Authentication</h3>
                <div className="flex gap-3">
                  <button onClick={() => setupMFA(editingUser.id)} className="px-3 py-1.5 text-xs bg-green-500/10 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-500/20">
                    🔑 Setup MFA
                  </button>
                  <button onClick={() => resetMFA(editingUser.id)} className="px-3 py-1.5 text-xs bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 rounded-lg hover:bg-yellow-500/20">
                    🔄 Reset MFA
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Setup MFA generates a TOTP key. The user will need an authenticator app (Google Authenticator, Authy, etc.). Reset MFA removes the key so the user can log in without 2FA or set it up again.</p>
              </div>

              <div className="flex gap-2">
                <button onClick={saveEditUser} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button onClick={() => { setEditingUser(null); setNewPassword('') }} className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Users Table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left px-5 py-3 font-medium text-gray-500 dark:text-gray-400">User</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 dark:text-gray-400">Email</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 dark:text-gray-400">Role</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 dark:text-gray-400">Status</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 dark:text-gray-400">Last Login</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-750">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xs font-bold">
                          {(user.first_name?.[0] || user.username[0]).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">{user.username}</div>
                          {user.first_name || user.last_name ? <div className="text-xs text-gray-400">{user.first_name} {user.last_name}</div> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{user.email || '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${user.role ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
                        {getRoleName(user.role)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${user.is_active ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
                        {user.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs">{user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}</td>
                    <td className="px-5 py-3 text-right space-x-1">
                      <button onClick={() => openEditUser(user)} className="px-2 py-1 text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-500/20">
                        Edit
                      </button>
                      <button onClick={() => deleteUser(user.id, user.username)} className="px-2 py-1 text-xs bg-red-500/10 text-red-600 dark:text-red-400 rounded hover:bg-red-500/20">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users.length === 0 && (
              <div className="p-8 text-center text-gray-400">No users found</div>
            )}
          </div>
        </div>
      )}

      {/* ===== ROLES VIEW ===== */}
      {activeView === 'roles' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setShowAddRole(true); setRoleForm({ name: '', is_superuser: false }) }} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">+ Add Role</button>
          </div>

          {/* Add/Edit Role Form */}
          {(showAddRole || editingRole) && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{editingRole ? `Edit Role: ${editingRole.name}` : 'New Role'}</h2>
                <button onClick={() => { setShowAddRole(false); setEditingRole(null); setRoleForm({ name: '', is_superuser: false }) }} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role Name</label>
                  <input type="text" value={roleForm.name || ''} onChange={e => setRoleForm({ ...roleForm, name: e.target.value })} placeholder="e.g. Read Only, Technician, Admin" className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white" />
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <button onClick={() => setRoleForm({ ...roleForm, is_superuser: !roleForm.is_superuser })} className={`relative w-10 h-6 rounded-full transition-colors ${roleForm.is_superuser ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                    <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${roleForm.is_superuser ? 'translate-x-4' : ''}`} />
                  </button>
                  <span className="text-sm text-gray-700 dark:text-gray-300">Superuser</span>
                </div>
              </div>

              {roleForm.is_superuser && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-700 dark:text-blue-400">
                  ⚡ Superuser has full access to everything — all permissions below are ignored.
                </div>
              )}

              {!roleForm.is_superuser && (
                <div className="space-y-4">
                  {PERMISSION_GROUPS.map((group, gIdx) => (
                    <div key={gIdx} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-900">
                        <h3 className="text-sm font-medium text-gray-900 dark:text-white">{group.label}</h3>
                        <div className="flex gap-2">
                          <button onClick={() => enableAllInGroup(gIdx)} className="text-xs text-blue-500 hover:text-blue-400">All</button>
                          <button onClick={() => disableAllInGroup(gIdx)} className="text-xs text-gray-400 hover:text-gray-500">None</button>
                        </div>
                      </div>
                      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                        {group.perms.map(perm => (
                          <label key={perm.key} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!(roleForm as any)[perm.key]}
                              onChange={() => toggleRolePerm(perm.key)}
                              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-xs text-gray-700 dark:text-gray-300">{perm.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={editingRole ? updateRole : createRole} disabled={saving || !roleForm.name} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Saving...' : editingRole ? 'Update Role' : 'Create Role'}
                </button>
                <button onClick={() => { setShowAddRole(false); setEditingRole(null); setRoleForm({ name: '', is_superuser: false }) }} className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">Cancel</button>
              </div>
            </div>
          )}

          {/* Roles List */}
          <div className="space-y-3">
            {roles.map(role => (
              <div key={role.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{role.name}</h3>
                    {role.is_superuser && <span className="px-1.5 py-0.5 text-[10px] bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 rounded-full font-medium">SUPERUSER</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{role.user_count || 0} user{(role.user_count || 0) !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => editRole(role)} className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">Edit</button>
                  <button onClick={() => deleteRole(role.id, role.name)} className="px-3 py-1.5 text-xs bg-red-500/10 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-500/20">Delete</button>
                </div>
              </div>
            ))}
            {roles.length === 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-400">
                No roles yet. Create one to control user permissions.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default UserManagement
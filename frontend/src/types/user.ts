export interface User {
  id: string
  username: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
  status: 'active' | 'inactive' | 'suspended'
  lastLogin?: string
  createdAt: string
  twoFactorEnabled: boolean
  permissions: Permission[]
  avatarUrl?: string
}

export type UserRole = 'superadmin' | 'admin' | 'technician' | 'viewer'

export interface Permission {
  resource: string
  actions: ('create' | 'read' | 'update' | 'delete' | 'execute')[]
}

export interface RoleTemplate {
  id: string
  name: UserRole
  description: string
  permissions: Permission[]
}

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    id: 'superadmin',
    name: 'superadmin',
    description: 'Full system access',
    permissions: [
      { resource: '*', actions: ['create', 'read', 'update', 'delete', 'execute'] },
    ],
  },
  {
    id: 'admin',
    name: 'admin',
    description: 'Can manage users and settings',
    permissions: [
      { resource: 'devices', actions: ['create', 'read', 'update', 'delete', 'execute'] },
      { resource: 'users', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'scripts', actions: ['create', 'read', 'update', 'delete', 'execute'] },
      { resource: 'policies', actions: ['create', 'read', 'update', 'delete'] },
    ],
  },
  {
    id: 'technician',
    name: 'technician',
    description: 'Can manage devices and run scripts',
    permissions: [
      { resource: 'devices', actions: ['read', 'update', 'execute'] },
      { resource: 'scripts', actions: ['read', 'execute'] },
      { resource: 'alerts', actions: ['read', 'update'] },
    ],
  },
  {
    id: 'viewer',
    name: 'viewer',
    description: 'Read-only access',
    permissions: [
      { resource: 'devices', actions: ['read'] },
      { resource: 'alerts', actions: ['read'] },
      { resource: 'reports', actions: ['read'] },
    ],
  },
]

export interface UserActivity {
  id: string
  userId: string
  action: string
  resource: string
  resourceId?: string
  details?: string
  ipAddress: string
  userAgent: string
  timestamp: string
}

import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { usePathname } from '../lib/route'
import { roleDefinitions, type StaffRole } from '../types/auth'
import { AppLink } from './AppLink'
import { BriefcaseIcon, FileIcon, GridIcon, LogOutIcon, SparkIcon, UsersIcon } from './icons'

const routeMeta: Record<string, { label: string; icon: typeof GridIcon }> = {
  '/': { label: 'Overview', icon: GridIcon },
  '/staff-access': { label: 'Staff access', icon: UsersIcon },
  '/positions': { label: 'Positions', icon: BriefcaseIcon },
  '/workflows': { label: 'Workflows', icon: SparkIcon },
  '/candidates': { label: 'Candidates', icon: FileIcon },
  '/assignments': { label: 'Assignments', icon: FileIcon },
  '/candidate-review': { label: 'Candidate review', icon: FileIcon },
  '/overview': { label: 'Recruitment overview', icon: GridIcon },
}

function initials(name: string | null, email: string) {
  const source = name?.trim() || email
  return source.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'A'
}

export function AppShell({ children, role }: { children: ReactNode; role: StaffRole }) {
  const { profile, logout } = useAuth()
  const path = usePathname()
  const roleDefinition = roleDefinitions[role]

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-mark">A</span>
          <div><strong>ALTRIUM</strong><span>Recruitment workspace</span></div>
        </div>

        <nav className="primary-nav" aria-label="Main navigation">
          <span className="nav-eyebrow">Workspace</span>
          {roleDefinition.routes.map((route) => {
            const meta = routeMeta[route]
            const Icon = meta.icon
            return <AppLink key={route} to={route} current={path === route || (route !== '/' && path.startsWith(`${route}/`))} className="nav-link"><Icon /><span>{meta.label}</span></AppLink>
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <span className="avatar" style={{ background: roleDefinition.accent }}>{initials(profile?.full_name ?? null, profile?.email ?? '')}</span>
            <div><strong>{profile?.full_name || 'Altrium staff'}</strong><span>{roleDefinition.shortLabel}</span></div>
          </div>
          <button type="button" className="logout-button" onClick={() => void logout()}><LogOutIcon />Sign out</button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  )
}

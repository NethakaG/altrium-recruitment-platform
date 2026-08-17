import { useAuth } from '../context/AuthContext'
import { roleDefinitions, type StaffRole } from '../types/auth'
import { EyeIcon, LockIcon, ShieldIcon } from '../components/icons'

export function DashboardPage({ role }: { role: StaffRole }) {
  const { profile } = useAuth()
  const definition = roleDefinitions[role]
  return (
    <div className="page-shell">
      <header className="page-header"><div><span className="eyebrow dark">Private workspace</span><h1>Good day{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}.</h1><p>Your staff access is active and your recruitment workspace is ready.</p></div><span className="status-pill"><span />Access active</span></header>
      <section className="welcome-card" style={{ '--role-accent': definition.accent } as React.CSSProperties}>
        <div><span className="role-chip">{definition.label}</span><h2>{definition.summary}</h2><p>Positions, position workflows, candidate CVs and role-specific recruitment views are connected to Supabase.</p></div>
        <span className="role-monogram">{definition.shortLabel.slice(0, 2).toUpperCase()}</span>
      </section>
      <section className="foundation-grid" aria-label="Foundation status">
        <article><span className="foundation-icon"><ShieldIcon /></span><div><strong>Supabase Auth</strong><p>Email and password sessions with persistent sign-in.</p></div><span className="check">Ready</span></article>
        <article><span className="foundation-icon"><LockIcon /></span><div><strong>Role enforcement</strong><p>Inactive or unassigned accounts cannot enter the workspace.</p></div><span className="check">Ready</span></article>
        <article><span className="foundation-icon"><EyeIcon /></span><div><strong>Scoped navigation</strong><p>Each role sees only the routes assigned to it.</p></div><span className="check">Ready</span></article>
      </section>
      <section className="next-module"><span>Available now</span><h2>Candidate and CV Management</h2><p>Open your candidate workspace to review permitted applications, extracted CV profiles and current recruitment stages.</p></section>
    </div>
  )
}

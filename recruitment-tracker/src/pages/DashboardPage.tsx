import { useAuth } from '../context/AuthContext'

export function DashboardPage() {
  const { profile } = useAuth()
  return (
    <div className="page-shell">
      <header className="page-header"><div><span className="eyebrow dark">Private workspace</span><h1>Good day{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}.</h1><p>Your staff access is active and your recruitment workspace is ready.</p></div></header>
      <section className="empty-module"><span>Sprint 2</span><h2>This section will be ready in Sprint 2.</h2><p>Role-specific recruitment statistics, progress summaries and management reporting will be implemented under Backlog Feature 9.</p></section>
    </div>
  )
}

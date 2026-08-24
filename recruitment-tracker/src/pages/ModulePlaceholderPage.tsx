import { roleDefinitions, type StaffRole } from '../types/auth'

const titles: Record<string, string> = {
  '/staff-access': 'Staff access',
  '/positions': 'Positions',
  '/candidates': 'Candidates',
  '/assignments': 'Assignments',
  '/candidate-review': 'Candidate review',
  '/overview': 'Recruitment overview',
}

export function ModulePlaceholderPage({ path, role }: { path: string; role: StaffRole }) {
  return <div className="page-shell"><header className="page-header"><div><span className="eyebrow dark">{roleDefinitions[role].shortLabel} workspace</span><h1>{titles[path] ?? 'Workspace'}</h1><p>This route is permission-protected. Its product functionality will be implemented in the relevant backlog step.</p></div></header><section className="empty-module"><span>Foundation verified</span><h2>This module is intentionally not built yet.</h2><p>Authentication and access control come first. The next implementation step is Job Position Management.</p></section></div>
}

import { useEffect } from 'react'
import { AppShell } from './components/AppShell'
import { useAuth } from './context/AuthContext'
import { navigate, usePathname } from './lib/route'
import { canAccessPath, canManageCandidates, canManagePositions, candidateBasePath } from './types/auth'
import { AccessPendingPage } from './pages/AccessPendingPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { ModulePlaceholderPage } from './pages/ModulePlaceholderPage'
import { CreatePositionPage } from './pages/CreatePositionPage'
import { PositionDetailsPage } from './pages/PositionDetailsPage'
import { PositionsPage } from './pages/PositionsPage'
import { WorkflowPage } from './pages/WorkflowPage'
import { CandidatesPage } from './pages/CandidatesPage'
import { CandidateDetailsPage } from './pages/CandidateDetailsPage'
import { UnauthorizedPage } from './pages/UnauthorizedPage'

function LoadingScreen() {
  return <main className="state-page"><div className="loading-mark" aria-label="Checking staff access"><span>A</span></div></main>
}

export default function App() {
  const path = usePathname()
  const { status, profile } = useAuth()

  useEffect(() => {
    if (status === 'signed_out' && path !== '/login') navigate('/login')
    if (status === 'active' && path === '/login') navigate('/')
    if (status === 'pending' && path !== '/access-pending') navigate('/access-pending')
  }, [path, status])

  if (status === 'loading') return <LoadingScreen />
  if (path === '/login') return <LoginPage />
  if (status === 'pending' || path === '/access-pending') return <AccessPendingPage />
  if (status !== 'active' || !profile?.role) return <LoadingScreen />

  const allowed = canAccessPath(profile.role, path)
  const canManage = canManagePositions(profile.role)
  const candidatePath = candidateBasePath(profile.role)
  let content

  if (!allowed || (path === '/positions/new' && !canManage)) content = <UnauthorizedPage />
  else if (path === '/') content = <DashboardPage role={profile.role} />
  else if (path === '/positions') content = <PositionsPage canManage={canManage} />
  else if (path === '/positions/new') content = <CreatePositionPage />
  else if (path.startsWith('/positions/')) content = <PositionDetailsPage positionId={decodeURIComponent(path.slice('/positions/'.length))} canManage={canManage} />
  else if (path === '/workflows') content = <WorkflowPage canManage={canManage} />
  else if (path.startsWith('/workflows/')) content = <WorkflowPage selectedPositionId={decodeURIComponent(path.slice('/workflows/'.length))} canManage={canManage} />
  else if (path === candidatePath) content = <CandidatesPage role={profile.role} basePath={candidatePath} />
  else if (path.startsWith(`${candidatePath}/`)) content = <CandidateDetailsPage candidateId={decodeURIComponent(path.slice(candidatePath.length + 1))} basePath={candidatePath} canManage={canManageCandidates(profile.role)} />
  else content = <ModulePlaceholderPage path={path} role={profile.role} />

  return <AppShell role={profile.role}>{content}</AppShell>
}

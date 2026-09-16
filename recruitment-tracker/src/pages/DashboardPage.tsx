import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AppLink } from '../components/AppLink'
import { useAuth } from '../context/AuthContext'
import { loadDashboardData, type DashboardData } from '../services/dashboard'
import { candidateBasePath, roleDefinitions, type StaffRole } from '../types/auth'
import type { Candidate } from '../types/candidates'
import type { Interview } from '../types/interviews'

const emptyData: DashboardData = { positions: [], candidates: [], interviews: [], decisions: [], staff: [] }

function dateKey(value: string | Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
}

function Metric({ label, value, note }: { label: string; value: number | string; note: string }) {
  return <article><span>{label}</span><strong>{value}</strong><small>{note}</small></article>
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="dashboard-empty">{children}</div>
}

function formatWhen(value: string) {
  return new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Colombo' }).format(new Date(value))
}

function positionStageSummary(candidates: Candidate[]) {
  const counts = new Map<string, number>()
  for (const candidate of candidates) {
    const label = candidate.application_status === 'Active' ? candidate.current_stage?.name ?? 'No stage' : candidate.application_status
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, total]) => `${label}: ${total}`).join(' · ') || 'No candidates'
}

function DashboardPositionTable({ data, basePath }: { data: DashboardData; basePath: string }) {
  if (!data.positions.length) return <Empty>No positions are available yet.</Empty>
  return <div className="dashboard-position-list">{data.positions.map((position) => {
    const candidates = data.candidates.filter((candidate) => candidate.position_id === position.id)
    return <article key={position.id}>
      <div><span>{position.department}</span><strong>{position.title}</strong><small>{position.status} · {position.screening_status} screening</small></div>
      <div><strong>{candidates.length}</strong><span>candidates</span></div>
      <p>{positionStageSummary(candidates)}</p>
      <AppLink to={candidates.length ? basePath : `/positions/${position.id}`}>View details</AppLink>
    </article>
  })}</div>
}

function InterviewList({ interviews }: { interviews: Interview[] }) {
  if (!interviews.length) return <Empty>No interviews match this view.</Empty>
  return <div className="dashboard-agenda">{interviews.slice(0, 8).map((interview) => <article key={interview.id}>
    <time>{formatWhen(interview.scheduled_start)}</time>
    <div><strong>{interview.candidate?.candidate_name || 'Candidate'}</strong><span>{interview.position?.title || 'Position'} · {interview.stage?.name || 'Interview'}</span></div>
    <span className={`interview-status status-${interview.status}`}>{interview.status.replaceAll('_', ' ')}</span>
  </article>)}</div>
}

export function DashboardPage() {
  const { profile } = useAuth()
  const role = profile?.role as StaffRole
  const [data, setData] = useState<DashboardData>(emptyData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [positionFilter, setPositionFilter] = useState('all')

  const load = useCallback(async () => {
    if (!role) return
    setLoading(true)
    setError(null)
    try {
      setData(await loadDashboardData(role))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The overview could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [role])

  useEffect(() => { void load() }, [load])

  const scoped = useMemo<DashboardData>(() => {
    if (positionFilter === 'all') return data
    return {
      ...data,
      positions: data.positions.filter((position) => position.id === positionFilter),
      candidates: data.candidates.filter((candidate) => candidate.position_id === positionFilter),
      interviews: data.interviews.filter((interview) => interview.candidate?.position_id === positionFilter),
      decisions: data.decisions.filter((decision) => decision.position_id === positionFilter),
    }
  }, [data, positionFilter])

  const now = new Date()
  const today = dateKey(now)
  const openPositions = scoped.positions.filter((position) => position.status === 'Open').length
  const closedPositions = scoped.positions.filter((position) => position.status === 'Closed').length
  const upcoming = scoped.interviews.filter((interview) => ['scheduled', 'in_progress'].includes(interview.status) && new Date(interview.scheduled_start) >= now)
  const todayInterviews = scoped.interviews.filter((interview) => dateKey(interview.scheduled_start) === today && interview.status !== 'cancelled')
  const extractionFailures = scoped.candidates.filter((candidate) => candidate.processing_status === 'Failed').length
  const screeningFailures = scoped.positions.filter((position) => position.screening_status === 'Failed').length
  const emailFailures = scoped.interviews.reduce((total, interview) => total + interview.notifications.filter((notification) => notification.status === 'failed').length, 0)
  const feedbackDue = scoped.interviews.filter((interview) => interview.status === 'awaiting_feedback').length
  const pendingFinal = scoped.decisions.filter((decision) => decision.decision_status === 'pending_approval').length
  const returnedFinal = scoped.decisions.filter((decision) => decision.decision_status === 'returned').length
  const hired = scoped.candidates.filter((candidate) => candidate.application_status === 'Hired').length
  const rejected = scoped.candidates.filter((candidate) => candidate.application_status === 'Rejected').length
  const closedDurations = scoped.positions.filter((position) => position.closed_at).map((position) => Math.max(0, Math.round((new Date(position.closed_at!).getTime() - new Date(position.opening_date).getTime()) / 86_400_000)))
  const averageDuration = closedDurations.length ? Math.round(closedDurations.reduce((sum, days) => sum + days, 0) / closedDurations.length) : 0
  const basePath = candidateBasePath(role)

  return (
    <div className="page-shell dashboard-page">
      <header className="page-header dashboard-header"><div><span className="eyebrow dark">{roleDefinitions[role].label} workspace</span><h1>Good day{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}.</h1><p>Your staff access is active. This overview shows the work and decisions relevant to your role.</p></div><button type="button" className="secondary-button" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh overview'}</button></header>

      {error && <div className="auth-error" role="alert">{error}</div>}
      {loading && !data.positions.length && !data.interviews.length ? <div className="module-loading">Preparing your overview…</div> : <>
        <div className="dashboard-filter-row"><label><span>Position</span><select value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)}><option value="all">All positions</option>{data.positions.map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}</select></label><small>All dates and times use Sri Lanka time.</small></div>

        {(role === 'hr_recruiter' || role === 'it_admin') && <>
          <section className="dashboard-metrics"><Metric label="Open positions" value={openPositions} note={`${closedPositions} closed`} /><Metric label="Candidates" value={scoped.candidates.length} note={`${extractionFailures} extraction failures`} /><Metric label="Upcoming interviews" value={upcoming.length} note={`${todayInterviews.length} today`} /><Metric label="Action items" value={extractionFailures + screeningFailures + feedbackDue + returnedFinal} note="Needs staff attention" /></section>
          <div className="dashboard-grid"><section className="dashboard-panel"><header><div><span>Recruitment flow</span><h2>Positions and candidate stages</h2></div><AppLink to={basePath}>Open candidates</AppLink></header><DashboardPositionTable data={scoped} basePath={basePath} /></section><section className="dashboard-panel"><header><div><span>Operational queue</span><h2>Items needing attention</h2></div></header><div className="dashboard-actions">
            <AppLink to={basePath}><strong>{extractionFailures}</strong><span>Failed CV extractions</span></AppLink>
            <AppLink to="/positions"><strong>{screeningFailures}</strong><span>Failed position screenings</span></AppLink>
            <AppLink to="/interviews"><strong>{feedbackDue}</strong><span>Interviews awaiting feedback</span></AppLink>
            <AppLink to="/final-decisions"><strong>{returnedFinal}</strong><span>Returned final recommendations</span></AppLink>
          </div></section></div>
          <section className="dashboard-panel"><header><div><span>Schedule</span><h2>Upcoming interviews</h2></div><AppLink to="/interviews">Open interview workspace</AppLink></header><InterviewList interviews={upcoming} /></section>
        </>}

        {role === 'interviewer' && <>
          <section className="dashboard-metrics"><Metric label="Today" value={todayInterviews.length} note="Assigned interviews" /><Metric label="Upcoming" value={upcoming.length} note="Scheduled from now" /><Metric label="In progress" value={scoped.interviews.filter((interview) => interview.status === 'in_progress').length} note="Currently running" /><Metric label="Feedback due" value={feedbackDue} note="Requires your submission" /></section>
          <div className="dashboard-grid"><section className="dashboard-panel"><header><div><span>Personal agenda</span><h2>Your next interviews</h2></div><AppLink to="/assignments">Open assignments</AppLink></header><InterviewList interviews={[...scoped.interviews].filter((interview) => interview.status !== 'cancelled').sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime())} /></section><section className="dashboard-panel"><header><div><span>Availability</span><h2>Manage your calendar</h2></div><AppLink to="/availability">Open calendar</AppLink></header><div className="dashboard-callout"><strong>Keep your calendar current</strong><p>Add meetings and unavailable periods so recruiters only select genuine free time inside your Monday–Friday working schedule.</p></div></section></div>
        </>}

        {role === 'hiring_manager' && <>
          <section className="dashboard-metrics"><Metric label="Candidates in view" value={scoped.candidates.length} note="Role-permitted records" /><Metric label="Final recommendations" value={scoped.decisions.length} note="Submitted decisions" /><Metric label="Awaiting approval" value={pendingFinal} note="With Executive" /><Metric label="Returned" value={returnedFinal} note="Needs your revision" /></section>
          <div className="dashboard-grid"><section className="dashboard-panel"><header><div><span>Candidate review</span><h2>Position-specific pipeline</h2></div><AppLink to="/candidate-review">Review candidates</AppLink></header><DashboardPositionTable data={scoped} basePath="/candidate-review" /></section><section className="dashboard-panel"><header><div><span>Final decision flow</span><h2>Recommendation status</h2></div><AppLink to="/final-decisions">Open final decisions</AppLink></header><div className="dashboard-actions"><AppLink to="/final-decisions"><strong>{pendingFinal}</strong><span>Pending Executive approval</span></AppLink><AppLink to="/final-decisions"><strong>{returnedFinal}</strong><span>Returned for revision</span></AppLink><AppLink to="/final-decisions"><strong>{scoped.decisions.filter((decision) => decision.decision_status === 'approved').length}</strong><span>Approved outcomes</span></AppLink></div></section></div>
        </>}

        {role === 'management_user' && <>
          <section className="dashboard-metrics"><Metric label="Open positions" value={openPositions} note={`${closedPositions} closed`} /><Metric label="Final approvals" value={pendingFinal} note="Awaiting decision" /><Metric label="Hired" value={hired} note="Completed outcomes" /><Metric label="Average duration" value={`${averageDuration}d`} note="Opening to closure" /></section>
          <div className="dashboard-grid"><section className="dashboard-panel"><header><div><span>Management funnel</span><h2>Recruitment outcomes</h2></div><AppLink to="/overview">Open recruitment overview</AppLink></header><div className="executive-funnel"><div><strong>{scoped.candidates.length}</strong><span>Visible finalists</span></div><div><strong>{pendingFinal}</strong><span>Pending approval</span></div><div><strong>{hired}</strong><span>Hired</span></div><div><strong>{rejected}</strong><span>Rejected</span></div></div></section><section className="dashboard-panel"><header><div><span>Approval queue</span><h2>Final hiring decisions</h2></div><AppLink to="/final-decisions">Review decisions</AppLink></header>{pendingFinal ? <div className="dashboard-callout"><strong>{pendingFinal} recommendation{pendingFinal === 1 ? '' : 's'} ready</strong><p>Review the Hiring Manager’s evidence and either approve the outcome or return it with a reason.</p></div> : <Empty>No final recommendations are waiting for approval.</Empty>}</section></div>
        </>}

        {role === 'it_admin' && <section className="dashboard-panel system-health-panel"><header><div><span>System administration</span><h2>Access and operational health</h2></div><AppLink to="/staff-access">Manage staff access</AppLink></header><div className="system-health-grid"><div><strong>{scoped.staff.filter((member) => member.is_active).length}</strong><span>Active staff</span></div><div><strong>{scoped.staff.filter((member) => member.is_active && member.role === 'it_admin').length}</strong><span>Active IT Admins</span></div><div className={extractionFailures + screeningFailures + emailFailures ? 'warning' : ''}><strong>{extractionFailures + screeningFailures + emailFailures}</strong><span>Processing / email failures</span></div><div className={scoped.positions.filter((position) => !position.workflow_configured || !position.rubric_configured).length ? 'warning' : ''}><strong>{scoped.positions.filter((position) => !position.workflow_configured || !position.rubric_configured).length}</strong><span>Incomplete position setups</span></div></div></section>}
      </>}
    </div>
  )
}

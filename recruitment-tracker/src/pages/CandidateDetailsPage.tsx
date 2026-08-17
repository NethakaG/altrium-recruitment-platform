import { useEffect, useState } from 'react'
import { AppLink } from '../components/AppLink'
import { advanceCandidate, getCandidate, requestCvDownload, retryCvExtraction, setCandidateStatus } from '../services/candidates'
import { listWorkflowStages } from '../services/workflows'
import type { Candidate } from '../types/candidates'
import type { RecruitmentStage } from '../types/workflows'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function formatSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function CandidateDetailsPage({ candidateId, basePath, canManage }: { candidateId: string; basePath: string; canManage: boolean }) {
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [stages, setStages] = useState<RecruitmentStage[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')

  async function load() {
    const [row, allStages] = await Promise.all([getCandidate(candidateId), listWorkflowStages()])
    setCandidate(row)
    setStages(row ? allStages.filter((stage) => stage.position_id === row.position_id) : [])
  }

  useEffect(() => {
    let mounted = true
    void Promise.all([getCandidate(candidateId), listWorkflowStages()]).then(([row, allStages]) => {
      if (!mounted) return
      setCandidate(row)
      setStages(row ? allStages.filter((stage) => stage.position_id === row.position_id) : [])
    }).catch(() => { if (mounted) setMessage('We could not load this candidate.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [candidateId])

  async function run(action: string, operation: () => Promise<unknown>, success: string) {
    setBusy(action); setMessage('')
    try { await operation(); await load(); setMessage(success) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'The action could not be completed.') }
    finally { setBusy('') }
  }

  async function downloadCv() {
    setBusy('download'); setMessage('')
    try {
      const url = await requestCvDownload(candidateId)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The CV download could not be prepared.') }
    finally { setBusy('') }
  }

  if (loading) return <div className="page-shell"><div className="module-state"><span className="small-loader" />Loading candidate…</div></div>
  if (!candidate) return <div className="page-shell"><AppLink to={basePath} className="back-link">← Back to candidates</AppLink><div className="module-state module-error">{message || 'This candidate is not available to your role.'}</div></div>

  const profile = candidate.extracted_profile || {}
  const orderedStages = [...stages].sort((a, b) => a.stage_order - b.stage_order)
  const isFinalStage = candidate.current_stage?.stage_order === orderedStages.at(-1)?.stage_order

  return <div className="page-shell candidate-detail-page">
    <AppLink to={basePath} className="back-link">← Back to candidates</AppLink>
    <header className="candidate-detail-header">
      <div><span className="eyebrow dark">Candidate profile</span><h1>{candidate.candidate_name || profile.extracted_name || 'Legacy submission'}</h1><p>{candidate.position?.title} · Submitted {formatDate(candidate.submitted_at)}</p></div>
      <div className="candidate-header-actions"><span className={`application-badge application-${candidate.application_status.toLowerCase()}`}>{candidate.application_status}</span><button type="button" className="secondary-button" disabled={busy === 'download'} onClick={() => void downloadCv()}>{busy === 'download' ? 'Preparing…' : 'Download CV'}</button></div>
    </header>

    {message && <div className="candidate-message">{message}</div>}

    <div className="candidate-detail-grid">
      <div className="candidate-detail-main">
        <section className="detail-section candidate-contact"><h2>Contact details</h2><dl><div><dt>Email</dt><dd>{candidate.candidate_email || profile.extracted_email || 'Not available'}</dd></div><div><dt>Phone</dt><dd>{candidate.candidate_phone || profile.extracted_phone || 'Not available'}</dd></div><div><dt>Location</dt><dd>{profile.location || 'Not stated in CV'}</dd></div></dl></section>
        <section className="detail-section"><h2>CV profile</h2><p>{profile.professional_summary || 'The structured CV profile is not available yet.'}</p>{profile.skills?.length ? <div className="skill-list">{profile.skills.map((skill) => <span key={skill}>{skill}</span>)}</div> : null}</section>
        <section className="detail-section"><h2>Experience</h2>{profile.experience?.length ? <div className="profile-timeline">{profile.experience.map((item, index) => <article key={`${item.employer}-${index}`}><strong>{item.title || 'Role not stated'}</strong><span>{item.employer}</span><small>{[item.start_date, item.end_date].filter(Boolean).join(' — ')}</small><p>{item.description}</p></article>)}</div> : <p>No experience entries were extracted.</p>}</section>
        <section className="detail-section"><h2>Education</h2>{profile.education?.length ? <div className="profile-timeline">{profile.education.map((item, index) => <article key={`${item.institution}-${index}`}><strong>{item.qualification || item.field || 'Qualification'}</strong><span>{item.institution}</span><small>{[item.start_year, item.end_year].filter(Boolean).join(' — ')}</small></article>)}</div> : <p>No education entries were extracted.</p>}</section>
      </div>

      <aside className="candidate-detail-aside">
        <section><span>Current stage</span><h2>{candidate.current_stage?.name || 'Unavailable'}</h2><ol>{orderedStages.map((stage) => <li key={stage.id} className={stage.id === candidate.current_stage_id ? 'current' : stage.stage_order < (candidate.current_stage?.stage_order ?? 0) ? 'complete' : ''}><i>{stage.stage_order}</i><span>{stage.name}</span></li>)}</ol></section>
        {canManage && candidate.application_status === 'Active' ? <div className="candidate-actions">
          <button type="button" className="primary-button" disabled={Boolean(busy) || isFinalStage} onClick={() => void run('advance', () => advanceCandidate(candidate.id), 'Candidate moved to the next workflow stage.')}>{busy === 'advance' ? 'Moving…' : isFinalStage ? 'Final stage reached' : 'Move to next stage'}</button>
          <button type="button" className="danger-button" disabled={Boolean(busy)} onClick={() => void run('reject', () => setCandidateStatus(candidate.id, 'Rejected'), 'Candidate marked as rejected.')}>{busy === 'reject' ? 'Updating…' : 'Reject candidate'}</button>
        </div> : null}
        <section className="cv-file-card"><span>Original CV</span><strong>{candidate.original_filename}</strong><small>{formatSize(candidate.file_size)} · {candidate.processing_status}</small>{canManage && ['Pending', 'Failed'].includes(candidate.processing_status) ? <button type="button" className="text-button" disabled={Boolean(busy)} onClick={() => void run('retry', () => retryCvExtraction(candidate.id), 'CV extraction started. Refresh shortly to see the result.')}>{busy === 'retry' ? 'Starting…' : candidate.processing_status === 'Pending' ? 'Start extraction' : 'Retry extraction'}</button> : null}</section>
      </aside>
    </div>
  </div>
}

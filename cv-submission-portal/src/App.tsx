import { useCallback, useEffect, useRef, useState } from 'react'
import { ErrorMessage } from './components/ErrorMessage'
import { ArrowUpRightIcon } from './components/icons'
import { LoadingState } from './components/LoadingState'
import { SubmissionForm } from './components/SubmissionForm'
import { SubmissionSuccess } from './components/SubmissionSuccess'
import { TestModeBulkUpload } from './components/TestModeBulkUpload'
import { loadOpenPositions } from './services/positions'
import type { Position } from './types/position'

type LoadState = 'loading' | 'ready' | 'error'

function BrandMark() {
  return (
    <a className="brand" href="/" aria-label="Altrium careers home">
      <span className="brand-mark" aria-hidden="true">A</span>
      <span className="brand-copy"><strong>ALTRIUM</strong><small>Careers</small></span>
    </a>
  )
}

export default function App() {
  const [positions, setPositions] = useState<Position[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [submitted, setSubmitted] = useState(false)
  const [testMode, setTestMode] = useState(false)
  const successRef = useRef<HTMLDivElement>(null)

  const fetchPositions = useCallback(async () => {
    setLoadState('loading')
    try {
      const availablePositions = await loadOpenPositions()
      setPositions(availablePositions)
      setLoadState('ready')
    } catch {
      setLoadState('error')
    }
  }, [])

  useEffect(() => {
    void fetchPositions()
  }, [fetchPositions])

  useEffect(() => {
    if (submitted) successRef.current?.focus()
  }, [submitted])

  return (
    <div className="site-shell">
      <header className="site-header">
        <BrandMark />
        <div className="header-actions"><span className="header-label">Public application portal</span><button type="button" role="switch" aria-checked={testMode} className={`test-mode-toggle ${testMode ? 'test-mode-toggle-on' : ''}`} onClick={() => { setTestMode((current) => !current); setSubmitted(false) }}><span className="toggle-track"><i /></span><strong>Test mode</strong></button></div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-art" aria-hidden="true">
            <span className="orb orb-one" />
            <span className="orb orb-two" />
            <span className="grid-lines" />
          </div>

          <div className="hero-copy">
            <p className="eyebrow"><span /> Build what matters</p>
            <h1>Find your next<br /><em>opportunity.</em></h1>
            <p className="hero-intro">
              Join a team that values clear thinking, meaningful work, and the people behind every idea.
            </p>

            <div className="hero-stat-row" aria-label="Altrium careers values">
              <div><strong>01</strong><span>Purpose-led<br />work</span></div>
              <div><strong>02</strong><span>Room to<br />grow</span></div>
              <div><strong>03</strong><span>People<br />first</span></div>
            </div>
          </div>

          <div className="form-card">
            <div ref={successRef} tabIndex={-1}>
              {testMode && loadState === 'ready' ? <TestModeBulkUpload positions={positions} /> : submitted ? (
                <SubmissionSuccess
                  onReset={() => {
                    setSubmitted(false)
                    void fetchPositions()
                  }}
                />
              ) : loadState === 'loading' ? (
                <div className="form-loading">
                  <div className="form-heading">
                    <span>Application</span>
                    <h2>Submit your CV</h2>
                  </div>
                  <LoadingState />
                </div>
              ) : loadState === 'error' ? (
                <div className="form-system-state">
                  <ErrorMessage message="We couldn't load the available positions. Please try again." />
                  <button className="secondary-button" type="button" onClick={() => void fetchPositions()}>
                    Try again <ArrowUpRightIcon />
                  </button>
                </div>
              ) : positions.length === 0 ? (
                <div className="form-system-state no-positions">
                  <span className="system-state-number">00</span>
                  <h2>No open roles right now</h2>
                  <p>There are currently no open positions available. Please check back soon.</p>
                </div>
              ) : (
                <SubmissionForm positions={positions} onSuccess={() => setSubmitted(true)} />
              )}
            </div>
          </div>
        </section>
      </main>

      <footer>
        <span>© {new Date().getFullYear()} Altrium</span>
        <span>Careers · Colombo, Sri Lanka</span>
      </footer>
    </div>
  )
}

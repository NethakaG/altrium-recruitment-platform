import { useAuth } from '../context/AuthContext'
import { navigate } from '../lib/route'
import { LockIcon } from '../components/icons'

export function AccessPendingPage() {
  const { profile, logout, refreshProfile } = useAuth()
  return <main className="state-page"><section className="state-card"><span className="state-icon"><LockIcon /></span><span className="eyebrow dark">Access pending</span><h1>Your staff account is not active yet.</h1><p>{profile?.email ? `${profile.email} is authenticated, but` : 'This account'} has not been assigned an active Altrium role. Ask an IT Admin to activate it.</p><div className="state-actions"><button className="primary-button" onClick={() => void refreshProfile()}>Check access again</button><button className="secondary-button" onClick={() => { void logout(); navigate('/login') }}>Sign out</button></div></section></main>
}

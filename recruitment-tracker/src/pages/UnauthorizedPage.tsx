import { navigate } from '../lib/route'
import { ShieldIcon } from '../components/icons'

export function UnauthorizedPage() {
  return <div className="page-shell centered-page"><section className="state-card compact"><span className="state-icon"><ShieldIcon /></span><span className="eyebrow dark">Restricted area</span><h1>You do not have access to this page.</h1><p>Your assigned role does not include this workspace area.</p><button className="primary-button" onClick={() => navigate('/')}>Return to overview</button></section></div>
}

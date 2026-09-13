import { AppLink } from '../components/AppLink'

export function PrivacyPage() {
  return (
    <main className="privacy-page">
      <header className="privacy-header">
        <AppLink to="/login" className="brand-lockup brand-lockup-light" aria-label="Return to Altrium sign in">
          <span className="brand-mark">A</span>
          <span className="privacy-brand-copy"><strong>ALTRIUM</strong><small>Recruitment workspace</small></span>
        </AppLink>
        <AppLink to="/login" className="privacy-back-link">Return to sign in</AppLink>
      </header>

      <article className="privacy-content">
        <span className="eyebrow dark">Privacy notice</span>
        <h1>How Altrium handles information</h1>
        <p className="privacy-updated">Last updated: 13 September 2026</p>

        <section>
          <h2>About this notice</h2>
          <p>This privacy notice applies to the Altrium Recruitment Workspace and its interview scheduling and notification features. The workspace is a university prototype used by authorised Altrium staff to manage recruitment activities.</p>
        </section>

        <section>
          <h2>Information we process</h2>
          <p>The workspace processes recruitment information supplied by candidates and authorised staff, including names, email addresses, CV information, job applications, interview schedules and recruitment decisions.</p>
          <p>For Gmail delivery, the system uses the authorised sender email address and an OAuth authorization token. It requests only the permission required to send interview-related email. It does not request permission to read, search, modify or delete messages in the sender's mailbox.</p>
        </section>

        <section>
          <h2>How Gmail access is used</h2>
          <p>Gmail access is used only to send transactional recruitment messages, such as interview scheduling confirmations, rescheduling notices, cancellation notices and interview reminders, to the relevant candidate and interviewer.</p>
          <p>Google account information is not used for advertising, profiling or any purpose unrelated to these recruitment notifications.</p>
        </section>

        <section>
          <h2>Storage, security and sharing</h2>
          <p>Google OAuth credentials are stored as protected Supabase Edge Function secrets and are not exposed to the browser or committed to the public source-code repository. Recruitment and notification records are stored in the project's protected Supabase database and are available only to authorised roles.</p>
          <p>Information is not sold. It is shared only with service providers required to operate the prototype, including Google for Gmail delivery and Supabase for secure application hosting, data storage and server-side processing.</p>
        </section>

        <section>
          <h2>Retention and your choices</h2>
          <p>Information is retained only for the duration required to operate and assess the prototype. The sender can revoke Gmail authorization at any time through the connected-app settings in their Google Account. Revoking access prevents the workspace from sending further Gmail notifications until authorization is restored.</p>
        </section>

        <section>
          <h2>Google API data</h2>
          <p>Altrium's use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>, including its Limited Use requirements.</p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>Questions about this notice or the Gmail integration can be sent to <a href="mailto:nethaka.galagedera@gmail.com">nethaka.galagedera@gmail.com</a>.</p>
        </section>
      </article>

      <footer className="privacy-footer">Altrium Recruitment Workspace · University prototype</footer>
    </main>
  )
}

# Altrium Recruitment Tracker

Private staff workspace for the Altrium Recruitment Platform. It shares Supabase with the public CV submission portal, implements the four finalized Sprint 1 features, and contains all four current Sprint 2 features: Interview Scheduling and Notifications, Interview Feedback and Candidate Evaluation, Final Hiring Decision and Process Completion, plus Management Dashboard, Reporting and Staff User Management.

## Live deployment

- Private tracker: https://altrium-recruitment-tracker.nethaka-galagedera.workers.dev/login
- Privacy notice: https://altrium-recruitment-tracker.nethaka-galagedera.workers.dev/privacy
- Public portal: https://altrium-recruitment-platform.nethaka-galagedera.workers.dev/
- Source repository: https://github.com/NethakaG/altrium-recruitment-platform

The source repository is public. Both React frontends are deployed separately through Cloudflare.

Only browser-safe Supabase configuration belongs in the repository. Local `.env` files, Supabase service-role credentials, Gemini credentials, and staff passwords must remain uncommitted.

## Sprint 1 status

### 1. Job Position Management

- Every active staff role can view, search, filter, and open position details.
- IT Admin and HR / Recruiter can create positions and permanently close open positions.
- Position information cannot be edited after creation.
- Pause, reopen, archive, and normal in-app deletion controls are unavailable.
- A new position remains hidden from the public portal until its workflow and screening rubric are configured.
- Closing a position removes it from the public portal and starts automatic screening.

### 2. Recruitment Workflow Configuration

- Workflows are position-specific.
- CV Review is fixed as Step 1 and Final Decision is fixed as the final step.
- Intermediate stages can be selected from predefined types or added as a named Custom Step.
- Duplicate predefined stages are rejected and stage order is persisted.
- IT Admin and HR can configure a workflow before applications arrive.
- A workflow locks after the first candidate applies.
- Creating a position redirects the authorized user to workflow and rubric setup.

### 3. Candidate and CV Management

- Public submissions create private application records at CV Review.
- Candidate details include verified contact information, the original filename, signed CV download, structured summary, skills, education, and experience.
- PDF extraction is performed by Gemini and failed or pending extraction can be retried by IT Admin or HR.
- Candidate lists are separated by position rather than mixed into one continuous table.
- Search supports candidate name, email, role, and stage.
- Filters support position, workflow stage, and application status, including combined position-and-stage filtering.
- Sorting supports rank, newest submission, and oldest submission.
- Candidate applications remain independent when the same person applies to different positions.
- CV downloads use authenticated 60-second signed URLs; the Storage bucket remains private.
- Manual progression from CV Review is locked until automatic screening is finalized.
- After shortlisting, IT Admin or HR can advance candidates through non-interview stages. Interview-stage progression, hold and rejection require submitted interviewer feedback and an HR decision. Read-only roles cannot progress candidates.

### 4. AI-Assisted CV Screening and Filtering

- IT Admin or HR configures a position-specific rubric after saving the workflow.
- A rubric contains 3–8 criteria, weights totalling 100%, evidence descriptions, and a shortlist size from 1–5.
- Saving locks the rubric permanently so every applicant is assessed against the same published criteria.
- Candidates remain unranked while the position is Open.
- Closing the position scores every active, processed CV against the locked rubric.
- The application calculates weighted totals, creates unique position-specific ranks, shortlists the configured number, and automatically rejects the rest without human pre-screening.
- Shortlisted candidates move to the second workflow stage; rejected candidates remain at CV Review with Rejected status.
- Candidate profiles show criterion scores, CV-based evidence, total score, rank, model, and decision.
- Screening finalization is all-or-nothing: no shortlist is published until the complete active pool succeeds.
- Failed or stalled screening can be retried from the position detail page.

## Roles and access

| Role | Main access | Management permissions |
| --- | --- | --- |
| IT Admin | Overview, Positions, Workflows, Candidates, Interviews, Final Decisions, Staff Access | Monitor recruitment/system health, manage staff invitations, roles and account status, plus all authorized recruitment controls |
| HR / Recruiter | Overview, Positions, Workflows, Candidates, Interviews, Final Decisions | Recruitment-management controls, interview scheduling, feedback review, candidate decisions and read-only final-decision monitoring, excluding the Staff Access route |
| Interviewer | Overview, Positions, Workflows, Assigned Interviews, Calendar | View assigned candidates, control their interviews, save evaluation drafts and submit recommendations |
| Hiring Manager | Overview, Positions, Workflows, Candidate Review, Final Decisions | Review finalists and evidence, then submit or resubmit Recommend Hire/Reject decisions |
| Management User / Executive | Overview, Positions, Workflows, Recruitment Overview, Final Decisions | Review the full finalist record and approve or return Hiring Manager recommendations |

Supabase Auth users without an active `staff_profiles` record and assigned role cannot enter the workspace. Authorization is enforced by the protected frontend routes, Postgres privileges/RLS, and role-aware database functions.

## Sprint 2 — Interview Scheduling and Notifications

- IT Admin and HR schedule one eligible interviewer from a candidate profile once that candidate reaches an interview stage.
- Purnod, Hovindi and Chathumina have separate active interviewer accounts and calendars in the live project. Their login and contact details are configured privately in Supabase and are not committed.
- Each interviewer has a private Altrium calendar. Normal availability is calculated from Monday–Friday working hours of 9:00 AM–5:00 PM rather than entered manually.
- Interviewers can add, edit, drag-to-move, and delete their own meetings or unavailable periods. Candidate interviews appear automatically and remain recruiter-controlled.
- Recruiters see an interviewer's calendar read-only inside candidate scheduling. Personal event names are shown only as Busy.
- Recruiters select the interviewer, duration, available calendar date and calculated time. The database rechecks the period before saving.
- Weekends and the official 2026 Sri Lankan public holidays are blocked. Meetings, unavailable periods, interviews and the 15-minute post-interview buffer are removed from available times.
- Online interviews require a meeting link; physical interviews require a location.
- HR and IT Admin can view interviews, reschedule scheduled interviews, cancel them with a reason, and retry queued or failed emails.
- The recruiter interview register separates records into position cards and supports combined candidate/interviewer search, position, interview-stage, and status filters.
- The assigned interviewer can see the candidate/CV, start the interview, continue past the planned end time, and end it manually. Actual start and end timestamps are recorded.
- Each interviewer's Assigned Interviews page supports search, position and status filters, then organizes results into Today/In Progress, Upcoming, Awaiting Feedback, Earlier, and Completed/Cancelled schedule sections.
- Scheduling, rescheduling and cancellation emails are queued for both candidate and interviewer. Reminder records are queued for 24 hours and 1 hour before the interview.
- Gmail delivery is server-side through the `send-interview-emails` Edge Function; the browser never receives Google credentials.

## Sprint 2 — Interview Feedback and Candidate Evaluation

- Feedback remains locked until the assigned interviewer starts the interview.
- Five fixed criteria are scored from 1–5: Communication, Role Knowledge, Relevant Experience, Problem Solving, and Overall Suitability. A complete evaluation totals 25 points.
- The interviewer can save partial notes and scores as a draft while the interview is in progress.
- Ending an interview records the actual end time and changes it to Awaiting Feedback; it does not submit the evaluation automatically.
- Submission requires all five scores, at least 20 characters of evidence-based notes, and a Proceed, Hold, or Reject recommendation.
- Submitted feedback can be corrected until HR reviews it. Each corrected submitted version is retained in the feedback history.
- HR and IT Admin review the submitted evaluation from Interviews. The interviewer recommendation is advisory and never changes the candidate directly.
- An HR Proceed decision moves the candidate to the next configured stage. Hold keeps the candidate at the same stage with On Hold status, and can later be resolved to Proceed or Reject. Reject ends the candidate workflow while preserving the evaluation record.
- If HR chooses a different outcome from the interviewer recommendation, a decision explanation of at least 10 characters is required.
- Direct candidate progression and rejection controls cannot bypass an active interview's feedback decision.

## Sprint 2 — Final Hiring Decision and Process Completion

- Candidates appear in the Final Decisions workspace only after reaching the configured Final Decision workflow stage.
- Finalists are separated by position and ordered by their position-specific screening rank.
- Hiring Managers compare the candidate CV/profile, Gemini score and rank, and all available submitted interview evaluations.
- A Hiring Manager submits either Recommend Hire or Recommend Reject with a justification of at least 20 characters. The recommendation does not change the candidate status.
- Executives review the same evidence and recommendation, then either approve it or return it with a reason.
- A returned recommendation leaves the candidate Active at Final Decision and lets a Hiring Manager revise and resubmit it.
- Approval changes the candidate to Hired or Rejected, while keeping the Final Decision stage and full audit trail.
- Previous recommendation, return and approval versions are retained in immutable decision history.
- The database allows only one approved Hired candidate per position. Approving a hire does not automatically reject the remaining finalists; each requires an explicit decision.
- HR and IT Admin can monitor the complete final-decision state but cannot recommend, approve or bypass the two-step process.

## Sprint 2 — Management Dashboard, Reporting and Staff User Management

- Every active staff role receives a different Overview page calculated only from records that its database role is allowed to read.
- HR / Recruiter sees open and closed positions, candidate totals, extraction/screening failures, upcoming interviews, feedback due and returned final recommendations.
- Interviewer sees today's assignments, upcoming and in-progress interviews, feedback due and a direct calendar action.
- Hiring Manager sees permitted candidate/finalist records and final recommendation states including pending, returned and approved.
- Management User / Executive sees the high-level position funnel, pending approvals, hired/rejected outcomes and average position duration.
- IT Admin sees recruitment operations together with active staff counts, active IT Admin count, processing/email failures and incomplete position configuration.
- Relevant dashboard views can be narrowed to one position; timestamps are displayed in Sri Lanka time.
- Staff Access lets IT Admins search and filter staff, invite new staff by email, assign roles, update names, activate/deactivate access and review the latest 100 access changes.
- Invitations are sent through a JWT-protected Supabase Edge Function. The Supabase service-role credential remains server-side and is never exposed to the browser.
- Invitees create their own password at `/set-password`; passwords are never chosen or displayed by an IT Admin.
- Direct browser updates to staff roles/status are blocked. All changes pass through an audited Postgres function that prevents an IT Admin from deactivating/demoting themselves and prevents removal of the final active IT Admin.

The database migrations seed an open Cloud Platform Engineer demo vacancy with `CV Review → Technical Interview → Final Decision`, a locked five-criterion rubric, three role-specific interviewer profiles, normal working schedules, nine realistic calendar events and the official 2026 Sri Lankan holiday calendar. The live notification address is configured privately in Supabase rather than committed to this public repository.

### Gmail and reminder configuration

The live project has its sender Gmail address and OAuth credentials configured privately as Edge Function secrets. New deployments require:

```text
GMAIL_SENDER
GMAIL_CLIENT_ID
GMAIL_CLIENT_SECRET
GMAIL_REFRESH_TOKEN
ALLOWED_ORIGINS
```

Use OAuth offline access with the Gmail send scope; never store the Gmail password. Immediate delivery is active and has been verified. Automatic reminders are intentionally deferred: the migration creates an inactive one-minute Cron job named `dispatch-interview-email-reminders`. When reminder work resumes, add `INTERVIEW_CRON_SECRET`, store `project_url` and `interview_cron_secret` in Supabase Vault, use the same secret value for the Edge Function, and activate the job.

## Operational notes

- The Gemini free tier can impose request-per-minute and daily quotas. Quota exhaustion is an external provider limitation and can interrupt bulk extraction or position screening.
- Public Test Mode currently sends two files concurrently and accepts up to 15 PDFs. Smaller batches are safer under low Gemini quotas.
- A failed screening leaves the position Closed and unavailable publicly until screening is retried successfully.
- Application timestamps are stored in UTC by Supabase. Sri Lanka Standard Time is UTC+05:30.
- The database does not assume seeded candidates. Positions, workflows, rubrics, candidates, and screening records are live data managed through the connected Supabase project.

## Technology

- React 19, TypeScript 6, and Vite 8
- Tailwind CSS 4
- Supabase Auth, Postgres, RLS, Storage, and Edge Functions
- Google Gemini structured extraction and screening
- Vitest and Testing Library

## Local setup

Requirements: Node.js 20.19+ and npm.

```bash
npm install
```

Copy `.env.example` to `.env`:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

Never place the Supabase service-role key, Gemini API key, or staff passwords in this frontend project.

Start the tracker:

```bash
npm run dev
```

If the public portal is also running locally, start the two Vite applications on different ports, for example:

```bash
# recruitment-tracker
npm run dev -- --port 5174
```

## Supabase setup

The migrations under `supabase/migrations` define staff profiles and authorization, position management, position-specific workflows, candidate access, locked screening rubrics, automatic screening finalization, interview scheduling, structured feedback, final hiring approvals, audit history, and candidate decision functions.

Apply migrations using a current Supabase CLI after reviewing the target project:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

Sprint 1 Edge Functions are stored in the sibling `cv-submission-portal/supabase/functions` directory. Interview email delivery is stored at `recruitment-tracker/supabase/functions/send-interview-emails`, and secured staff invitations are stored at `recruitment-tracker/supabase/functions/invite-staff-user`. `ALLOWED_ORIGINS` must contain both local and deployed frontend origins. Gemini and Gmail credentials belong only in Supabase Edge Function secrets.

For staff invitations, add both the deployed and local password routes to Supabase Auth's allowed redirect URLs, for example:

```text
https://altrium-recruitment-tracker.nethaka-galagedera.workers.dev/set-password
http://127.0.0.1:5174/set-password
```

## Cloudflare deployment

The Cloudflare application for this tracker must use:

| Setting | Value |
| --- | --- |
| Root directory | `recruitment-tracker` |
| Build command | `npm run build` |
| Build output | `dist` |
| Environment variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |

The tracker uses client-side routes such as `/login`, `/positions/:id`, and `/candidates/:id`; the deployment must retain its single-page-application fallback to `index.html`.

## Commands

```bash
npm run dev
npm run test
npm run lint
npm run build
npm run preview
```

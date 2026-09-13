# Altrium Recruitment Tracker

Private staff workspace for the Altrium Recruitment Platform. It shares Supabase with the public CV submission portal, implements the four finalized Sprint 1 features, and contains the Sprint 2 Interview Scheduling and Notifications implementation.

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
- After shortlisting, IT Admin or HR can advance active candidates one stage at a time or reject them. Read-only roles cannot progress candidates.

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
| IT Admin | Overview, Positions, Workflows, Candidates, Staff Access placeholder | Create/close positions, configure workflows/rubrics, retry extraction/screening, progress/reject candidates, administer Supabase outside the app |
| HR / Recruiter | Overview, Positions, Workflows, Candidates | Same recruitment-management controls as IT Admin, excluding the Staff Access route |
| Interviewer | Overview, Positions, Workflows, Assigned Candidates | Read-only access to candidates at permitted interview stages |
| Hiring Manager | Overview, Positions, Workflows, Candidate Review | Read-only access to candidates at hiring/management review stages |
| Management User / Executive | Overview, Positions, Workflows, Recruitment Overview | Read-only access to candidates at executive or final review stages |

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
- The assigned interviewer can see the candidate/CV, start the interview, continue past the planned end time, and end it manually. Actual start and end timestamps are recorded.
- Scheduling, rescheduling and cancellation emails are queued for both candidate and interviewer. Reminder records are queued for 24 hours and 1 hour before the interview.
- Gmail delivery is server-side through the `send-interview-emails` Edge Function; the browser never receives Google credentials.

The database migrations seed an open Cloud Platform Engineer demo vacancy with `CV Review → Technical Interview → Final Decision`, a locked five-criterion rubric, three role-specific interviewer profiles, normal working schedules, nine realistic calendar events and the official 2026 Sri Lankan holiday calendar. The live notification address is configured privately in Supabase rather than committed to this public repository.

### Gmail configuration still required

Configure the sender Gmail address and OAuth credentials as Edge Function secrets before real delivery:

```text
GMAIL_SENDER
GMAIL_CLIENT_ID
GMAIL_CLIENT_SECRET
GMAIL_REFRESH_TOKEN
INTERVIEW_CRON_SECRET
ALLOWED_ORIGINS
```

Use OAuth offline access with the Gmail send scope; never store the Gmail password. The migration creates an inactive one-minute Cron job named `dispatch-interview-email-reminders`. Store `project_url` and `interview_cron_secret` in Supabase Vault, use the same secret value for the Edge Function's `INTERVIEW_CRON_SECRET`, then activate that job. Immediate messages can be sent or retried from the Interviews page once Gmail OAuth is configured.

## Remaining Sprint 2 placeholders

- The main Overview page currently keeps only the personalized greeting and active-workspace message. Role-specific statistics, progress summaries, and management reporting are marked for Sprint 2 under Backlog Feature 9.
- Staff Access is a protected IT Admin route, but the in-app staff account-management interface is intentionally not implemented. Staff accounts and roles are currently managed through trusted Supabase administration.

These placeholders are not part of the first four Sprint 1 backlog features.

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

The migrations under `supabase/migrations` define staff profiles and authorization, position management, position-specific workflows, candidate access, locked screening rubrics, automatic screening finalization, and candidate progression functions.

Apply migrations using a current Supabase CLI after reviewing the target project:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

Sprint 1 Edge Functions are stored in the sibling `cv-submission-portal/supabase/functions` directory. Interview email delivery is stored at `recruitment-tracker/supabase/functions/send-interview-emails`. `ALLOWED_ORIGINS` must contain both local and deployed frontend origins. Gemini and Gmail credentials belong only in Supabase Edge Function secrets.

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

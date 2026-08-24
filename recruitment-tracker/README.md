# Altrium Recruitment Tracker

Private staff workspace for the Altrium Recruitment Platform. It shares Supabase with the public CV submission portal and implements the first four finalized Product Backlog features for Sprint 1.

## Live deployment

- Private tracker: https://altrium-recruitment-tracker.nethaka-galagedera.workers.dev/login
- Public portal: https://altrium-recruitment-platform.nethaka-galagedera.workers.dev/
- Source repository: https://github.com/NethakaG/altrium-recruitment-platform

The repository is private. Both React frontends are deployed separately through Cloudflare.

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

## Sprint 2 placeholders

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

The Edge Functions used by the tracker are stored in the sibling `cv-submission-portal/supabase/functions` directory because both frontends share the same Supabase project. `ALLOWED_ORIGINS` must contain both local and deployed frontend origins. `GEMINI_API_KEY` and the optional `GEMINI_MODEL` belong only in Supabase Edge Function secrets.

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

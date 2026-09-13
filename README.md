# Altrium Recruitment Platform

Altrium is a two-application recruitment platform. Sprint 1 covers position, workflow, candidate/CV and automatic screening management. Sprint 2 development adds interview scheduling and notifications to the protected tracker. Both applications use the same Supabase backend.

## Live applications

- Public CV portal: https://altrium-recruitment-platform.nethaka-galagedera.workers.dev/
- Private recruitment tracker: https://altrium-recruitment-tracker.nethaka-galagedera.workers.dev/login

The two React applications are deployed separately through Cloudflare from this public repository.

## Repository structure

| Directory | Purpose |
| --- | --- |
| [`cv-submission-portal`](./cv-submission-portal) | Candidate-facing position selection, PDF submission, duplicate prevention, and temporary bulk Test Mode |
| [`recruitment-tracker`](./recruitment-tracker) | Role-protected staff workspace for positions, workflows, candidates, screening, and workflow progression |

Each directory contains its own setup instructions, tests, Cloudflare configuration, and technical documentation.

## Implemented Sprint 1 features

1. **Job Position Management** — IT Admin and HR can create positions and permanently close them. Positions become public only after their workflow and screening rubric are configured.
2. **Recruitment Workflow Configuration** — each position has an ordered workflow with fixed first and final stages. The workflow locks after the first application.
3. **Candidate and CV Management** — candidates submit PDF CVs, Gemini extracts structured profiles, staff can search and filter applications by position and stage, and authorized staff can progress shortlisted candidates.
4. **AI-Assisted CV Screening and Filtering** — closing a position scores its processed candidates against a locked rubric, creates position-specific ranks, shortlists the configured number, and automatically rejects the remainder.

## Sprint 2 development

Interview Scheduling and Notifications now includes one-interviewer assignments, role-specific interviewer profiles, a visual internal calendar, calculated Monday–Friday availability, 2026 Sri Lankan public-holiday blocking, meetings and unavailable periods, recruiter calendar selection, 15-minute conflict buffers, online/physical details, rescheduling, cancellation, planned-versus-actual times, Start/End Interview controls, email delivery tracking and queued 24-hour/1-hour reminders. The demo vacancy is Cloud Platform Engineer and Purnod is its configured senior engineering interviewer.

Live Gmail delivery requires one-time Google OAuth secrets and a scheduled reminder trigger in Supabase. The three interviewer profiles are connected to active staff accounts in the live project; their private login and contact details are intentionally not committed. Interview feedback, final hiring completion and management reporting remain later Sprint 2 work.

## Roles

- IT Admin
- HR / Recruiter
- Interviewer
- Hiring Manager
- Management User / Executive
- Candidate, through the public portal without a staff account

Staff access is protected through Supabase Auth, active staff profiles, database permissions, row-level security, and role-aware functions.

## Technology

- React 19, TypeScript 6, Vite 8, and Tailwind CSS 4
- Supabase Auth, Postgres, private Storage, Row Level Security, and Edge Functions
- Google Gemini structured CV extraction and rubric-based screening
- Vitest and Testing Library
- Cloudflare deployments connected to GitHub

## Public-repository security

Do not commit local `.env` files, Supabase service-role credentials, Gemini API keys, staff passwords, candidate CVs, or exported recruitment data. The tracked `.env.example` files contain variable names only. Browser builds should contain only:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

Server-side credentials belong in Supabase Edge Function secrets. The `candidate-cvs` bucket and candidate records remain private even though the application source code is public.

## Local development

Install and run each application from its own directory:

```bash
cd cv-submission-portal
npm install
npm run dev
```

```bash
cd recruitment-tracker
npm install
npm run dev -- --port 5174
```

See the application-specific documentation for Supabase migrations, Edge Functions, environment configuration, verification commands, and Cloudflare deployment settings:

- [Public portal documentation](./cv-submission-portal/README.md)
- [Private tracker documentation](./recruitment-tracker/README.md)

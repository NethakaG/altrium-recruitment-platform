# Altrium Careers — CV Submission Portal

A public careers portal where candidates provide contact details, select an open Altrium position and securely submit one CV. Server-side processing can extract a structured profile from PDF CVs; private review remains in the separate internal recruitment tracker.

## Technology

- React 19 + Vite + TypeScript
- Tailwind CSS
- Supabase JavaScript client
- Supabase Postgres, private Storage, and an Edge Function
- Vitest + Testing Library

## How the submission works

```text
Browser
  ├─ reads only Open, non-archived positions with a configured workflow through RLS
  └─ sends verified contact details + positionId + one CV to submit-cv
                              │
                              ▼
                    Supabase Edge Function
                      1. validates origin
                      2. validates the position again
                      3. validates size, MIME type, and file signature
                      4. uploads to the private candidate-cvs bucket
                      5. inserts a private candidate submission at CV Review
                      6. processes PDF CVs with Gemini in a background task
```

The browser never receives a service-role key, Gemini key, CV URL, submission ID, or another candidate's data. If the database insert fails after upload, the function attempts to remove the orphaned file.

Duplicate applications are blocked using the normalized candidate email plus position ID. The same email can apply to different positions, while a second application to the same position receives a clear duplicate message. A case-insensitive database index provides the final race-safe guarantee.

Gemini returns schema-constrained factual profile data only. Applicant-provided name and email remain authoritative, missing CV information is stored as blank, and this step performs no ranking or hiring recommendation. The portal accepts PDF CVs only so every accepted document can follow the automatic extraction flow.

## Local installation

Requirements: Node.js 20.19+ and npm.

```bash
npm install
```

Copy `.env.example` to `.env` and add the browser-safe values from **Supabase Dashboard → Project Settings → API**:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

Never use a secret key or the legacy `service_role` key in a `VITE_` variable. Vite embeds these variables in the public browser bundle.

Start the site:

```bash
npm run dev
```

The local page is normally available at `http://127.0.0.1:5173` or the URL printed by Vite.

## Supabase setup

The Supabase project must already contain `public.positions` with at least the fields described below:

- `id` UUID primary key
- `title`
- `department`
- `status` using `Open`, `Paused`, or `Closed`
- `archived_at` nullable timestamp
- `workflow_configured` boolean

The migration in `supabase/migrations`:

- creates `public.cv_submissions` and its indexes;
- enables RLS and revokes public access to submission rows;
- allows anonymous clients to select only Open, non-archived positions whose recruitment workflow has been configured;
- creates or hardens the private `candidate-cvs` bucket;
- enforces the supported MIME types and 10 MB bucket limit.

The Edge Function performs all privileged uploads and inserts with Supabase's server-side service-role secret. It revalidates every browser input and returns only a success flag or candidate-safe error.

### Apply and deploy with the Supabase CLI

Install/authenticate the current CLI, then run these commands from this directory:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

Set the allowed browser origins as a comma-separated Edge Function secret. Include local development and every deployed production/preview origin that should submit CVs:

```bash
npx supabase secrets set ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,https://your-site.example
```

Include the private tracker origin as well because authenticated CV download and retry actions use the same allowlist. `GEMINI_API_KEY` must be stored only as a Supabase Edge Function secret. `GEMINI_MODEL` is optional and defaults to `gemini-3.5-flash`.

Deploy the public function:

```bash
npx supabase functions deploy submit-cv --no-verify-jwt
```

`submit-cv` intentionally has JWT verification disabled because candidates do not log in. Security comes from its narrowly scoped server-side validation, private Storage/RLS design, non-disclosure of internal data, and restricted browser origins. CORS is not a substitute for abuse prevention; add CAPTCHA and/or rate limiting before using this endpoint for a high-traffic public recruitment campaign.

After applying the migration, review **Database → Advisors** and the Storage policies in the Supabase Dashboard. An existing broad policy on `storage.objects` from another application should never include the `candidate-cvs` bucket.

## Hosting on Vercel or Netlify

Push the project to GitHub without `.env`. Connect the repository to either host and configure:

| Setting | Value |
| --- | --- |
| Root/base directory | `cv-submission-portal` if the Git repository begins one folder above this project |
| Build command | `npm run build` |
| Publish/output directory | `dist` |
| Environment variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |

After the first deployment, add the exact production URL to `ALLOWED_ORIGINS` in Supabase and redeploy the Edge Function if needed. Every later GitHub push can automatically produce a new frontend deployment; database migrations and Edge Function deployments remain explicit Supabase steps.

## Commands

```bash
npm run dev       # development server
npm run test      # unit/component/security tests
npm run lint      # static linting
npm run build     # TypeScript + production build
npm run preview   # preview the production bundle
```

## Automated coverage

The test suite verifies:

1. only Open positions with a configured workflow are returned;
2. archived positions are excluded;
3. a valid candidate name and email are required;
4. a position and CV are required;
5. duplicate applications show an email-specific error;
6. unsupported file types are rejected;
7. files over 10 MB are rejected;
8. a valid CV starts submission;
9. duplicate clicks cannot start a second submission;
10. a successful submission shows the confirmation state;
11. migration controls keep submission rows and CV objects private.

## Manual test checklist

Complete this after linking a development Supabase project:

- [ ] Create one Open, non-archived position and confirm it remains hidden until its workflow is saved.
- [ ] Save the position's workflow in the private tracker and confirm it then appears.
- [ ] Confirm blank or invalid candidate name/email values are rejected.
- [ ] Confirm Paused, Closed, and archived positions do not appear.
- [ ] Confirm the page shows a clear empty state when no positions are open.
- [ ] Try submitting with neither field selected and verify both errors.
- [ ] Try `.txt`, empty, renamed/fake, and over-10-MB files and verify rejection.
- [ ] Confirm DOC/DOCX files are rejected with the PDF-only message.
- [ ] Choose a valid PDF and verify filename, size, and Remove.
- [ ] Submit once and verify the button disables with “Submitting your CV…”.
- [ ] Verify the success state contains no processing or ranking information.
- [ ] Verify exactly one `cv_submissions` row exists with status `Pending`.
- [ ] For a PDF CV, confirm processing changes from Pending/Processing to Processed and the structured profile appears in the private tracker.
- [ ] Verify the file is stored at `<position-id>/<submission-id>/original_cv.<ext>`.
- [ ] Verify `candidate-cvs` is private and cannot be listed/downloaded with the publishable key.
- [ ] Close the selected position before submitting and verify the closed-position error.
- [ ] Check desktop, tablet, and mobile layouts with keyboard-only navigation.

## Current scope

This version performs exactly:

**Open Position → CV Upload → Successful Submission**

It deliberately excludes authentication, candidate accounts, dashboards, application history, internal recruitment stages, bulk upload, interview management, scoring, reporting, and third-party job-platform integrations.

## Future development

Later backend work may consume `Pending` submissions, extract structured CV data with Google Gemini, compare candidates against job requirements, and send results to a separate internal recruitment tracker. No Gemini or other AI integration is included in this project.

# Altrium Careers — Public CV Submission Portal

Public candidate-facing portal for the Altrium Recruitment Platform. Candidates provide their contact details, choose an available position, and submit one PDF CV. The portal shares a Supabase backend with the private recruitment tracker.

## Live deployment

- Public portal: https://altrium-recruitment-platform.nethaka-galagedera.workers.dev/
- Source repository: https://github.com/NethakaG/altrium-recruitment-platform

The repository is private. The frontend is deployed through Cloudflare and the backend runs in Supabase.

## Current Sprint 1 behaviour

### Normal candidate submission

1. The browser loads positions that are Open and have both a configured workflow and locked screening rubric.
2. The candidate enters a full name, valid email address, optional phone number, selects a position, and chooses one PDF CV.
3. The `submit-cv` Edge Function revalidates the origin, position, contact details, file size, MIME type, and PDF signature.
4. The CV is saved in the private `candidate-cvs` Storage bucket and a private application record is created at CV Review.
5. Gemini extracts a structured candidate profile in the background.
6. The candidate sees only a success or candidate-safe error message. Internal stages, extraction details, scores, ranks, and decisions are never exposed publicly.

PDF files are limited to 10 MB. DOC and DOCX files are intentionally rejected so every accepted CV can use the same automatic document-processing flow.

### Duplicate prevention

Applications are unique by normalized candidate email and position:

- the same email cannot apply twice to the same position;
- the same email may apply to different positions;
- a database unique index provides the final concurrency-safe check;
- a rejected duplicate does not overwrite the existing candidate or create another stored CV.

### Temporary Test Mode

The header currently includes an unauthenticated **Test mode** toggle for demonstration and acceptance testing. It allows up to 15 PDF CVs to be submitted to one open position. Every successful file follows the real extraction, duplicate-checking, Storage, and application flow; it does not create fake or isolated test records.

Test Mode uses two concurrent workers. Gemini free-tier request-per-minute and daily limits can therefore interrupt larger batches. Use smaller batches when testing. This temporary public control must be removed before the portal is opened for real recruitment.

## Position closure and screening

The public portal does not perform or display candidate ranking. After HR closes a position in the private tracker, the backend:

1. removes the position from the public list immediately;
2. scores every active, processed application against the position's locked rubric;
3. calculates weighted totals and independent ranks for that position;
4. shortlists the configured number of candidates;
5. automatically rejects the remaining candidates;
6. moves shortlisted candidates to the second workflow stage only after the complete pool succeeds.

Gemini failures or quota exhaustion leave the position closed and expose a retry control only in the private tracker.

## Security boundary

- The browser contains only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- The Supabase service-role key and `GEMINI_API_KEY` are Edge Function secrets and must never be placed in frontend environment variables or committed.
- Candidate rows and CV files are private and inaccessible to anonymous clients.
- Staff CV downloads use short-lived signed URLs created after authenticated role checks.
- Edge Functions validate allowed browser origins through `ALLOWED_ORIGINS`.
- If a database insert fails after upload, the submission function attempts to remove the orphaned file.

CORS is not an abuse-prevention mechanism. Add rate limiting and/or CAPTCHA before using the public endpoint for a high-traffic recruitment campaign.

## Technology

- React 19, TypeScript 6, and Vite 8
- Tailwind CSS 4
- Supabase JavaScript client
- Supabase Postgres, Auth, private Storage, and Edge Functions
- Google Gemini structured output
- Vitest and Testing Library

## Local setup

Requirements: Node.js 20.19+ and npm.

```bash
npm install
```

Copy `.env.example` to `.env` and add the browser-safe Supabase values:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

Start the development server:

```bash
npm run dev
```

Vite normally serves the portal at `http://127.0.0.1:5173` or the URL printed in the terminal.

## Supabase backend

The portal-side migrations create and harden candidate submissions, private Storage, PDF-only validation, anonymous open-position visibility, and duplicate prevention. Tracker-side migrations add workflows, staff authorization, candidate management, locked screening rubrics, automatic ranking, and secure progression.

Edge Functions in this project:

| Function | Purpose | Authentication |
| --- | --- | --- |
| `submit-cv` | Normal public application and background extraction | Public endpoint with strict validation and allowed origins |
| `submit-test-cv` | Temporary bulk-test submission with synchronous extraction | Public testing endpoint with strict validation and allowed origins |
| `process-cv` | Retry or start structured CV extraction | Authenticated staff |
| `get-cv-download` | Create a 60-second signed CV URL | Authenticated permitted staff |
| `screen-position` | Score all processed candidates and finalize ranking | Authenticated IT Admin or HR |

Required Edge Function secrets:

```text
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,https://public-site.example,https://private-tracker.example
GEMINI_API_KEY=your_server_side_key
GEMINI_MODEL=gemini-3.5-flash  # optional; this is the current default
```

Link and apply migrations using a current Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

Deploy the required functions after reviewing their JWT configuration and `supabase/config.toml`. `submit-cv` is intentionally public because candidates do not authenticate; staff-only functions must retain their authorization checks.

## Cloudflare deployment

The GitHub repository contains both frontends. The Cloudflare application for this portal must use:

| Setting | Value |
| --- | --- |
| Root directory | `cv-submission-portal` |
| Build command | `npm run build` |
| Build output | `dist` |
| Environment variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |

Do not upload `.env`. After changing a production or preview URL, update `ALLOWED_ORIGINS` in Supabase.

## Commands

```bash
npm run dev
npm run test
npm run lint
npm run build
npm run preview
```

## Sprint boundary

Sprint 1 covers public submission plus the private tracker's first four backlog features. Interview scheduling, interview feedback, broader pipeline management, final hiring completion, and management reporting remain later backlog work.

# Altrium Recruitment Tracker

Private staff application for Altrium's recruitment workflow. Authentication, role-based access, Function 1 (Job Position Management), Function 2 (Recruitment Workflow Configuration), and the first Function 3 candidate-management slice are connected to the live Supabase project.

## Function 1: Job Position Management

- Every active staff role can view, search, filter and open position details.
- IT Admin and HR / Recruiter can create positions and close open positions.
- Position information cannot be edited after creation.
- Pausing, reopening and archiving are not available.
- The anonymous open-position policy used by the public CV portal remains active.

## Function 2: Recruitment Workflow Configuration

- Every active staff role can view the workflow attached to each position.
- IT Admin and HR / Recruiter can configure workflows for open positions.
- CV Review is locked as Step 1 and Final Decision is locked as the final step.
- Intermediate stages come from a standard dropdown, with a Custom Step option for a named stage.
- Workflows can contain any number of intermediate steps, but cannot contain duplicates.
- A newly created position is hidden from the public CV portal until its first valid workflow is saved.
- Creating a position takes the authorised user directly to its workflow builder.
- A workflow locks automatically after the first candidate is received.

## Function 3: Candidate and CV Management

- Public submissions create private candidate records at the position's CV Review stage.
- IT Admin and HR / Recruiter can view all candidates, advance active candidates and reject applications.
- Interviewers, Hiring Managers and Management Users receive read-only candidate views based on the candidate's current workflow stage.
- Candidate details include verified form contact details, the original CV, extracted skills, summary, education and experience.
- CV downloads use authenticated, 60-second signed links; the Storage bucket remains private.
- Failed PDF extraction can be retried by IT Admin or HR.
- New public submissions accept PDF files only so every accepted CV can follow the automatic Gemini extraction flow.
- Bulk CV upload remains outside the current scope.

## Staff roles

- IT Admin
- HR / Recruiter
- Interviewer
- Hiring Manager
- Management User / Executive

New Supabase Auth users are created with no role and inactive access. An IT Admin must explicitly assign a role and activate the account before the user can enter the tracker.

## Local setup

1. Copy `.env.example` to `.env`.
2. Add the Supabase project URL and browser-safe publishable key.
3. Run `npm install`.
4. Run `npm run dev`.

Never place the Supabase service-role key, the Gemini API key, or staff passwords in this frontend project.

## First IT Admin bootstrap

1. In Supabase, open **Authentication > Users**.
2. Choose **Add user** and create the first staff account with its real work email.
3. Do not share the password in source control or chat.
4. Assign that user's `staff_profiles.role` to `it_admin` and set `is_active` to `true` using a trusted database administration channel.
5. Sign in at `/login` and confirm that the IT Admin dashboard loads.

## Verification

```text
npm test
npm run lint
npm run build
```

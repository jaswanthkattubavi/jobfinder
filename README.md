# Jobfinder — supervised UK application assistant

Jobfinder discovers vacancies, screens UK eligibility and sponsorship, scores them against a candidate profile, and prepares a daily application workspace. It uses TanStack Start, React and Supabase.

## What works in this implementation

- Existing employer-board discovery, deduplication, CV parsing and job analysis.
- Shared clearance and sponsorship screening with negation-aware regression tests.
- `/agent`: per-user settings, a rolling 24-hour preparation cap (1–20), APPLY/STRETCH screening, queued application packets and an activity log.
- Preparation uses the current primary CV and current vacancy evidence. It only reorders existing bullet points inside an explicit Skills section; it preserves all other source lines. Text export does **not** preserve PDF/DOCX formatting or claim to be an AI-rewritten CV.
- Exact-question answer memory with user opt-in, deletion and 90-day expiry. Contextual answers (sponsorship, salary, declarations and similar) remain application-specific. Credentials and OTPs are never stored.
- A local Chrome/Edge extension scans forms, exports unanswered questions and fills approved exact matches. See [extension/README.md](extension/README.md).
- Atomic scheduler leases replace the race-prone running-scan lookup. The daily scan calls queue preparation for users who enabled it.

## Important boundaries

This is a **preparation and assisted-filling release**, not an unattended application bot. The extension does not submit, log in, solve CAPTCHAs, read your inbox, upload documents, or perform assessments. File upload and final submission stay on the employer website. The app only records submission when the user supplies a confirmation. Unsupported forms and unknown answers stay manual. No live employer submissions were performed during development.

Email digest sending already exists in the app; **inbound email monitoring is not connected**. Connecting ChatGPT to an inbox does not grant this deployed app mailbox access. A production inbox integration needs a separate OAuth deployment, per-user encrypted token storage and revocation before it can monitor confirmations.

## Local development

Use Node.js 24 (or a compatible runtime with native TypeScript stripping for the test suite).

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run dev
```

Copy `.env.example` to `.env` and set your own values. Never commit `.env`, service-role keys, provider credentials, candidate CVs, packets or exported answers. The original project's `bun.lock` remains for provenance; `package-lock.json` is the reproducible npm install path.

## Database and deployment

1. Link the project to **your** Supabase instance and review/apply migrations in `supabase/migrations` in order. Use the Supabase CLI or your existing Lovable deployment workflow. The two `20260918...` migrations add the scheduler leases and private agent workspace. Do not run them against an unrelated production database.
2. Deploy the application using the existing TanStack/Lovable hosting setup. A GitHub push alone does not run SQL migrations or enable a production schedule.
3. Configure server-side Supabase credentials. Keep service-role credentials exclusively on the server. Configure `LOVABLE_API_KEY` for the existing CV/job extraction gateway. Missing credentials must produce real unavailable states, not demo success.
4. Set up the existing daily scheduler: `scheduler_settings` must contain the `default` row with `enabled=true` and `local_hour=6`. Its `cron_token` or `LOVABLE_CRON_SECRET` must authenticate the POST to `/api/public/scheduled-scan`. The existing database schedule targets 05:00 and 06:00 UTC to support BST/GMT. Confirm the endpoint belongs to this deployment before enabling it. A missing or disabled row now stops processing.
5. Sign in, complete the candidate profile, configure employer sources, upload/parse a primary CV, and run discovery. Existing scores should be recalculated after deploying the screening fixes.
6. Open **Agent**, choose preparation limits, and enable daily preparation. This flag enables preparation after discovery; it does not itself provision a scheduler. Use **Prepare queue** for an immediate run on already-scored vacancies.
7. Install the browser helper locally, export a packet, open its exact application URL, scan questions, import the report to Agent, answer unknowns, and export an updated packet. Review the prepared fields, upload the intended CV and submit on the employer site. Record its confirmation in Agent.

### Operational properties

Agent tables use row-level security; authenticated clients have owner-only read access and server functions enforce ownership on every write. A `(user_id, job_id)` constraint prevents duplicate queue entries. Database leases serialize preparation and scheduler triggers. A packet expires after 24 hours; generate a fresh one after changing your CV or the advert. Re-preparation invalidates application answers when the source CV or job changes. Exported packets contain personal data: keep them local and delete them when done.

Scheduled discovery currently processes at most 20 onboarded accounts per invocation. This release is intended for the owner's small installation; fair multi-tenant scheduling and durable worker orchestration are still needed for a larger service. Lease loss stops subsequent stages but cannot cancel an already-running provider request.

## Verification

`npm test` covers screening, evidence-preserving CV preparation, answer expiry/context, URL restrictions, scheduler leases and the browser form adapter. It does not prove that every employer's dynamic form is supported. Production rollout still needs a staging database migration, authenticated end-to-end scan, actual CV parsing, email-provider check and supervised browser trial. Never report a successful application based only on filled fields or an HTTP success from unrelated endpoints.

## Lower-cost daily runs with GitHub Actions

The workflow in `.github/workflows/daily-jobs.yml` runs discovery and preparation **directly on a standard Ubuntu runner**. It does not need a hosted dashboard endpoint. It still needs your Supabase database, migrations, completed profile, employer source configuration and CV. You can run the dashboard locally with `npm run dev` if you do not want website hosting yet. GitHub Pages cannot run this app's server functions without an architectural change.

Setup for this repository:

- Open [repository secrets](https://github.com/jaswanthkattubavi/jobfinder/settings/secrets/actions) and add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `JOBFINDER_USER_ID` (your candidate profile's `user_id`). Do not put these values in source, issues or chat.
- Open [repository variables](https://github.com/jaswanthkattubavi/jobfinder/settings/variables/actions). Set `JOBFINDER_ACTIONS_ENABLED` to `true` only after setup. Leave `JOBFINDER_MAX_AI_ANALYSES` unset for **zero new paid AI calls**, or deliberately set a per-run limit from 1 to 30 and add the `LOVABLE_API_KEY` secret.
- Enable preparation in the Agent workspace if you want it to follow discovery. New, unanalysed jobs may require review when AI is disabled; cached analysis is reused. A no-AI run is not equivalent to full AI matching.
- Open [Actions](https://github.com/jaswanthkattubavi/jobfinder/actions) and run **Daily job discovery and preparation** manually once. Subsequent runs are scheduled at **06:17 UTC** (07:17 during British Summer Time). GitHub may delay scheduled runs and disables public-repository schedules after 60 days without repository activity.
- Use this workflow **instead of** the previous database/hosting schedule. The shared lease prevents simultaneous overlap, but does not deduplicate two separate completed schedules on the same day.

The workflow uploads no CV, answers, packets or artifacts and logs only aggregate counts. It sends no emails and submits no applications. It intentionally does not provision paid services or configure optional paid search providers. Standard GitHub-hosted runner compute is free for public repositories; private repositories have plan-dependent allowances. Database, model-provider and any optional API charges remain separate. External API budgets are not a monetary guarantee; use provider-side spending limits too.

Offline verification: `npm run jobs:daily -- --check` resolves the worker's imports without contacting any service.

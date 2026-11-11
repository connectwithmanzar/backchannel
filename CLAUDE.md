# Backchannel: notes for Claude Code

## Who you're working with
The owner (Manzar) does not code. Explain every step in plain language, give click-by-click instructions for anything he must do himself (accounts, keys, settings), and run commands for him rather than asking him to. Keep changes small and show what changed.

## One workspace, two apps
This folder holds both of the owner's job-search apps. Work on either or both here.
| App | Folder | Runs | Stack |
|---|---|---|---|
| Backchannel | everything except `jobradar/` | Online (Vercel + Supabase) | Next.js 16, TypeScript |
| JobRadar | `jobradar/` | On the owner's Mac (Dock app, daily 8:00 run) | Python 3.12, Streamlit, JobSpy |

- They talk through owner-only endpoints `/api/jobs/jobradar-import` and `/api/jobradar/*` (key: JOBRADAR_SECRET). Change both sides together and keep `src/lib/jobs/jobradar.ts` `JOBRADAR_SITES` in step with JobRadar's sites.
- JobRadar's live copy is `~/JobRadar` (installed from `jobradar/` by `jobradar/Install JobRadar.command`); its data lives in `~/JobRadar/data` and is never committed. After changing `jobradar/`, tell the owner to rerun the installer.
- JobRadar test (offline, no network): `uv run --python 3.12 --with-requirements jobradar/requirements.txt python jobradar/tests/smoke_test.py`
- JobRadar details and tabs: `jobradar/README.md`. Feature plan: the "JobRadar + Backchannel: Feature Plan" doc.

## What this is
A personal job-search engine for SDR/BDR, GTM Engineer and AE roles. Test phase: one user (the owner) for 90 days. If it lands him a great job, it opens to the public later. Build single-user now, multi-user-ready (user_id + row-level security on every personal table).

Full spec: `docs/backchannel-build-brief.md` (stack, hard rules, data model, screens, and the 10 build prompts in section 9).
Design reference: `docs/backchannel-prototype.html`. Match its screens, colours and copy.

## Status (9 Nov 2026)
Full product built: Today dashboard, Roles (collection from Greenhouse/Lever/Ashby/SmartRecruiters with auto-repair of broken boards), Sources page (add any company by name), Great companies (AI curation + board discovery), Autopilot (AI-tailored CV, cover note, form answers; sensitive questions stop and ask; user submits), Outreach (Gmail OAuth, AI 3-email + 2-LinkedIn-step sequences, approve first email, daily follow-ups, stop on reply, blocklist), Referrals tracker with AI asks, Pay benchmark from published pay, Side income, "Ask Backchannel" AI chat, daily cron (/api/daily: score → autopilot → outreach → Telegram).
- Go-live steps for the owner: `docs/GO-LIVE.md` (run migration 0006, env vars, Google redirect URI, push).
- Key code: `src/lib/jobs/ingest.ts`, `src/lib/collectors/ats.ts`, `src/lib/jobs/scoring.ts`, `src/lib/apps/`, `src/lib/outreach/`, `src/lib/ai.ts` (OPENROUTER_API_KEY or ANTHROPIC_API_KEY).
- Vercel Hobby allows 2 daily crons: /api/collect-jobs (06:00 IST) and /api/daily (07:15 IST).
- Next.js 16: `next lint` is gone; lint with `npx eslint src`.

## Commands
- `npm install`: install dependencies
- `npm run dev`: run the app at http://localhost:3000
- `npm test`: unit tests (52, including the send logic against an in-memory fake database; CI runs them on every push)
- `npx eslint src`: lint
- `npm run build`: production build (run before saying a build step is done)

## Hard rules (from the brief)
1. No LinkedIn automation, login, scraping or stored LinkedIn credentials. LinkedIn steps are copy-ready tasks only.
2. Only public ATS feeds and licensed data providers. No scraping sites that forbid it.
   - Test-phase exception (owner decision, 11 Nov 2026): JobRadar, the owner's own app on his Mac (JobSpy), can send jobs from LinkedIn/Naukri/Indeed/Glassdoor/Bayt (JobSpy), Instahyre/NaukriGulf/Foundit/GulfTalent (Apify) and the public remote-job feeds RemoteOK, We Work Remotely, Himalayas, Remotive and Working Nomads (added 12 Nov 2026) to `/api/jobs/jobradar-import`. Google Jobs is wired in but off, because JobSpy's Google scraper returned nothing. They are saved private to the owner with `source` starting `jobradar:`. Backchannel's servers never fetch those sites. Before any public launch: remove the endpoint and delete `jobs where source like 'jobradar:%'`.
   - JobRadar also reads and writes through `/api/jobradar/*` (summary, ask, connections, referral, company-health, lookalikes, gulf-cv), all owner-only via JOBRADAR_SECRET (`src/lib/jobradar-auth.ts`). The `connections` table (migration 0016) holds the owner's own LinkedIn export; employer staff are never stored.
3. Never invent facts about the user in CVs, answers or emails.
4. Visa, work authorisation, salary, notice period and diversity questions always stop and ask the user.
5. Stealth: never contact or surface people at the user's current employer (blocklist).
6. Email: 20/day max to start, send window, stop on reply, opt-out line.
7. Human approval by default; autopilot only when switched on.
8. Keep the job search on personal accounts and tools only, never employer accounts or data.

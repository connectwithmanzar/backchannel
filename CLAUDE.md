# Backchannel: notes for Claude Code

## Who you're working with
The owner (Manzar) does not code. Explain every step in plain language, give click-by-click instructions for anything he must do himself (accounts, keys, settings), and run commands for him rather than asking him to. Keep changes small and show what changed.

## What this is
A personal job-search engine for SDR/BDR, GTM Engineer and AE roles. Test phase: one user (the owner) for 90 days. If it lands him a great job, it opens to the public later. Build single-user now, multi-user-ready (user_id + row-level security on every personal table).

Full spec: `docs/backchannel-build-brief.md` (stack, hard rules, data model, screens, and the 10 build prompts in section 9).
Design reference: `docs/backchannel-prototype.html`. Match its screens, colours and copy.

## Status
- Build 1 done: Next.js app shell with design tokens (light and dark), Supabase schema in `supabase/migrations/0001_init.sql`, job collector for Greenhouse/Lever/Ashby/SmartRecruiters (`src/lib/collector`, `scripts/collect.ts`, seed list in `data/seed-companies.json`), Roles page with heuristic fit scoring (`src/lib/score.ts`, profile in `data/profile.json`), 8 passing tests (`npm test`).
- The 24 seed company slugs have not been checked against the live boards yet. First real `npm run collect` will show any errors in `data/collect-report.json`; fix wrong slugs.
- Next: Build 2 (Supabase project + magic-link login + run migration), then builds 3–10 from the brief.

## Commands
- `npm install`: install dependencies
- `npm run collect`: pull today's sales roles into `data/jobs.json`
- `npm run dev`: run the app at http://localhost:3000
- `npm test`: collector tests
- `npm run build`: production build (run before saying a build step is done)

## Hard rules (from the brief)
1. No LinkedIn automation, login, scraping or stored LinkedIn credentials. LinkedIn steps are copy-ready tasks only.
2. Only public ATS feeds and licensed data providers. No scraping sites that forbid it.
3. Never invent facts about the user in CVs, answers or emails.
4. Visa, work authorisation, salary, notice period and diversity questions always stop and ask the user.
5. Stealth: never contact or surface people at the user's current employer (blocklist).
6. Email: 20/day max to start, send window, stop on reply, opt-out line.
7. Human approval by default; autopilot only when switched on.
8. Keep the job search on personal accounts and tools only, never employer accounts or data.

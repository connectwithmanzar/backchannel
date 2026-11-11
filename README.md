# Backchannel

This project also holds **JobRadar** (`jobradar/`), the job-search app that runs on your Mac and feeds Backchannel. See `jobradar/README.md`.

Your personal sales job-search engine (test phase: one user).
Full plan: `docs/backchannel-build-brief.md`. Design reference: `docs/backchannel-prototype.html`.

## What works today (build 1 of 10)
- App shell with every section, in the prototype's design (light and dark).
- Database setup script for Supabase: `supabase/migrations/0001_init.sql`.
- **Job collector**: reads public job boards (Greenhouse, Lever, Ashby, SmartRecruiters) for the companies in `data/seed-companies.json` and keeps sales roles (SDR/BDR, GTM Engineer, AE, sales leadership). It works out market, remote/hybrid, published pay and visa wording.
- **Roles page**: every collected role, scored for fit against `data/profile.json`, with filters and sort.
- 8 automated tests for the collector.

## Run it on your computer
You need Node.js 20 or newer (download the LTS version from nodejs.org).

```bash
npm install          # once
npm run collect      # pull today's sales roles (about a minute)
npm run dev          # start the app, then open http://localhost:3000
```

Other commands: `npm test` (collector tests), `npm run build` (production build).

## Change what it looks for
- **Companies:** edit `data/seed-companies.json`. After `npm run collect`, `data/collect-report.json` lists any board that couldn't be read (usually a wrong slug).
- **Your targets:** edit `data/profile.json` (role types, markets, tools, minimum pay in USD).

## Next builds
See section 9 of the build brief: Supabase login and storage → profile from CV → AI scoring → Telegram alerts → great companies → applications → Gmail outreach → AI chat.

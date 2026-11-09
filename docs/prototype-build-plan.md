# Prototype Build Plan (CTO)

Verified = read in code. Assumed = not checked (I did not open the UI pages).

## 1. Feasibility per item
| # | Item | Reuse / new | Days | Risk |
|---|---|---|---|---|
| 1 | Ranked list, company quality, min OTE per market | Reuse `scoring.ts`. Verified: one `min_ote_usd`, no company-quality score. New: both | 3 | Med: funding and hiring data needs a source |
| 2 | Fast/stretch tracks, weekly funnel | Reuse `funnel_events` (has reply, referral, interview types). Track = derived from market | 1-2 | Low |
| 3 | Best person per company + ask + copy | Reuse referral `draft`, `isBlocked`. New: finder adapter, cache | 4-5 | High: coverage in India/Gulf, licence |
| 4 | Email that person | Reuse `startSequence`/`sendStep`. Verified: cap, window, blocklist, stop-on-reply, opt-out all exist | 1 | Low |
| 5 | Auto-send from approved templates | New templates, flag, send path. Verified: nothing auto-sends today, since every email starts as `draft` | 3-4 | High |
| 6 | Paste-a-job | Reuse `normalise`, `scoreJob`. Verified: `jobs` is global, so pasted jobs need an owner column | 2-3 | Low-Med |
| 7 | Interview prep, offer comparison | New (no tables yet), reuse `ai.ts` | 3-4 | Low |

**Bug (verified):** `vercel.json` runs `/api/daily` at 07:15 IST but the send window is 09:00-18:00 IST, so `sendStep` throws. Move the cron to about 05:00 UTC.

## 2. Open questions answered
**Vercel Hobby.** 20 emails fit easily in one 300s run ([Vercel limits](https://vercel.com/docs/limits)). Hobby crons run once a day, anywhere in the scheduled hour (third-party, unverified). One run at about 10:30 IST works. Upgrade only for sends spread through the day, many users sharing one run (verified: `/api/daily` slices 260s per user), or failing deploys.

**Licensed data (all pricing from third-party blogs, so verify on the vendor pages).**
- [Apollo](https://fullenrich.com/content/apollo-pricing): free about 75 credits/month, email 1 credit, Basic about $49/user; API access terms reported inconsistently. People plus company data.
- [Hunter](https://www.typpout.com/blog/hunter-io-pricing/): Starter about $49/month, 500 searches. Good verifier, weaker at picking the right person.
- [Crunchbase API](https://www.provaapi.com/blog/crunchbase-api-pricing): sales-only, about $20k/year reported. Too dear. For funding and hiring signals use existing ATS job counts (`open_sales_roles`) plus Apollo company enrichment.
- Licence: unverified for both. Read their terms before paying; multi-user use likely needs another agreement (assumed).

**Cost at 45 touches/day (estimates).** One user: data $50-100, AI $5-25, Gmail and Vercel $0, so about $60-125/month. 100 users: Vercel Pro about $20 per seat, AI $500-2,500, data on a negotiated plan, plus Google security review for Gmail scopes (assumed). Not a prototype concern.

**Gmail safety.** Cap is about 500/day (vendor-reported, no Google page found), so 20 is far below it, but accounts still get blocked on spam reports and bounces. SPF/DKIM: not applicable, Google signs gmail.com mail. Reduce risk: ramp 5, 10, 15, 20 over two weeks (conflicts with the brief's 45/day in week 1; lean on referral asks first); verified addresses only; plain text, no tracking (verified); per-person text (verified); random gaps inside the window; stop-on-reply and opt-out (verified). Gap: no bounce detection, and a bounce may look like a reply (assumed). Fix before auto-send.

**Extension.** Save-this-page: 2-3 days, sideloaded, no store review. Rule 1/2 risk low-medium if it reads only on his click, is blocked on linkedin.com in code, never bulk. LinkedIn pre-fill: do not build. **Defer**; the paste box covers most of the value.

## 3. Build plan (smallest first). OWNER = needs owner approval (migration or env var). Every push or deploy also needs approval.
1. **Fix cron timing** (`vercel.json`), add per-run logging. 0.5 day. Test: send window.
2. **Two tracks and weekly funnel on Today** (`today/page.tsx`, new `lib/funnel.ts`). 1-2 days. No migration.
3. **Paste-a-job. OWNER.** Migration: `jobs.added_by`, `jobs.source`; RLS shows such rows only to that user. Files: new `api/jobs/paste/route.ts`, `process.ts`, `scoring.ts`. Links: fetch only public ATS URLs, otherwise ask for text. 2-3 days. Tests: ownership isolation.
4. **Per-market OTE and company quality. OWNER.** Migration: `profiles.min_ote_by_market jsonb`, `companies.funding_stage/hiring_growth/quality_score`. Files: `scoring.ts`. 2-3 days.
5. **Contact finder. OWNER.** Env var `APOLLO_API_KEY`. Migration: `contacts` add `provider`, `email_status`, `found_at`; new `contact_lookups` (user_id, company, result, RLS own rows) as a cache and spend cap. New `lib/contacts/finder.ts`. 3 days. Gate: 50-company coverage test first.
6. **Referral list, drafted ask, copy button, Email this person.** Reuse `api/referrals`, `startSequence`. 2 days. Optional migration (`referrals.contact_id`) makes it OWNER.
7. **Bounce detection and ramp. OWNER.** Migration: `preferences.email_ramp_start`. 1-2 days. Tests: bounce, ramp.
8. **Approved templates and auto-send. OWNER.** Migration: `outreach_templates` (own-rows RLS), `preferences.autosend_enabled default false`. Owner's approved text with fixed merge fields only; high fit only; week one every email approved. 3 days. Tests: flag off sends nothing.
9. **Interview prep and offers. OWNER.** Migration: `offers` table (own-rows RLS), prep text on `applications`. 3 days.

Rollback: migrations are additive and flags default off, so revert the commit and leave columns unused.

## 4. Top risks and what to measure first
1. **Contact coverage in India/Gulf/EU startups.** Before paying, run 50 target companies through the trial. Measure named person plus verified email.
2. **Referral reply-rate assumption (20%).** Cold asks usually do worse (assumed). Measure from day one.
3. **Gmail health.** Track bounces and complaints per day. Pause auto-send above 2% bounces.
4. **Missing pay data.** Many posts have no pay (`pay_band_status` unknown, verified), so a pay floor filters blindly. Measure share with pay.
5. **Reliability.** One daily cron on Hobby, and deploys have failed to trigger. Measure missed runs and AI spend per touch.

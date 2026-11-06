# Backchannel: Build Brief for an AI Coding Tool

> **How to use this file:** Paste the whole file into your AI coding tool (Cursor, Lovable, Bolt, Replit, Claude Code, or similar) as the project brief. Then send the **Build prompts** in section 9 one at a time, in order. Don't move to the next prompt until the "Check it works" step passes.
>
> **Design reference:** `backchannel-prototype.html` (open it in a browser). Match its screens, colours and copy.

---

## 1. What we're building

Backchannel is a job-search platform for **SDR, BDR, GTM Engineer and B2B sales (AE)** professionals. It finds every role that fits, hidden or public, scores it against the user's CV and sales record, and helps the user get in: tailored applications, personalised email outreach, and warm referrals.

**Phase 1 is a personal tool with exactly one user (the owner).** It runs his own 90-day job search. If it works, it opens to the public later. Build it **single-user now, but multi-user-ready**: every table has `user_id`, and row-level security is on.

**The owner does not code.** Explain every step in plain language, give exact click-by-click instructions for any account setup, and never assume he knows terminal commands. Prefer managed services over self-hosting.

### The owner's search (what the tool is tuned for)
- Target titles: Senior SDR/BDR, Founding BDR, GTM Engineer, Account Executive (SMB/Mid-market)
- Priorities: a big salary jump, USD/EUR pay (remote from India or relocation), good culture and work-life balance
- Markets: India (onsite/hybrid), remote from India for US/EU, EMEA (UK, Germany, Netherlands, France, Ireland), and any country that accepts foreign candidates
- Must run in **stealth**: never contact anyone at his current employer

---

## 2. Tech stack (use exactly this unless there's a blocking reason)

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui |
| Mobile | Same app as an installable PWA (phone-first layouts) |
| Hosting | Vercel |
| Database, login, file storage | Supabase (Postgres, Supabase Auth with email magic link, Supabase Storage for CVs) |
| Vector search | pgvector in Supabase |
| Background jobs | Supabase scheduled functions (pg_cron + Edge Functions) to start. Move to Inngest or Trigger.dev only if needed |
| AI | Anthropic Claude API: a fast, cheap model for bulk classification and a stronger model for fit explanations, drafts and interview prep. Embeddings from a hosted embeddings API, stored in pgvector |
| Alerts | Telegram bot |
| Email sending (Phase 3) | Gmail API with OAuth on the owner's **personal** Gmail; keep the Google app in "Testing" mode |
| Error tracking | Sentry (free tier) |
| Code hosting | GitHub (private repo) |

### Environment variables (keep these secret; never commit them)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
EMBEDDINGS_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
GOOGLE_CLIENT_ID=          # Phase 3
GOOGLE_CLIENT_SECRET=      # Phase 3
JOB_DATA_API_KEY=          # later, licensed job-data provider
SENTRY_DSN=
```

---

## 3. Hard rules (never break these)

1. **No LinkedIn automation.** Never log in to LinkedIn, store LinkedIn passwords or cookies, scrape LinkedIn, or auto-apply/auto-message there. LinkedIn steps are shown as tasks with a ready-to-copy message.
2. **No scraping of sites that forbid it.** Public ATS feeds (Greenhouse, Lever, Ashby, SmartRecruiters) and licensed data providers only.
3. **Never invent facts** about the user: no made-up titles, dates, employers, metrics or skills in CVs, answers or emails.
4. **Sensitive questions stop and ask the user:** visa or sponsorship, work authorisation, salary expectations, notice period, diversity or demographic questions. Never guess them.
5. **Stealth blocklist:** never email, apply to, or surface contacts at domains or companies on the user's blocklist.
6. **Email limits:** maximum 20 emails per day per mailbox to start, send only in a set window, stop a sequence on any reply, include a one-line opt-out, and never email anyone who opted out.
7. **Human approval by default** for applications and first emails. Autopilot modes come later and must be switched on explicitly.
8. **Every role shows its source** (board or hidden-channel type) and when it was last checked.

---

## 4. Data model (Supabase / Postgres)

Every table has `id uuid pk default gen_random_uuid()`, `user_id uuid references auth.users`, `created_at timestamptz default now()`, and RLS policies of the form `user_id = auth.uid()` (except shared reference tables marked *shared*).

- **profiles**: name, current_role, years_in_sales, quota_attainment_pct, meetings_per_month, segment (SMB/Mid-market/Enterprise), motion (Outbound/Inbound/Full-cycle), tools text[], target_titles text[], markets text[], min_ote_usd int, stealth bool, cv_file_path, cv_text, profile_embedding vector
- **preferences**: great_company_criteria text[] (High salary, Great culture, Top-tier perks, Work-life balance, Equity / income upside, Brand & prestige, Learning & growth, Remote flexibility, Job security, Mission & impact), valued_awards text[], countries text[], dealbreakers text[]
- **blocklist**: type (domain/company/person), value
- **companies** *(shared)*: name, domain, country, hq, size, sector, ats_type (greenhouse/lever/ashby/smartrecruiters/workday/other), ats_slug, careers_url
- **company_insights**: company_id, why_great text, criteria_tags text[], awards jsonb [{name, year, source_url}], visa_note, sources jsonb, added_by ('ai'/'user'), hidden bool
- **watchlist**: company_id, watching bool
- **signals**: company_id, type (funding/leader_hire/expansion/hiring_post/layoff), title, url, published_at, summary
- **jobs** *(shared)*: company_id, title, location, remote_type, market, source_type (careers/public/unposted/signal/network/recruiter), board, url, posted_at, last_checked_at, currency, base_min, base_max, ote_min, ote_max, pay_band_status (verified/estimated/unknown), visa_sponsorship (yes/no/unknown), description, dedupe_hash unique, embedding vector, is_active bool
- **job_scores**: job_id, score int, parts jsonb {tools, segment_motion, quota_record, pay, preferences}, explanation text, model, scored_at
- **applications**: job_id, status (needs_answer/awaiting_approval/scheduled/submitted/skipped), mode (ask/queue24h/auto), tailored_cv_path, answers jsonb, pending_question text, receipt text, submitted_at
- **contacts**: company_id, name, title, email, linkedin_url, source, opted_out bool
- **sequences**: name, steps jsonb [{day, channel: email|linkedin_task, template}]
- **outreach**: contact_id, sequence_id, step_index, channel, status (scheduled/sent/opened/replied/stopped/task_open/task_done), subject, body, scheduled_for, sent_at, gmail_message_id
- **funnel_events**: type (role_found/high_fit/applied/outreach_sent/reply/interview/offer), ref_id, occurred_at

---

## 5. Job collection (the engine)

Run daily at 6:00 IST:
1. For each company with a known ATS, call its public feed:
   - Greenhouse: `https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true`
   - Lever: `https://api.lever.co/v0/postings/{slug}?mode=json`
   - Ashby: `https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true`
   - SmartRecruiters: `https://api.smartrecruiters.com/v1/companies/{slug}/postings`
2. Keep only sales roles. Match titles with a keyword list (SDR, BDR, Sales Development, Business Development, Account Executive, GTM Engineer, Growth, Inside Sales, Partnerships), then confirm with the cheap AI model.
3. **Normalise:** location, remote type, market, currency, parsed pay (base/OTE ranges when present), visa mentions.
4. **Dedupe:** `dedupe_hash = sha256(lower(company) + lower(title) + lower(location))`. Update `last_checked_at` on repeats. Mark jobs inactive when they disappear from the feed.
5. **Embed** each new job.
6. **Score:** first filter with vector similarity against the profile embedding (top 100), then re-rank the shortlist with the stronger model. Output `score 0–100`, `parts`, and a 2-sentence `explanation`. Apply `min_ote_usd` and dealbreakers as hard filters.
7. **Notify:** one Telegram digest with roles scoring 75 or more (title, company, OTE, source, link), plus instant alerts for watched companies.

Seed list: start with ~50 companies known to hire sales roles on Greenhouse/Lever/Ashby across India, EMEA and remote-friendly US companies. Store the slugs in a seed file the owner can edit.

Later: add one licensed job-data provider for LinkedIn/Naukri/Indeed/StepStone listings (evaluate coverage of India and EMEA sales roles first). Stored with `source_type = 'public'` and `board = <name>`.

---

## 6. Screens (match the prototype)

1. **Roles**: feed of all roles with filters (market, where it's from, minimum OTE, segment, motion, verified pay band, open to foreign candidates) and sort (best fit, highest OTE, recently checked). Card: title, company, location, OTE + base, source tag, pay-band tag, fit %. Detail drawer: pay split, quota, "why it's hidden / where we found it", fit breakdown with matching tools, and actions (Request referral, Draft note to hiring manager, Add to Autopilot queue). Top panel: "Find roles from my CV or LinkedIn" + Job sources table with on/off toggles.
2. **Great companies**: AI-curated cards (why AI added it, criteria tags, awards with year + source link, visa note, country match). Shows open sales roles if any; otherwise "No open sales role right now" + **Keep watching**. Filters: All / Hiring now / Not hiring yet / Watching. Buttons: Find more companies with AI, Not for me. A fold-out panel for preferences.
3. **Autopilot**: mode (Ask before each / 24-hour queue / Full autopilot), daily cap, minimum fit, "great companies and hidden roles only" toggle, an always-on safety list, and a queue with statuses and receipts.
4. **Outreach**: sequence steps (email auto-send vs LinkedIn task), Connect Gmail, daily limit, send window, contacts table, email preview with AI personalisation highlighted, Rewrite with AI, LinkedIn tasks with Copy note / Mark done.
5. **My profile**: CV upload (AI extraction with confirm), sales scorecard form, LinkedIn URL (public info only, no login), chat-with-AI onboarding, verification, stealth toggle.
6. **Pay benchmark**: role + market → P25/median/P75 OTE with base/variable split, "you" marker, and hidden roles above the number.
7. **Referrals**: tracker (Requested → Viewed → Referred → Interview booked).
8. **Side income**: Remote Work Syndicate catalog (micro1, Turing, Mercor), with referral disclosure and links out.
9. **Ask Backchannel**: floating AI chat that can query the user's own data (roles, scores, companies, applications, outreach) and prep interviews.
10. **Funnel dashboard** (new): weekly counts of roles found, high-fit roles, applications, outreach, reply rate, interviews and offers.

### Design tokens (from the prototype)
- Light: bg `#EDF0F2`, surface `#FFFFFF`, sunk `#E3E7EB`, line `#CDD4DB`, text `#121A24`, muted `#56616E`, accent `#2340C8`, accent-soft `#DDE3FB`, signal `#9A5B00` / `#FBEFD9`, good `#16794A` / `#DCF2E6`, warn `#A33A1D` / `#F8E1D9`
- Dark: bg `#0E1319`, surface `#161D26`, sunk `#1D2631`, line `#2C3743`, text `#E7ECF2`, muted `#9AA6B4`, accent `#8FA3FF`, accent-soft `#232E58`, signal `#F2B65A` / `#3A2A10`, good `#5FD39A` / `#143326`, warn `#FF9A7D` / `#3D1F16`
- Fonts: Bricolage Grotesque (headings), Instrument Sans (body), JetBrains Mono (data)
- Radius 10px; support light + dark; phone-first.

---

## 7. AI prompts the app uses (store them as editable templates)

- **CV extraction:** return JSON {current_role, years, quota_attainment_pct, meetings_per_month, segment, motion, tools[], achievements[]}. Only facts present in the CV; use null when missing.
- **Fit re-rank:** given profile + preferences + job, return {score, parts, explanation}. Penalise dealbreakers; never reward unverifiable claims.
- **Great-company curation:** given preferences, propose companies with why_great, criteria_tags and awards **with source URLs**. If a fact can't be sourced, leave it out.
- **Tailored CV:** reorder and reword existing bullets toward the job; output a diff; never add facts.
- **Outreach email:** 90–130 words, a hook from a real signal, one proof point from the scorecard, one clear ask, an opt-out line.
- **Interview prep:** company brief, likely role-play, questions to ask, and how the owner's numbers map to their quota.

---

## 8. Owner setup checklist (accounts to create, all free to start)

1. GitHub account
2. Vercel account (sign in with GitHub)
3. Supabase account → new project (region: Mumbai or closest)
4. Anthropic Console account → API key, with a monthly spend limit set
5. Telegram → create a bot with @BotFather, get the token, then send it a message and get your chat ID
6. Sentry account (optional for week 1)
7. *(Phase 3)* Google Cloud project → enable Gmail API → OAuth consent screen in **Testing** mode with your personal Gmail as test user

---

## 9. Build prompts (send one at a time)

**Prompt 1: Project setup**
> Create the Next.js + TypeScript + Tailwind + shadcn/ui project described in this brief, connected to Supabase, deployable on Vercel. Add the design tokens (light and dark) and the fonts. Build the app shell: top navigation with Roles, Great companies, Autopilot, Outreach, My profile, Pay benchmark, Referrals, Side income, plus a placeholder page for each. Walk me click-by-click through creating the GitHub repo, Supabase project and Vercel deployment, and where to paste each environment variable.
>
> *Check it works:* you open your Vercel link on your phone and see the navigation in light and dark mode.

**Prompt 2: Database**
> Create the full Supabase schema from section 4 as a migration, with row-level security on every table and pgvector enabled. Add email magic-link login so only I can sign in. Tell me exactly where to click in Supabase to run it.
>
> *Check it works:* you can log in, and the tables appear in Supabase's Table Editor.

**Prompt 3: My profile**
> Build My profile: CV upload to Supabase Storage, AI extraction with the CV extraction prompt, a confirm step, the sales scorecard form, preferences, the blocklist and the stealth toggle. Save the profile embedding.
>
> *Check it works:* upload your CV and see your role, tools and numbers filled in correctly.

**Prompt 4: Job collector**
> Build the daily job collection from section 5 for Greenhouse, Lever, Ashby and SmartRecruiters, with an editable seed file of about 50 companies. Include sales-role filtering, normalisation, dedupe and pay parsing. Add a "Run now" button for testing.
>
> *Check it works:* press Run now and see real sales roles appear in the jobs table.

**Prompt 5: Scoring + Roles feed**
> Build embeddings, scoring and the Roles screen from section 6 (filters, sort, cards, detail drawer with fit breakdown and explanation).
>
> *Check it works:* the top roles make sense for you, and each explanation reads true.

**Prompt 6: Telegram alerts**
> Send a daily 9:00 IST Telegram digest of roles scoring 75 or more, plus instant alerts for watched companies.
>
> *Check it works:* you receive tomorrow morning's digest on your phone.

**Prompt 7: Great companies + watching + signals**
> Build Great companies from section 6 using the curation prompt (sourced facts only), the watchlist, and a signals feed from news RSS classified by AI.

**Prompt 8: Applications**
> Build the tailored-CV generator (with a diff), the answers store, the "stop and ask" rule for sensitive questions, and the Autopilot queue in "Ask before each" mode. I submit manually at first; the app logs the receipt.

**Prompt 9: Gmail outreach**
> Connect my personal Gmail via OAuth (Testing mode). Build sequences, personalised drafts, scheduled sending within limits, reply detection that stops sequences, opt-out handling, stealth blocklist enforcement and LinkedIn tasks.

**Prompt 10: Ask Backchannel + funnel dashboard**
> Build the AI chat that answers questions using my own data, and the weekly funnel dashboard.

**Later (only if earned):** a licensed job-data provider for public boards, Playwright autopilot for Greenhouse and Lever forms, pay benchmarks from real data, WhatsApp alerts, and multi-user signup.

---

## 10. Definition of success for the 90-day test
- An offer that meets the owner's bar: a big pay jump, USD/EUR pay, good culture and balance.
- Reply and interview rates clearly above cold applying.
- Then 5–10 peers use it for a month and also get interviews → consider opening it to the public.

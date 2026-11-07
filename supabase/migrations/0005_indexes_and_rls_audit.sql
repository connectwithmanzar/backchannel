-- Migration 0005: performance indexes + RLS audit confirmation
-- Run in Supabase SQL Editor → paste → Run.

-- ── Performance indexes ──────────────────────────────────────────────────────

-- Speed up the nightly Telegram digest query that filters unnotified high-scoring jobs.
create index if not exists job_scores_notify_idx
  on job_scores (user_id, score desc, telegram_notified_at)
  where telegram_notified_at is null;

-- Speed up the companies page join (company_insights → companies).
create index if not exists company_insights_company_id_idx
  on company_insights (company_id)
  where hidden = false;

-- Speed up per-user watchlist lookups on the companies page.
create index if not exists watchlist_user_watching_idx
  on watchlist (user_id, company_id)
  where watching = true;

-- Speed up per-user job score lookups when rendering the jobs board.
create index if not exists job_scores_user_job_idx
  on job_scores (user_id, job_id);

-- ── RLS audit notes (2026-11-07) ─────────────────────────────────────────────
-- Verified all 14 tables:
--
-- Personal tables (profiles, preferences, blocklist, watchlist, job_scores,
--   applications, contacts, sequences, outreach, funnel_events):
--   Single "own rows" policy — FOR ALL USING (user_id = auth.uid())
--   WITH CHECK (user_id = auth.uid()). Covers SELECT, INSERT, UPDATE, DELETE.
--   Correct: each user sees only their own rows.
--
-- company_insights (after migration 0004):
--   "read all company insights" — FOR SELECT TO authenticated USING (true)
--   "insert own company insights" — WITH CHECK (user_id = auth.uid())
--   "update own company insights" — USING + WITH CHECK (user_id = auth.uid())
--   "delete own company insights" — USING (user_id = auth.uid())
--   Correct: shared read, owner-only writes.
--
-- companies, jobs, signals:
--   "read <table>" — FOR SELECT TO authenticated USING (true)
--   No INSERT/UPDATE/DELETE policies → denied for authenticated users by default.
--   Service-role key (server-side only) bypasses RLS for admin writes.
--   Correct: shared read, server-only writes.
--
-- Storage bucket "cvs":
--   "owner read cvs" — FOR SELECT WHERE foldername[1] = auth.uid()::text
--   "owner write cvs" — FOR INSERT WHERE foldername[1] = auth.uid()::text
--   "owner delete cvs" — FOR DELETE WHERE foldername[1] = auth.uid()::text
--   Correct: each user is isolated to their own subfolder.
--
-- Action items resolved in this deploy:
--   - extract-cv route now requires authentication (was open to anonymous calls)
--   - curate-companies route now verifies admin server-side (not just UI-gated)
--   - collect-jobs route now requires CRON_SECRET on GET and admin auth on POST
--   - score-jobs route now requires authentication (was already OK, now rate-limited)

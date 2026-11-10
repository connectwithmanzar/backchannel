-- Marks when we last tried to find a company's public job board, so a long import can stop and resume.
alter table companies add column if not exists board_checked_at timestamptz;
-- Companies that already have a board, or were already scanned, count as checked.
update companies set board_checked_at = coalesce(last_collected_at, now()) where board_checked_at is null and (ats_slug is not null or last_collected_at is not null);
create index if not exists companies_board_unchecked_idx on companies (created_at) where board_checked_at is null and ats_slug is null;

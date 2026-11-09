-- Migration 0012: request counters shared by every server instance, so rate limits work on serverless.
-- Optional: until it is run the app falls back to the old per-instance limiter. Safe to run more than once.

create table if not exists usage_counters (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);
create index if not exists usage_counters_window_idx on usage_counters (window_start);
alter table usage_counters enable row level security;   -- no policies: only the server (service role) can touch it

create or replace function bump_usage(p_key text, p_window timestamptz) returns int
language plpgsql as $$
declare c int;
begin
  insert into usage_counters (key, window_start, count) values (p_key, p_window, 1)
  on conflict (key, window_start) do update set count = usage_counters.count + 1
  returning count into c;
  if random() < 0.01 then
    delete from usage_counters where window_start < now() - interval '2 days';
  end if;
  return c;
end;
$$;
revoke all on function bump_usage(text, timestamptz) from public, anon, authenticated;

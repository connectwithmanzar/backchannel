-- Make company_insights readable by all authenticated users (shared pool model).
-- Only the row owner can insert/update/delete their own insights.
-- This lets the admin curate companies that everyone sees, while watchlist/profile stay personal.

drop policy if exists "own rows" on company_insights;

create policy "read all company insights" on company_insights
  for select to authenticated using (true);

create policy "insert own company insights" on company_insights
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "update own company insights" on company_insights
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "delete own company insights" on company_insights
  for delete to authenticated
  using (user_id = auth.uid());

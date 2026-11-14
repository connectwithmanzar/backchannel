#!/usr/bin/env bash
# Proves a backup works: restores it into a throwaway database on this Mac and compares every table's row count.
# Nothing here touches Supabase. Run:   bash scripts/db/restore-test.sh backups/<folder>
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/db/pg-env.sh

BACKUP="${1:-}"
[ -d "$BACKUP" ] || { echo "Usage: bash scripts/db/restore-test.sh backups/<folder>"; exit 1; }
for t in initdb pg_ctl psql pg_restore; do need_tool "$t"; done

WORK="$(mktemp -d)"
PORT=54329
export PGHOST=127.0.0.1 PGPORT=$PORT PGUSER=postgres PGDATABASE=restore_test
unset PGPASSWORD PGSSLMODE
cleanup() { pg_ctl -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

echo "1/5 Starting a throwaway local database..."
initdb -D "$WORK/data" -U postgres --auth=trust >/dev/null
pg_ctl -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=127.0.0.1" -l "$WORK/log" -w start >/dev/null
PGDATABASE=postgres psql -qc "create database restore_test"

echo "2/5 Adding the Supabase pieces the backup refers to (roles, sign-in table, extensions)..."
psql -q <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create extension if not exists pgcrypto; create extension if not exists "uuid-ossp";
SQL
psql -q -c "create extension if not exists vector" || { echo "The 'vector' extension is missing. Install it with: brew install pgvector"; exit 1; }

echo "3/5 Restoring the backup..."
# The sign-in accounts are not in the app dump, so add placeholder rows from the saved list for the links between tables.
tail -n +2 "$BACKUP/auth-users.csv" | cut -d, -f1,2 | while IFS=, read -r id email; do psql -qc "insert into auth.users(id, email) values ('$id', '$email') on conflict do nothing"; done
pg_restore --no-owner --no-privileges --exit-on-error -d restore_test "$BACKUP/public.dump"

echo "4/5 Comparing row counts with the originals..."
bad=0
while IFS=, read -r table rows; do
  [ "$table" = "table" ] && continue
  now="$(psql -Atc "select count(*) from public.\"$table\"")"
  if [ "$now" != "$rows" ]; then echo "  MISMATCH $table: backup had $rows, restore has $now"; bad=1; else echo "  ok  $table ($rows)"; fi
done < "$BACKUP/row-counts.csv"

echo "5/5 Checking the files are intact..."
( cd "$BACKUP" && shasum -a 256 -c checksums.txt >/dev/null ) && echo "  checksums match" || { echo "  checksum problem"; bad=1; }

echo
if [ "$bad" = 0 ]; then echo "PASS: the backup restores cleanly."; else echo "FAIL: see the lines above. Do not continue until this passes."; exit 1; fi

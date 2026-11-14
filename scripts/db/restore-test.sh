#!/usr/bin/env bash
# Proves a backup works: restores it into a throwaway database on this Mac and compares every table's row count.
# Nothing here touches Supabase. Run:   bash scripts/db/restore-test.sh backups/<folder>
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/db/pg-env.sh

BACKUP="${1:-}"
[ -d "$BACKUP" ] || { echo "Usage: bash scripts/db/restore-test.sh backups/<folder>"; exit 1; }
for t in initdb pg_ctl psql pg_restore; do need_tool "$t"; done

# Postgres refuses to start on some Macs unless the language setting is valid.
export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8
WORK="$(mktemp -d /tmp/bcrt.XXXXXX)"   # short path: Postgres sockets break on long ones
PORT=54329
export PGHOST=127.0.0.1 PGPORT=$PORT PGUSER=postgres PGDATABASE=restore_test
unset PGPASSWORD PGSSLMODE
cleanup() { pg_ctl -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

echo "1/5 Starting a throwaway local database..."
initdb -D "$WORK/data" -U postgres --auth=trust -E UTF8 --locale=en_US.UTF-8 >/dev/null
pg_ctl -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=127.0.0.1" -l "$WORK/log" -w start >/dev/null || { echo "The local database did not start. Its log:"; tail -20 "$WORK/log"; exit 1; }
PGDATABASE=postgres psql -qc "create database restore_test"

echo "2/5 Adding the Supabase pieces the backup refers to (roles, sign-in table, extensions)..."
psql -q <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create extension if not exists pgcrypto; create extension if not exists "uuid-ossp";
SQL
psql -q -c "create extension if not exists vector" >/dev/null 2>&1 || { echo "Your tables use the 'vector' type. Install it with: brew install pgvector"; exit 1; }
# Your tables use the 'vector' type, which lives in the 'public' schema, so 'public' and its extensions stay as they are.

echo "3/5 Restoring the backup..."
# The sign-in accounts are not in the app dump, so add placeholder rows from the saved list for the links between tables.
tail -n +2 "$BACKUP/auth-users.csv" | cut -d, -f1,2 | while IFS=, read -r id email; do psql -qc "insert into auth.users(id, email) values ('$id', '$email') on conflict do nothing"; done
# Skip the dump's "create schema public" line, since the test database already has one (with the extensions in it).
pg_restore -l "$BACKUP/public.dump" | grep -v -E ' SCHEMA - public ' > "$WORK/restore.list"
pg_restore --no-owner --no-privileges --exit-on-error -L "$WORK/restore.list" -d restore_test "$BACKUP/public.dump"

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

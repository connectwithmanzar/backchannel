#!/usr/bin/env bash
# Backs up the Backchannel database from Supabase to your Mac. Read-only: it never changes anything in Supabase.
# Run from the backchannel folder:   bash scripts/db/backup.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck source=scripts/db/pg-env.sh
source scripts/db/pg-env.sh

need_tool pg_dump && need_tool psql && need_tool pg_restore
read_connection || exit 1

OUT="backups/$(date +%Y-%m-%d-%H%M)"
mkdir -p "$OUT"
chmod 700 backups "$OUT"
echo "Saving to $OUT"

echo "1/6 Checking the connection..."
psql -Atc "select current_database()" >/dev/null || { echo "Could not connect. Check the string and that your network allows it."; exit 1; }
SERVER_MAJOR="$(psql -Atc "show server_version_num" | cut -c1-2)"
CLIENT_MAJOR="$(pg_dump --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')"
if [ "$CLIENT_MAJOR" -lt "$SERVER_MAJOR" ]; then
  echo "pg_dump is version $CLIENT_MAJOR but your Supabase database is version $SERVER_MAJOR. Install a newer one: brew install postgresql@$SERVER_MAJOR"; exit 1
fi

echo "2/6 Dumping the app tables (compressed copy for restoring)..."
pg_dump --schema=public --no-owner --no-privileges --format=custom --file "$OUT/public.dump"

echo "3/6 Dumping a readable SQL copy..."
pg_dump --schema=public --no-owner --no-privileges --file "$OUT/public.sql"

echo "4/6 Saving the sign-in accounts list (no passwords)..."
psql -c "\copy (select id, email, created_at, last_sign_in_at, email_confirmed_at from auth.users order by created_at) to '$OUT/auth-users.csv' csv header"

echo "5/6 Saving the list of stored files (the files themselves are downloaded separately)..."
psql -c "\copy (select bucket_id, name, (metadata->>'size')::bigint as bytes, created_at from storage.objects order by bucket_id, name) to '$OUT/storage-objects.csv' csv header"

echo "6/6 Counting rows in every table, to check the backup later..."
: > "$OUT/row-counts.csv"
echo "table,rows" >> "$OUT/row-counts.csv"
for t in $(psql -Atc "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1"); do
  echo "$t,$(psql -Atc "select count(*) from public.\"$t\"")" >> "$OUT/row-counts.csv"
done

( cd "$OUT" && shasum -a 256 public.dump public.sql auth-users.csv storage-objects.csv row-counts.csv > checksums.txt )
chmod 600 "$OUT"/*

echo
echo "Done. Saved in $OUT :"
ls -lh "$OUT"
echo
echo "Tables backed up: $(($(wc -l < "$OUT/row-counts.csv") - 1))"
echo "Next: bash scripts/db/restore-test.sh $OUT"

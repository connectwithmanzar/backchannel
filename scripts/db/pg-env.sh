# Shared helper: turns a Supabase connection string plus your database password into PG* settings,
# so the password never appears in a command line or on screen.
# Usage: source scripts/db/pg-env.sh

read_connection() {
  local url pass out
  echo "Paste the connection string exactly as Supabase shows it (it may still contain [YOUR-PASSWORD]; that is fine)."
  read -rsp "Connection string (hidden): " url; echo
  [ -n "$url" ] || { echo "Nothing pasted."; return 1; }
  read -rsp "Your database password (hidden): " pass; echo
  [ -n "$pass" ] || { echo "No password entered."; return 1; }
  out="$(DB_URL="$url" DB_PASS="$pass" python3 - <<'PY'
import os, re, shlex, sys

url = os.environ["DB_URL"].strip()
password = os.environ["DB_PASS"]
m = re.match(r"^postgres(?:ql)?://(.*)$", url)
if not m:
    sys.exit("That does not look like a postgresql:// connection string.")
rest = m.group(1)
userinfo, sep, hostpart = rest.rpartition("@")
if not sep:
    sys.exit("The string has no user and host. Copy it again from Supabase, from the Session pooler option.")
user = userinfo.partition(":")[0] or "postgres"
hostport, _, dbpart = hostpart.partition("/")
host, _, port = hostport.partition(":")
db = dbpart.split("?")[0] or "postgres"
if not host or "[" in host or "]" in host:
    sys.exit("Could not read the host from the string. Copy it again from Supabase.")
pairs = {"PGHOST": host, "PGPORT": port or "5432", "PGUSER": user, "PGPASSWORD": password, "PGDATABASE": db, "PGSSLMODE": "require"}
for k, v in pairs.items():
    print(f"export {k}={shlex.quote(v)}")
PY
)" || { echo "$out"; return 1; }
  eval "$out"
}

need_tool() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing '$1'. Install the database tools once with:"
    echo "    brew install postgresql@17 pgvector"
    echo "then open a new Terminal window and run this again."
    return 1
  }
}

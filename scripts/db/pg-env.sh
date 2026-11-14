# Shared helper: turns a Supabase connection string into PG* settings so the password never appears in a command line.
# Usage: source scripts/db/pg-env.sh   (asks for the string, hidden as you type it)

read_connection() {
  local url
  read -rsp "Paste your database connection string (it stays on this Mac, nothing is shown): " url
  echo
  [ -n "$url" ] || { echo "Nothing pasted."; return 1; }
  eval "$(DB_URL="$url" python3 - <<'PY'
import os, shlex, sys
from urllib.parse import urlparse, unquote
u = urlparse(os.environ["DB_URL"])
if u.scheme not in ("postgresql", "postgres") or not u.hostname:
    sys.exit("echo 'That does not look like a postgresql:// connection string.'; return 1")
pairs = {"PGHOST": u.hostname, "PGPORT": str(u.port or 5432), "PGUSER": unquote(u.username or "postgres"),
         "PGPASSWORD": unquote(u.password or ""), "PGDATABASE": (u.path or "/postgres").lstrip("/") or "postgres", "PGSSLMODE": "require"}
for k, v in pairs.items():
    print(f"export {k}={shlex.quote(v)}")
PY
)"
}

need_tool() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing '$1'. Install the database tools once with:"
    echo "    brew install postgresql@17 pgvector"
    echo "then open a new Terminal window and run this again."
    return 1
  }
}

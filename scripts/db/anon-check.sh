#!/usr/bin/env bash
# Proves the public (logged-out) key cannot read Backchannel's private tables. Read-only; changes nothing.
# Run:   bash scripts/db/anon-check.sh
# You need the project address and the PUBLISHABLE key (Supabase -> Project Settings -> API keys). Never use the secret key here.
set -euo pipefail
read -rp "Project address (https://xxxx.supabase.co): " URL
read -rsp "Publishable key (hidden): " KEY; echo
URL="${URL%/}"
fail=0
for t in jobs applications profiles connections gmail_accounts; do
  body="$(curl -s -m 20 -w '\n%{http_code}' "$URL/rest/v1/$t?select=*&limit=1" -H "apikey: $KEY" -H "Accept-Profile: backchannel")"
  code="${body##*$'\n'}"; text="${body%$'\n'*}"
  if [ "$text" = "[]" ] || echo "$text" | grep -q -i -E "permission denied|not found|42501|PGRST"; then
    echo "  ok   $t: logged-out request got nothing ($code)"
  else
    echo "  OPEN $t: logged-out request returned data!"; fail=1
  fi
done
echo
[ "$fail" = 0 ] && echo "PASS: logged-out visitors cannot read Backchannel data." || { echo "FAIL: some data is readable without signing in. Tell me before doing anything else."; exit 1; }

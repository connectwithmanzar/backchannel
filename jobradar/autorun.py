"""JobRadar daily auto-run: runs the saved search and sends NEW jobs to Backchannel.

Started every morning by macOS (see "Install JobRadar.command"). Does nothing if no search is saved.
- Learning search: sites that bring replies get more results, sites that never do get fewer (if switched on).
- Once a week: each Backchannel great company is searched by name on LinkedIn, Naukri and Bayt (free sites).
Writes what happened to data/autorun_log.json, which the app shows under "Daily auto-run".
"""

from __future__ import annotations

import json
import time
from datetime import datetime

import bc
import core
import insights


def _send(jobs, p, entry) -> None:
    view = core.apply_filters(jobs, p.get("exclude", []), p.get("must", []))
    new = view[view["status"] == "NEW"]
    entry["found"] += len(view)
    entry["new"] += len(new)
    if not len(new):
        return
    conn = core.load_bc()
    if not (conn.get("url") and conn.get("secret")):
        entry["message"] += " New jobs found, but Backchannel isn't connected."
        return
    ok, msg, totals = core.send_to_backchannel(conn, new, p.get("add_companies", True))
    entry["sent"] += totals["added"] if ok else 0
    entry["message"] += " " + msg.replace("**", "").split("\n\n")[0] if ok else f" Send failed: {msg}"


def main() -> None:
    p = core.read_json(core.AUTORUN_FILE)
    if not p.get("enabled"):
        return
    settings = core.read_json(core.SETTINGS_FILE)
    entry: dict = {"at": datetime.now().strftime("%Y-%m-%d %H:%M"), "found": 0, "new": 0, "sent": 0, "message": ""}
    try:
        summary, _ = bc.summary(force=True)
        if settings.get("learning", True):
            p["per_site_map"] = insights.tuned_per_site(bc.outcomes_df(summary), p["sites"], int(p["per_site"]))
        jobs, log, _ = core.run_search(p)
        entry["sites"] = [f"{r['site']} {r['market']}: {r['jobs']}" for r in log]
        if jobs is None:
            entry["message"] = "No jobs came back. Sites may be limiting requests; it will try again tomorrow."
        else:
            _send(jobs, p, entry)

        # Weekly great-company name search.
        names = bc.great_companies(summary)
        last = float(settings.get("name_search_at", 0))
        if names and time.time() - last > 6.5 * 86400:  # about once a week
            gjobs, _ = core.name_search(names[:15], p["markets"])
            settings["name_search_at"] = time.time()
            core.SETTINGS_FILE.write_text(json.dumps(settings, indent=1))
            if gjobs is not None:
                before = entry["new"]
                _send(gjobs, {**p, "must": []}, entry)
                entry["message"] += f" Weekly great-company search: {entry['new'] - before} new."
        if not entry["message"].strip():
            entry["message"] = "No new jobs since the last run."
        sig = insights.signals(core.load_history())
        if len(sig):
            entry["message"] += f" {len(sig)} companies show hiring signals (see Signals tab)."
    except Exception as e:
        entry["message"] = f"Auto-run failed: {e}"
    entry["message"] = entry["message"].strip()
    history = core.read_json(core.AUTORUN_LOG).get("runs", [])
    core.AUTORUN_LOG.write_text(json.dumps({"runs": ([entry] + history)[:30]}, indent=1))


if __name__ == "__main__":
    main()

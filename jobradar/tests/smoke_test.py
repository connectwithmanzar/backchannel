"""Offline smoke test for JobRadar: no network, no real job sites, nothing written to your real data.

Run from the backchannel folder:
    uv run --python 3.12 --with-requirements jobradar/requirements.txt python jobradar/tests/smoke_test.py
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))

# Point JobRadar at a throwaway copy so the real ~/JobRadar/data is never touched.
tmp = Path(tempfile.mkdtemp())
for f in HERE.glob("*.py"):
    (tmp / f.name).write_text(f.read_text())
sys.path.insert(0, str(tmp))
os.chdir(tmp)

import pandas as pd  # noqa: E402
import jobspy  # noqa: E402
from jobspy.model import JobPost  # noqa: E402

CALLS: list[tuple[str, str]] = []


def fake_scrape(site_name, search_term, location=None, results_wanted=15, **kw):
    site = site_name[0]
    CALLS.append((site, search_term))
    titles = ["Sales Development Representative", "BDR", "Account Executive", "Head of Sales", "Software Engineer", "Inside Sales Executive"]
    rows = [dict(id=f"{site}{i}", site=site, job_url=f"https://example.com/{site}/{abs(hash(search_term)) % 999}/{location}/{i}",
                 title=titles[i], company=["Careem", "HubSpot", "Razorpay"][i % 3], location=location or "Dubai, UAE",
                 date_posted=pd.Timestamp.now().date(), description="B2B SaaS outbound, HubSpot, cold calling. Uncapped commission, rockstar!" if i == 1 else "Pipeline, Sales Navigator",
                 company_rating=4.1) for i in range(6)]
    df = pd.DataFrame(rows, columns=list(JobPost.model_fields))
    df.attrs = {"errors": {}}
    return df


jobspy.scrape_jobs = fake_scrape

import core  # noqa: E402
import insights  # noqa: E402
import people  # noqa: E402

core.scrape_jobs = fake_scrape
failures: list[str] = []


def check(cond: bool, msg: str) -> None:
    print(("ok   " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)


p = dict(keywords=core.KEYWORD_PACK[:2], markets=["India", "UAE"], cities={}, sites=["linkedin", "indeed", "naukri", "bayt"],
         posted_hours=168, per_site=30)
jobs, log, dupes = core.run_search(p)
check(jobs is not None and len(jobs) > 0, "search returns jobs")
check(all(insights.role_family(t) for t in jobs["title"]), "sales-only filter drops non-sales titles")
check(any(" OR " in t for s, t in CALLS if s == "linkedin"), "LinkedIn gets one OR-combined search per group")
check(sum(1 for s, _ in CALLS if s == "naukri") == 8, "Naukri searches the first 4 alternatives of each group")
check((jobs["status"] == "NEW").all(), "first run marks everything NEW")
check(jobs["flags"].str.contains("Hype").any(), "red flags detected")
jobs2, _, _ = core.run_search(p)
check((jobs2["status"] == "Seen before").all(), "second run marks jobs as seen")
check(len(insights.signals(core.load_history())) > 0, "hiring signals found")
check(len(insights.uniqueness(core.load_sightings())) > 0, "uniqueness score computed")
check(people.same_company("Careem Networks FZ-LLC", "Careem") and not people.same_company("Meta", "Metabase"), "company matching")
check(people.excluded("Taboola India") and not people.search_links("Taboola", "SDR", [], None), "current employer is never suggested")
check(core.count_searches(p)["linkedin"] == 4, "search counter")

print(f"\n{'All checks passed' if not failures else f'{len(failures)} check(s) failed'}.")
sys.exit(1 if failures else 0)

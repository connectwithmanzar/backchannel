"""Free, official job feeds (no scraping):

- Adzuna: official API with a free key; "personal job search" is an allowed use. India only (no Gulf coverage).
- Working Nomads: public JSON feed of remote jobs; JobRadar keeps sales roles open to India / Asia / anywhere.
"""

from __future__ import annotations

import math
import re
import threading
import time

import pandas as pd
import requests

from insights import role_family

TIMEOUT = 30
REMOTE_OK = re.compile(r"\b(anywhere|worldwide|global|india|asia|apac|ist)\b|utc ?\+ ?5", re.I)
REMOTE_NOT_OK = re.compile(r"\b(us only|usa only|united states only|uk only|europe only|eu only|cet|est|pst|canada only|must be based in (the )?(us|uk|eu))\b", re.I)


def _clean_html(text) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", str(text or ""))).strip()


# ----------------------------------------------------------------- adzuna ---
def adzuna(kw: str, city: str, n: int, hours: int, app_id: str, app_key: str) -> tuple[pd.DataFrame, str]:
    params = {"app_id": app_id, "app_key": app_key, "what": kw, "results_per_page": max(1, min(int(n), 50)),
              "sort_by": "date", "content-type": "application/json"}
    if city:
        params["where"] = city
    if hours:
        params["max_days_old"] = max(1, math.ceil(hours / 24))
    try:
        res = requests.get("https://api.adzuna.com/v1/api/jobs/in/search/1", params=params, timeout=TIMEOUT)
    except Exception as e:
        return pd.DataFrame(), f"Couldn't reach Adzuna: {e}"[:120]
    if res.status_code in (401, 403):
        return pd.DataFrame(), "Adzuna key not accepted. Check it under Adzuna in the sidebar."
    if res.status_code == 429:
        return pd.DataFrame(), "Adzuna's free limit reached for now. Try later."
    if not res.ok:
        return pd.DataFrame(), f"Adzuna error {res.status_code}"
    rows = []
    for j in (res.json() or {}).get("results", []):
        if not j.get("redirect_url") or not j.get("title"):
            continue
        predicted = str(j.get("salary_is_predicted", "0")) == "1"
        rows.append({
            "id": str(j.get("id", "")), "site": "adzuna", "job_url": j["redirect_url"], "job_url_direct": "",
            "title": _clean_html(j["title"]), "company": ((j.get("company") or {}).get("display_name") or "").strip(),
            "location": ((j.get("location") or {}).get("display_name") or "").strip(),
            "date_posted": pd.to_datetime(j.get("created"), errors="coerce").date() if j.get("created") else None,
            "min_amount": None if predicted else j.get("salary_min"), "max_amount": None if predicted else j.get("salary_max"),
            "currency": "INR" if not predicted and j.get("salary_min") else "", "interval": "yearly" if not predicted and j.get("salary_min") else "",
            "is_remote": None, "description": _clean_html(j.get("description"))[:12000],
        })
    return pd.DataFrame(rows), ""


# ---------------------------------------------------------- working nomads ---
_wn_lock = threading.Lock()
_wn_cache: dict = {"at": 0.0, "items": []}


def _wn_items() -> list[dict]:
    with _wn_lock:  # one download per search, shared by every keyword
        if time.time() - _wn_cache["at"] > 900:
            res = requests.get("https://www.workingnomads.com/api/exposed_jobs/", timeout=TIMEOUT)
            res.raise_for_status()
            _wn_cache.update(at=time.time(), items=res.json() or [])
        return _wn_cache["items"]


def working_nomads(kw: str, hours: int) -> tuple[pd.DataFrame, str]:
    """Remote sales jobs open to India (or anywhere / Asia). Matches the keyword loosely on the title."""
    try:
        items = _wn_items()
    except Exception as e:
        return pd.DataFrame(), f"Couldn't reach Working Nomads: {e}"[:120]
    words = [w for w in re.findall(r"[a-z]+", kw.lower()) if len(w) > 2]
    cutoff = pd.Timestamp.now(tz="UTC") - pd.Timedelta(hours=hours or 24 * 30)
    rows = []
    for j in items:
        title, loc = str(j.get("title") or ""), str(j.get("location") or "")
        if not role_family(title) and "sales" not in str(j.get("category_name", "")).lower():
            continue
        if words and not any(w in title.lower() for w in words):
            continue
        if REMOTE_NOT_OK.search(loc) or (loc and not REMOTE_OK.search(loc)):
            continue
        posted = pd.to_datetime(j.get("pub_date"), errors="coerce", utc=True)
        if pd.notna(posted) and posted < cutoff:
            continue
        rows.append({
            "id": str(j.get("url", "")), "site": "workingnomads", "job_url": j.get("url", ""), "job_url_direct": "",
            "title": title, "company": str(j.get("company_name") or ""), "location": f"Remote ({loc})" if loc else "Remote",
            "date_posted": posted.date() if pd.notna(posted) else None, "is_remote": True,
            "description": _clean_html(j.get("description"))[:12000],
        })
    return pd.DataFrame(rows), ""

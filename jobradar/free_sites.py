"""Free, official job feeds (no scraping):

- Adzuna: official API with a free key; "personal job search" is an allowed use. India only (no Gulf coverage).
- Working Nomads: public JSON feed of remote jobs; JobRadar keeps sales roles open to India / Asia / anywhere.
- RemoteOK, We Work Remotely, Himalayas and Remotive: public remote-job feeds, handled the same way (see the end of this file).
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


# ------------------------------------------------- more remote job feeds ---
# Public feeds meant for reuse: RemoteOK (JSON, asks for a link back, which every job keeps), We Work Remotely (RSS),
# Himalayas (JSON API) and Remotive (JSON API). Each is downloaded once per search and shared by every keyword group.
# JobRadar keeps sales roles open to India, Asia or anywhere, like Working Nomads above.
_feed_lock = threading.Lock()
_feed_cache: dict[str, dict] = {}
HEADERS = {"User-Agent": "JobRadar (personal job search; github.com/connectwithmanzar/backchannel)"}


def _feed(name: str, loader) -> list[dict]:
    with _feed_lock:
        hit = _feed_cache.get(name)
        if not hit or time.time() - hit["at"] > 900:
            _feed_cache[name] = {"at": time.time(), "items": loader()}
        return _feed_cache[name]["items"]


def _get(url: str, **params):
    res = requests.get(url, params=params or None, headers=HEADERS, timeout=TIMEOUT)
    res.raise_for_status()
    return res


def _open_to_india(loc: str) -> bool:
    """A remote role is kept when it names no country limit, or names India, Asia or anywhere."""
    loc = str(loc or "")
    if REMOTE_NOT_OK.search(loc):
        return False
    return not loc.strip() or bool(REMOTE_OK.search(loc))


def _group_words(kw: str) -> list[str]:
    """Words from every alternative of a keyword group, so one pass covers 'SDR | BDR | Inside Sales ...'."""
    return sorted({w for w in re.findall(r"[a-z]+", str(kw).lower()) if len(w) > 2})


def _when(value) -> pd.Timestamp:
    """A posting time from a date string, or from a Unix timestamp in seconds or milliseconds (Himalayas sends seconds)."""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return pd.to_datetime(value, unit="ms" if value > 1e11 else "s", utc=True, errors="coerce")
    return pd.to_datetime(value, errors="coerce", utc=True)


def _remote_rows(items: list[dict], site: str, kw: str, hours: int) -> pd.DataFrame:
    """items: dicts with title, company, location, url, posted (any date text), description."""
    words = _group_words(kw)
    cutoff = pd.Timestamp.now(tz="UTC") - pd.Timedelta(hours=hours or 24 * 30)
    rows, seen = [], set()
    for j in items:
        title, url = str(j.get("title") or "").strip(), str(j.get("url") or "").strip()
        if not title or not url.startswith("https://") or url in seen:
            continue
        if not role_family(title) or (words and not any(w in title.lower() for w in words)):
            continue
        if not _open_to_india(j.get("location")):
            continue
        posted = _when(j.get("posted"))
        if pd.notna(posted) and posted < cutoff:
            continue
        seen.add(url)
        loc = str(j.get("location") or "").strip()
        rows.append({
            "id": url, "site": site, "job_url": url, "job_url_direct": "", "title": title,
            "company": str(j.get("company") or "").strip(), "location": f"Remote ({loc})" if loc else "Remote",
            "date_posted": posted.date() if pd.notna(posted) else None, "is_remote": True,
            "description": _clean_html(j.get("description"))[:12000],
        })
    return pd.DataFrame(rows)


def remoteok(kw: str, hours: int) -> tuple[pd.DataFrame, str]:
    def load() -> list[dict]:
        data = _get("https://remoteok.com/api").json() or []
        return [{"title": d.get("position"), "company": d.get("company"), "location": d.get("location"), "url": d.get("url"),
                 "posted": d.get("date"), "description": d.get("description")} for d in data if isinstance(d, dict) and d.get("position")]
    try:
        return _remote_rows(_feed("remoteok", load), "remoteok", kw, hours), ""
    except Exception as e:
        return pd.DataFrame(), f"Couldn't reach RemoteOK: {e}"[:120]


def weworkremotely(kw: str, hours: int) -> tuple[pd.DataFrame, str]:
    import xml.etree.ElementTree as ET  # RSS from a public feed; no external entities are used

    def load() -> list[dict]:
        out: list[dict] = []
        for feed in ("remote-sales-and-marketing-jobs", "remote-business-and-management-jobs"):
            try:
                root = ET.fromstring(_get(f"https://weworkremotely.com/categories/{feed}.rss").content)
            except Exception:
                continue
            for it in root.iter("item"):
                raw = (it.findtext("title") or "").strip()
                company, _, title = raw.partition(": ")
                out.append({"title": title or raw, "company": company if title else "", "location": it.findtext("region") or "",
                            "url": (it.findtext("link") or "").strip(), "posted": it.findtext("pubDate"), "description": it.findtext("description")})
        return out
    try:
        items = _feed("weworkremotely", load)
        if not items:
            return pd.DataFrame(), "We Work Remotely gave nothing back."
        return _remote_rows(items, "weworkremotely", kw, hours), ""
    except Exception as e:
        return pd.DataFrame(), f"Couldn't reach We Work Remotely: {e}"[:120]


HIMALAYAS_QUERIES = ["sales development representative", "business development representative", "account executive", "inside sales", "gtm", "sales manager"]


def himalayas(kw: str, hours: int) -> tuple[pd.DataFrame, str]:
    """Himalayas can filter by country, so these are roles open to people in India (remote jobs that list India)."""
    def load() -> list[dict]:
        out: list[dict] = []
        for q in HIMALAYAS_QUERIES:
            for offset in (0, 20, 40):
                try:
                    jobs = (_get("https://himalayas.app/jobs/api/search", q=q, country="India", limit=20, offset=offset).json() or {}).get("jobs", [])
                except Exception:
                    break
                for d in jobs:
                    out.append({"title": d.get("title"), "company": d.get("companyName"), "location": "India",
                                "url": d.get("applicationLink") or d.get("guid"), "posted": d.get("pubDate"), "description": d.get("description") or d.get("excerpt")})
                if len(jobs) < 20:
                    break
        return out
    try:
        return _remote_rows(_feed("himalayas", load), "himalayas", kw, hours), ""
    except Exception as e:
        return pd.DataFrame(), f"Couldn't reach Himalayas: {e}"[:120]


def remotive(kw: str, hours: int) -> tuple[pd.DataFrame, str]:
    def load() -> list[dict]:
        jobs = (_get("https://remotive.com/api/remote-jobs", category="sales", limit=200).json() or {}).get("jobs", [])
        return [{"title": d.get("title"), "company": d.get("company_name"), "location": d.get("candidate_required_location"),
                 "url": d.get("url"), "posted": d.get("publication_date"), "description": d.get("description")} for d in jobs]
    try:
        return _remote_rows(_feed("remotive", load), "remotive", kw, hours), ""
    except Exception as e:
        return pd.DataFrame(), f"Couldn't reach Remotive: {e}"[:120]

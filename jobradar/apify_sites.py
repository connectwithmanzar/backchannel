"""Extra job sites through Apify (pay per result): Instahyre, NaukriGulf, Foundit, GulfTalent.

Each site uses one public Apify actor, called with your Apify API token. Results are mapped to
the same columns JobSpy returns, so they mix into one table. Every call carries a spending cap.
"""

from __future__ import annotations

import pandas as pd
import requests

APIFY_URL = "https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items"

GULF_NG_COUNTRY = {"UAE": "17", "Saudi Arabia": "14", "Qatar": "13", "Kuwait": "6", "Bahrain": "2", "Oman": "10"}
GULF_COUNTRY_NAME = {"UAE": "United Arab Emirates", "Saudi Arabia": "Saudi Arabia", "Qatar": "Qatar",
                     "Kuwait": "Kuwait", "Bahrain": "Bahrain", "Oman": "Oman"}
# Words that show a Foundit Gulf job is in the chosen country (Foundit's Gulf search covers the whole region).
GULF_PLACES = {
    "UAE": ["uae", "emirates", "dubai", "abu dhabi", "sharjah", "ajman", "ras al", "fujairah"],
    "Saudi Arabia": ["saudi", "ksa", "riyadh", "jeddah", "dammam", "khobar", "mecca", "makkah", "medina"],
    "Qatar": ["qatar", "doha"], "Kuwait": ["kuwait"], "Bahrain": ["bahrain", "manama"], "Oman": ["oman", "muscat"],
}


def _nearest(options: list[int], days: int) -> int:
    return next((o for o in options if o >= days), options[-1])


def _days(hours: int) -> int:
    return max(1, round(hours / 24))


# --------------------------------------------------------------- inputs ---
def _instahyre(kw, market, city, n, hours):
    inp = {"searchQueries": [kw], "maxItems": n}
    if city:
        inp["city"] = city.lower()
    return inp


def _naukrigulf(kw, market, city, n, hours):
    inp = {"keywords": [kw], "clusterCountry": [GULF_NG_COUNTRY[market]], "maxResults": n,
           "freshness": str(_nearest([1, 3, 7, 15, 30, 60], _days(hours)))}
    if city:
        inp["location"] = city
    return inp


def _foundit(kw, market, city, n, hours):
    inp = {"searchQueries": [kw], "region": "india" if market == "India" else "gulf", "maxResults": n,
           "freshnessDays": _nearest([1, 3, 7, 15, 30], _days(hours)), "sortBy": "date", "includeDescription": False}
    if city:
        inp["locations"] = [city]
    return inp


def _gulftalent(kw, market, city, n, hours):
    d = _days(hours)
    posted = "24h" if d <= 1 else "7d" if d <= 7 else "30d" if d <= 30 else "anytime"
    return {"keyword": kw, "location": city or GULF_COUNTRY_NAME[market], "posted_date": posted, "maxJobs": n}


SITES: dict[str, dict] = {
    "instahyre": {"label": "Instahyre", "actor": "memo23~instahyre-jobs-scraper", "markets": ["India"], "input": _instahyre},
    "naukrigulf": {"label": "NaukriGulf", "actor": "epicscrapers~naukrigulf-jobs-scraper", "markets": list(GULF_NG_COUNTRY), "input": _naukrigulf},
    "foundit": {"label": "Foundit", "actor": "scrapesage~foundit-scraper", "markets": ["India", *GULF_NG_COUNTRY], "input": _foundit},
    "gulftalent": {"label": "GulfTalent", "actor": "shahidirfan~gulftalent-job-scraper", "markets": list(GULF_NG_COUNTRY), "input": _gulftalent},
}


# -------------------------------------------------------------- outputs ---
def _first(d: dict, *keys):
    for k in keys:
        v = d.get(k)
        if v not in (None, "", [], {}):
            return v
    return None


def _text(v) -> str:
    if v is None:
        return ""
    if isinstance(v, dict):
        return str(v.get("name") or v.get("title") or "")
    if isinstance(v, list):
        return ", ".join(_text(x) for x in v if x)
    return str(v).strip()


def _date(v):
    if v in (None, ""):
        return None
    try:
        if isinstance(v, (int, float)) or (isinstance(v, str) and v.isdigit()):
            n = float(v)
            return pd.to_datetime(n, unit="ms" if n > 1e11 else "s").date()
        return pd.to_datetime(v, utc=True).date()
    except Exception:
        return None


def _num(v):
    try:
        return float(str(v).replace(",", "")) if v not in (None, "") else None
    except ValueError:
        return None


def map_item(site: str, it: dict) -> dict:
    url = _text(_first(it, "jobUrl", "url", "jdURL", "public_url", "applyUrl"))
    if url.startswith("/"):
        url = {"instahyre": "https://www.instahyre.com", "naukrigulf": "https://www.naukrigulf.com",
               "foundit": "https://www.foundit.in", "gulftalent": "https://www.gulftalent.com"}[site] + url
    return {
        "id": _text(_first(it, "jobId", "job_id", "id")),
        "site": site,
        "job_url": url,
        "job_url_direct": _text(_first(it, "external_apply_url", "applyUrl")),
        "title": _text(_first(it, "title", "designation")),
        "company": _text(_first(it, "companyName", "company", "company_name", "employerName")),
        "location": _text(_first(it, "location", "locations", "searchLocation")),
        "date_posted": _date(_first(it, "postedDate", "postedAt", "date_posted", "latestPostedDate")),
        "min_amount": _num(_first(it, "minSalary", "salaryMin")),
        "max_amount": _num(_first(it, "maxSalary", "salaryMax")),
        "currency": _text(_first(it, "salaryCurrency")),
        "interval": "",
        "is_remote": bool(_first(it, "is_remote", "remote")) or None,
        "description": _text(_first(it, "description", "description_text", "companyDescription"))[:12000],
    }


def fetch(site: str, kw: str, market: str, city: str, n: int, hours: int, token: str, max_usd: float) -> tuple[pd.DataFrame, str]:
    """Runs one actor and returns (jobs, note). Never raises for site errors; the note explains."""
    cfg = SITES[site]
    try:
        res = requests.post(
            APIFY_URL.format(actor=cfg["actor"]),
            params={"timeout": 240, "maxItems": n, "maxTotalChargeUsd": round(max(max_usd, 0.01), 2)},
            headers={"Authorization": f"Bearer {token}"},
            json=cfg["input"](kw, market, (city or "").strip(), n, hours),
            timeout=280,
        )
    except Exception as e:
        return pd.DataFrame(), f"Couldn't reach Apify: {e}"[:120]
    if res.status_code == 401:
        return pd.DataFrame(), "Apify token not accepted. Check it under Apify settings."
    if res.status_code == 402:
        return pd.DataFrame(), "Apify credit used up for this month."
    if res.status_code == 408:
        return pd.DataFrame(), "Apify took too long (over 4 minutes). Try fewer results."
    if not res.ok:
        try:
            msg = res.json().get("error", {}).get("message", "")
        except Exception:
            msg = res.text[:100]
        return pd.DataFrame(), f"Apify error {res.status_code}: {msg}"[:120]
    try:
        items = res.json()
    except Exception:
        return pd.DataFrame(), "Apify returned something unreadable."
    rows = [map_item(site, it) for it in items if isinstance(it, dict)]
    rows = [r for r in rows if r["title"] and r["job_url"]]
    if site == "foundit" and market != "India":  # Foundit's Gulf search covers all six countries
        places = GULF_PLACES[market] + ([city.lower()] if city else [])
        rows = [r for r in rows if any(p in r["location"].lower() for p in places)]
    if hours and site != "instahyre":  # keep the "posted within" promise when a date is known
        cutoff = (pd.Timestamp.now() - pd.Timedelta(hours=hours)).date()
        rows = [r for r in rows if r["date_posted"] is None or r["date_posted"] >= cutoff]
    return pd.DataFrame(rows), ""

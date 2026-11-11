"""JobRadar engine: searching, de-duplicating, history and sending to Backchannel.

Shared by the app (app.py) and the daily auto-run (autorun.py).
"""

from __future__ import annotations

import io
import json
import re
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Callable

import pandas as pd
import requests
from jobspy import scrape_jobs

import apify_sites
import free_sites
import insights

APP_DIR = Path(__file__).parent
DATA_DIR = APP_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)
HISTORY_FILE = DATA_DIR / "jobs_history.csv"
BC_FILE = DATA_DIR / "backchannel.json"
AUTORUN_FILE = DATA_DIR / "autorun.json"
AUTORUN_LOG = DATA_DIR / "autorun_log.json"
APIFY_FILE = DATA_DIR / "apify.json"
TERMS_FILE = DATA_DIR / "terms.json"
CONNECTIONS_FILE = DATA_DIR / "connections.csv"
SETTINGS_FILE = DATA_DIR / "settings.json"
ADZUNA_FILE = DATA_DIR / "adzuna.json"
SIGHTINGS_FILE = DATA_DIR / "sightings.csv"

# Which sites work in which market, and how each site wants the location written.
# The first five are free (JobSpy). Instahyre, NaukriGulf, Foundit and GulfTalent run through Apify (paid).
MARKETS: dict[str, dict] = {
    "India": {"indeed": "india", "bayt_country": "India", "sites": ["linkedin", "indeed", "naukri", "glassdoor", "adzuna", "workingnomads", "instahyre", "foundit"]},
    "UAE": {"indeed": "united arab emirates", "bayt_country": "UAE", "sites": ["linkedin", "indeed", "bayt", "naukrigulf", "foundit", "gulftalent"]},
    "Saudi Arabia": {"indeed": "saudi arabia", "bayt_country": "Saudi Arabia", "sites": ["linkedin", "indeed", "bayt", "naukrigulf", "foundit", "gulftalent"]},
    "Qatar": {"indeed": "qatar", "bayt_country": "Qatar", "sites": ["linkedin", "indeed", "bayt", "naukrigulf", "foundit", "gulftalent"]},
    "Kuwait": {"indeed": "kuwait", "bayt_country": "Kuwait", "sites": ["linkedin", "indeed", "bayt", "naukrigulf", "foundit", "gulftalent"]},
    "Oman": {"indeed": "oman", "bayt_country": "Oman", "sites": ["linkedin", "indeed", "bayt", "naukrigulf", "foundit", "gulftalent"]},
    "Bahrain": {"indeed": "bahrain", "bayt_country": "Bahrain", "sites": ["linkedin", "indeed", "bayt", "naukrigulf", "foundit", "gulftalent"]},
}
SITE_LABELS = {"linkedin": "LinkedIn", "indeed": "Indeed", "naukri": "Naukri", "glassdoor": "Glassdoor", "bayt": "Bayt",
               "adzuna": "Adzuna", "workingnomads": "Working Nomads (remote)",
               **{k: v["label"] for k, v in apify_sites.SITES.items()}}
PAID_SITES = set(apify_sites.SITES)
POSTED_WITHIN = {"Last 1 hour": 1, "Last 4 hours": 4, "Last 8 hours": 8, "Last 24 hours": 24, "Last 3 days": 72, "Last 7 days": 168, "Last 14 days": 336, "Last 30 days": 720}
SHOW_COLS = ["status", "title", "company", "location", "site", "date_posted", "salary",
             "is_remote", "people", "rating", "flags", "keyword", "market", "job_url"]
EXACT_HOURS_SITES = {"linkedin", "indeed"}  # other sites only know the posting day
INDIA_PLACES = ["india", "bangalore", "bengaluru", "mumbai", "delhi", "gurgaon", "gurugram", "noida", "pune", "hyderabad", "chennai",
                "kolkata", "ahmedabad", "jaipur", "kochi", "chandigarh", "indore"]


# ---------------------------------------------------------------- helpers ---
def site_location(site: str, market: str, city: str) -> str:
    """Build the location string each site understands."""
    city = (city or "").strip()
    if site == "bayt":
        country = MARKETS[market]["bayt_country"]
        return f"{city}, {country}" if city else country
    if site == "naukri":
        return city  # Naukri is India-only; a city (or blank for all India)
    if site in ("indeed", "glassdoor"):
        return city or market
    return f"{city}, {market}" if city else ("United Arab Emirates" if market == "UAE" else market)  # LinkedIn


def norm(text) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(text or "").lower()).strip()


def clean(v) -> str:
    return "" if v is None or (isinstance(v, float) and pd.isna(v)) else str(v)


def fmt_salary(row) -> str:
    lo, hi, cur, per = row.get("min_amount"), row.get("max_amount"), row.get("currency") or "", row.get("interval") or ""
    if pd.isna(lo) and pd.isna(hi):
        return ""
    parts = [f"{v:,.0f}" for v in (lo, hi) if pd.notna(v)]
    return f"{cur} {' – '.join(parts)} {('/ ' + str(per)) if per else ''}".strip()


def split_list(raw: str, sep: str = ",") -> list[str]:
    return [x.strip() for x in (raw or "").replace("\n", sep).split(sep) if x.strip()]


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except Exception:
        return {}


# ---------------------------------------------------------------- history ---
def load_history() -> pd.DataFrame:
    if HISTORY_FILE.exists():
        try:
            return pd.read_csv(HISTORY_FILE)
        except Exception:
            pass
    return pd.DataFrame(columns=["dedupe_key", "first_seen"])


def save_history(jobs: pd.DataFrame) -> None:
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    def col(name):
        return jobs[name] if name in jobs.columns else ""
    new_rows = pd.DataFrame({
        "dedupe_key": jobs["dedupe_key"], "first_seen": now, "title": jobs["title"], "company": jobs["company"],
        "location": jobs["location"], "site": jobs["site"], "job_url": jobs["job_url"],
        "market": col("market"), "keyword": col("keyword"), "family": col("family"), "date_posted": col("date_posted"),
        "min_amount": col("min_amount"), "max_amount": col("max_amount"), "currency": col("currency"),
        "rating": col("rating"), "flags": col("flags"),
    })
    combined = pd.concat([load_history(), new_rows], ignore_index=True).drop_duplicates(subset="dedupe_key", keep="first")
    combined.to_csv(HISTORY_FILE, index=False)


# ----------------------------------------------------------------- search ---
def run_search(p: dict, on_progress: Callable[[float, str], None] | None = None) -> tuple[pd.DataFrame | None, list[dict], int]:
    """Runs every keyword x market x site search. Returns (jobs or None, per-site log, duplicates removed).

    p: keywords, markets, cities{market: city}, sites, posted_hours, per_site, remote_only, full_desc.
    Jobs are marked NEW or Seen before against the history, and the history is updated.
    """
    apify = load_apify()
    tasks = [(kw, m, s) for kw in p["keywords"] for m in p["markets"] for s in p["sites"] if s in MARKETS[m]["sites"]]
    log: list[dict] = []
    adz = read_json(ADZUNA_FILE)
    skipped_paid = [t for t in tasks if t[2] in PAID_SITES and not apify.get("token")]
    skipped_adz = [t for t in tasks if t[2] == "adzuna" and not (adz.get("app_id") and adz.get("app_key"))]
    tasks = [t for t in tasks if t not in skipped_paid and t not in skipped_adz]
    for kw, market, site in skipped_paid:
        log.append({"site": SITE_LABELS[site], "market": market, "keyword": kw, "jobs": 0, "note": "Skipped: add your Apify token to use this site."})
    for kw, market, site in skipped_adz:
        log.append({"site": SITE_LABELS[site], "market": market, "keyword": kw, "jobs": 0, "note": "Skipped: add your free Adzuna key to use this site."})
    n_paid = sum(min(len(alternatives(t[0])), MAX_ALTS_PAID) for t in tasks if t[2] in PAID_SITES)
    per_call_usd = float(apify.get("max_usd", 0.5)) / max(1, n_paid)
    locks = {s: threading.Lock() for s in SITE_LABELS}  # one request at a time per site, different sites in parallel

    def one(kw: str, market: str, site: str) -> tuple[pd.DataFrame, str]:
        """One keyword group on one site. Sites that understand OR get one combined search;
        the others search the first few alternatives one by one, splitting the result budget."""
        alts = alternatives(kw)
        n = int((p.get("per_site_map") or {}).get(site, p["per_site"]))
        if site in OR_SITES or len(alts) == 1:
            return single(or_query(alts) if site in OR_SITES else alts[0], market, site, n)
        used = alts[:MAX_ALTS_PAID if site in PAID_SITES else MAX_ALTS_FREE]
        frames_, notes = [], []
        for a in used:
            df, note = single(a, market, site, max(10, n // len(used)))
            if len(df):
                frames_.append(df)
            if note:
                notes.append(note)
        return (pd.concat(frames_, ignore_index=True) if frames_ else pd.DataFrame()), "; ".join(dict.fromkeys(notes))

    def single(kw: str, market: str, site: str, n: int) -> tuple[pd.DataFrame, str]:
        city = p.get("cities", {}).get(market, "")
        with locks[site]:
            if site == "adzuna":
                return free_sites.adzuna(kw, city, n, p["posted_hours"], adz["app_id"], adz["app_key"])
            if site == "workingnomads":
                return free_sites.working_nomads(kw, p["posted_hours"])
            if site in PAID_SITES:
                return apify_sites.fetch(site, kw, market, city, n, p["posted_hours"], apify["token"], per_call_usd)
            loc = site_location(site, market, city)
            df = scrape_jobs(
                site_name=[site], search_term=kw, location=loc or None, results_wanted=n,
                hours_old=p["posted_hours"], country_indeed=MARKETS[market]["indeed"], is_remote=p.get("remote_only", False),
                linkedin_fetch_description=p.get("full_desc", False), verbose=0,
            )
            return df, str((df.attrs or {}).get("errors", {}).get(site) or "")

    frames = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(one, *t): t for t in tasks}
        for i, fut in enumerate(as_completed(futures), 1):
            kw, market, site = futures[fut]
            if on_progress:
                on_progress(i / len(tasks), f"Done: {SITE_LABELS[site]} · {market} · {kw}")
            try:
                df, note = fut.result()
            except Exception as e:  # one site failing never stops the rest
                df, note = pd.DataFrame(), str(e)
            label = alternatives(kw)[0]
            if len(df) and p.get("sales_only", True):
                kept = df[df["title"].map(lambda t: insights.role_family(t) != "")]
                if len(kept) < len(df):
                    note = (note + "; " if note else "") + f"{len(df) - len(kept)} non-sales roles dropped"
                df = kept
            log.append({"site": SITE_LABELS[site], "market": market, "keyword": label, "jobs": len(df), "note": note[:160]})
            if len(df):
                df = df.copy()
                df["keyword"], df["market"] = label, market
                frames.append(df)
    if not frames:
        return None, log, 0
    jobs, dupes = finalize(frames)
    return jobs, log, dupes


OR_SITES = {"linkedin", "indeed"}   # these understand: "sales development representative" OR SDR
MAX_ALTS_FREE = 4                   # other free sites: first 4 alternatives of a group, searched one by one
MAX_ALTS_PAID = 2                   # Apify sites: first 2 only, to protect the monthly budget

# The SDR / BDR / GTM keyword pack. One line = one group; "|" separates alternatives for the same kind of role.
KEYWORD_PACK = [
    "Sales Development Representative | SDR | Business Development Representative | BDR | Account Development Representative | Market Development Representative",
    "Inside Sales Representative | Inside Sales Executive | Outbound Sales Representative | Lead Generation Specialist | Lead Generation Executive",
    "Business Development Executive | Business Development Associate | Business Development Manager",
    "GTM Engineer | Go-To-Market Engineer | GTM Operations | Revenue Operations Specialist | Growth Engineer",
    "SDR Team Lead | Sales Development Manager | BDR Manager | Head of Sales Development",
    "Associate Account Executive | Account Executive | Sales Manager | Inside Sales Manager",
]


def alternatives(kw: str) -> list[str]:
    alts = [a.strip() for a in str(kw).split("|") if a.strip()]
    return alts or [str(kw).strip()]


def or_query(alts: list[str]) -> str:
    return " OR ".join(f'"{a}"' if " " in a else a for a in alts)


def count_searches(p: dict) -> dict:
    """How many site searches a run makes, so the sidebar can warn before LinkedIn gets upset."""
    total, linkedin = 0, 0
    for kw in p.get("keywords", []):
        alts = alternatives(kw)
        for m in p.get("markets", []):
            for s in p.get("sites", []):
                if s not in MARKETS[m]["sites"]:
                    continue
                k = 1 if s in OR_SITES or len(alts) == 1 else min(len(alts), MAX_ALTS_PAID if s in PAID_SITES else MAX_ALTS_FREE)
                total += k
                linkedin += k if s == "linkedin" else 0
    return {"total": total, "linkedin": linkedin}


def finalize(frames: list[pd.DataFrame]) -> tuple[pd.DataFrame, int]:
    """Merges site results: salary text, role family, red flags, ratings, duplicates removed, NEW vs seen, history and term stats."""
    jobs = pd.concat(frames, ignore_index=True)
    for c in ["description", "company_rating"]:
        if c not in jobs.columns:
            jobs[c] = None
    jobs["salary"] = jobs.apply(fmt_salary, axis=1)
    jobs["family"] = jobs["title"].map(insights.role_family)
    jobs["flags"] = [insights.red_flags(t, d) for t, d in zip(jobs["title"], jobs["description"])]
    jobs["rating"] = pd.to_numeric(jobs["company_rating"], errors="coerce").round(1)
    jobs["dedupe_key"] = jobs["title"].map(norm) + " | " + jobs["company"].map(norm) + " | " + jobs["market"].map(norm)
    try:
        record_sightings(jobs)
    except Exception:
        pass
    before = len(jobs)
    jobs = jobs.drop_duplicates(subset="job_url").drop_duplicates(subset="dedupe_key")
    hist = load_history()
    seen = set(hist["dedupe_key"]) if len(hist) else set()
    jobs["status"] = jobs["dedupe_key"].map(lambda k: "Seen before" if k in seen else "NEW")
    try:
        insights.update_terms(TERMS_FILE, jobs[jobs["status"] == "NEW"])
    except Exception:
        pass
    save_history(jobs)
    return jobs, before - len(jobs)


def record_sightings(jobs: pd.DataFrame) -> None:
    """Every (job, site) pair seen, before duplicates are merged, so each source's uniqueness can be measured."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    new = pd.DataFrame({"key": jobs["title"].map(norm) + " | " + jobs["company"].map(norm), "site": jobs["site"],
                        "market": jobs["market"], "seen": now}).drop_duplicates(["key", "site"])
    try:
        old = pd.read_csv(SIGHTINGS_FILE, dtype=str)
    except Exception:
        old = pd.DataFrame(columns=new.columns)
    allr = pd.concat([old, new], ignore_index=True).drop_duplicates(["key", "site"], keep="first")
    allr.to_csv(SIGHTINGS_FILE, index=False)


def load_sightings() -> pd.DataFrame:
    try:
        return pd.read_csv(SIGHTINGS_FILE, dtype=str)
    except Exception:
        return pd.DataFrame(columns=["key", "site", "market", "seen"])


def market_of(location: str) -> str:
    l = str(location or "").lower()
    for m, places in apify_sites.GULF_PLACES.items():
        if any(p in l for p in places):
            return m
    return "India" if any(p in l for p in INDIA_PLACES) else ""


def name_search(companies: list[str], markets: list[str], per_company: int = 20) -> tuple[pd.DataFrame | None, list[dict]]:
    """Searches each company by name on LinkedIn, Naukri (India) and Bayt (Gulf); keeps only that company's sales roles
    in your markets. Used weekly for great companies. Free sites only."""
    import people  # local import: people imports insights, which core also imports
    gulf = [m for m in markets if m != "India"]
    frames, log = [], []
    for company in companies:
        sites = ["linkedin"] + (["naukri"] if "India" in markets else []) + (["bayt"] if gulf else [])
        for site in sites:
            try:
                df = scrape_jobs(site_name=[site], search_term=company, location=None,
                                 results_wanted=per_company, hours_old=24 * 30, country_indeed="india", verbose=0)
            except Exception as e:
                log.append({"site": SITE_LABELS[site], "market": "", "keyword": company, "jobs": 0, "note": str(e)[:120]})
                continue
            if len(df):
                df = df[df["company"].map(lambda c: people.same_company(c, company))]
                df = df[df["title"].map(lambda t: insights.role_family(t) != "")]
                df["market"] = df["location"].map(market_of)
                if site == "naukri":
                    df.loc[df["market"] == "", "market"] = "India"
                df = df[df["market"].isin(markets)]
                df["keyword"] = f"great company: {company}"
            log.append({"site": SITE_LABELS[site], "market": "", "keyword": company, "jobs": len(df), "note": ""})
            if len(df):
                frames.append(df)
    if not frames:
        return None, log
    jobs, _ = finalize(frames)
    return jobs, log


def apply_filters(jobs: pd.DataFrame, exclude: list[str], must: list[str]) -> pd.DataFrame:
    view = jobs
    excl = [x.lower() for x in exclude]
    if excl:
        view = view[~view["company"].fillna("").str.lower().apply(lambda c: any(x in c for x in excl))]
    must_l = [x.lower() for x in must]
    if must_l:
        view = view[view["title"].fillna("").str.lower().apply(lambda t: any(x in t for x in must_l))]
    return view


# ------------------------------------------------------------------ apify ---
def load_apify() -> dict:
    return read_json(APIFY_FILE)


def save_apify(token: str, max_usd: float) -> None:
    APIFY_FILE.write_text(json.dumps({"token": token.strip(), "max_usd": max_usd}))


# ------------------------------------------------------------ backchannel ---
def load_bc() -> dict:
    return read_json(BC_FILE)


def save_bc(url: str, secret: str) -> None:
    BC_FILE.write_text(json.dumps({"url": url.strip().rstrip("/"), "secret": secret.strip()}))


def send_to_backchannel(bc: dict, picked: pd.DataFrame, add_companies: bool) -> tuple[bool, str, dict]:
    """Sends jobs in batches of 100. Returns (ok, readable message, totals)."""
    jobs = [{
        "title": clean(r.get("title")), "company": clean(r.get("company")), "location": clean(r.get("location")),
        "url": clean(r.get("job_url")), "site": clean(r.get("site")), "description": clean(r.get("description"))[:12000],
    } for _, r in picked.iterrows()]
    totals = {"added": 0, "skipped": [], "companies": {"added": [], "already": [], "no_board": []}}
    for i in range(0, len(jobs), 100):
        try:
            res = requests.post(f"{bc['url']}/api/jobs/jobradar-import", timeout=150,
                                headers={"Authorization": f"Bearer {bc['secret']}"},
                                json={"jobs": jobs[i:i + 100], "add_companies": add_companies}, allow_redirects=False)
        except Exception as e:
            return False, f"Couldn't reach Backchannel: {e}", totals
        if res.is_redirect or res.status_code == 404:
            return False, ("Backchannel doesn't have the JobRadar connection yet. Publish the latest Backchannel "
                           "(git push) and wait 2 minutes for Vercel."), totals
        try:
            data = res.json()
        except ValueError:
            return False, f"Backchannel sent back an unexpected page (status {res.status_code}). Check the address in Backchannel connection.", totals
        if not res.ok:
            return False, data.get("error", f"Backchannel said {res.status_code}"), totals
        totals["added"] += data.get("added", 0)
        totals["skipped"] += data.get("skipped", [])
        for k in totals["companies"]:
            totals["companies"][k] += (data.get("companies") or {}).get(k, [])
    lines = [f"**{totals['added']} job(s) added to Backchannel** (Roles → Added by you)."]
    if totals["skipped"]:
        lines.append(f"{len(totals['skipped'])} skipped: " + "; ".join(
            f"{s['title']} at {s['company']} ({s['reason']})" for s in totals["skipped"][:8]))
    if add_companies:
        if totals["companies"]["added"]:
            lines.append("New Sources: " + ", ".join(totals["companies"]["added"]))
        if totals["companies"]["no_board"]:
            lines.append("No public careers board found for: " + ", ".join(totals["companies"]["no_board"]))
    return True, "\n\n".join(lines), totals


def to_excel(df: pd.DataFrame) -> bytes:
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as xw:
        df.to_excel(xw, index=False, sheet_name="Jobs")
    return buf.getvalue()

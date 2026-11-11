"""Referral engine on your Mac: your LinkedIn connections (from LinkedIn's own data export), matched to
hiring companies, plus one-click LinkedIn search links. Nothing is automated on LinkedIn: you open links
and send messages yourself. Mirrors Backchannel's src/lib/jobs/referral-paths.ts.
"""

from __future__ import annotations

import csv
import io
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

import pandas as pd

from insights import role_family

EXCLUDED = ["taboola"]  # your current employer: its people are never stored or suggested
_SUFFIX = re.compile(r"\b(inc|llc|ltd|limited|pvt|private|plc|gmbh|corp|corporation|co|company|technologies|technology|tech|labs|group|holdings|india|fz ?llc|fze|me|mena)\b")
_SALES = re.compile(r"\b(sales|business development|bdr|sdr|account (executive|manager)|revenue|gtm|go[- ]to[- ]market|partnerships?|growth)\b", re.I)
_SENIOR = re.compile(r"\b(head|director|vp|vice president|chief|cro|founder|co-founder|manager|lead|principal)\b", re.I)
_HR = re.compile(r"\b(recruit|talent|people|hr|human resources)\b", re.I)


def excluded(*values) -> bool:
    return any(x in str(v or "").lower() for v in values for x in EXCLUDED)


def company_key(name) -> str:
    k = str(name or "").lower().replace("&", " and ")
    k = re.sub(r"[^a-z0-9]+", " ", k)
    k = _SUFFIX.sub(" ", k)
    return re.sub(r"\s+", " ", k).strip()


def same_company(a, b) -> bool:
    ka, kb = company_key(a), company_key(b)
    if not ka or not kb:
        return False
    if ka == kb:
        return True
    short, long = (ka, kb) if len(ka) <= len(kb) else (kb, ka)
    return len(short) >= 4 and long.startswith(short + " ")


def parse_linkedin_export(raw: bytes) -> pd.DataFrame:
    """Reads LinkedIn's Connections.csv (it starts with a few note lines before the header)."""
    text = raw.decode("utf-8-sig", errors="replace")
    lines = text.splitlines()
    start = next((i for i, l in enumerate(lines) if l.lower().startswith("first name")), None)
    if start is None:
        raise ValueError("This doesn't look like LinkedIn's Connections.csv (no 'First Name' header found).")
    rows = list(csv.DictReader(io.StringIO("\n".join(lines[start:]))))
    out = []
    for r in rows:
        name = f"{(r.get('First Name') or '').strip()} {(r.get('Last Name') or '').strip()}".strip()
        company = (r.get("Company") or "").strip()
        if not name or excluded(company):
            continue
        connected = pd.to_datetime(r.get("Connected On") or "", errors="coerce")
        out.append({"full_name": name, "company": company, "position": (r.get("Position") or "").strip(),
                    "linkedin_url": (r.get("URL") or "").strip(),
                    "connected_on": connected.strftime("%Y-%m-%d") if pd.notna(connected) else ""})
    return pd.DataFrame(out, columns=["full_name", "company", "position", "linkedin_url", "connected_on"])


def load_connections(path: Path) -> pd.DataFrame:
    try:
        df = pd.read_csv(path, dtype=str).fillna("")
        df["company_key"] = df["company"].map(company_key)
        return df
    except Exception:
        return pd.DataFrame(columns=["full_name", "company", "position", "linkedin_url", "connected_on", "company_key"])


def rank(position: str, connected_on: str) -> int:
    s = 0
    if _SALES.search(position or ""):
        s += 40
    if _SENIOR.search(position or ""):
        s += 25
    if _HR.search(position or ""):
        s += 15
    try:
        years = (datetime.now() - datetime.fromisoformat(connected_on)).days / 365
        s += max(0, 20 - round(years * 4))
    except Exception:
        pass
    return s


def people_at(conns: pd.DataFrame, company: str, max_n: int = 8) -> pd.DataFrame:
    if excluded(company) or not len(conns):
        return conns.iloc[0:0]
    first = company_key(company).split(" ")[0] if company_key(company) else ""
    cand = conns[conns["company_key"].str.startswith(first)] if first else conns.iloc[0:0]
    hit = cand[cand["company"].map(lambda c: same_company(c, company))].copy()
    if not len(hit):
        return hit
    hit["score"] = [rank(p, d) for p, d in zip(hit["position"], hit["connected_on"])]
    return hit.sort_values("score", ascending=False).head(max_n)


def count_people(conns: pd.DataFrame, companies: pd.Series) -> pd.Series:
    if not len(conns):
        return pd.Series(0, index=companies.index)
    cache: dict[str, int] = {}

    def n(c):
        key = company_key(c)
        if key not in cache:
            cache[key] = len(people_at(conns, c))
        return cache[key]
    return companies.map(n)


def manager_title_for(title) -> str:
    return {
        "SDR/BDR": "Sales Development Manager OR Head of Sales Development",
        "Account Executive": "Head of Sales OR Sales Director",
        "GTM Engineer": "Head of Revenue Operations OR Head of Growth",
        "Account management": "Head of Account Management OR Head of Customer Success",
        "Partnerships": "Head of Partnerships",
        "Sales ops & CS": "Head of Revenue Operations",
        "Sales leadership": "VP Sales OR Chief Revenue Officer",
    }.get(role_family(title), "Head of Sales")


def linkedin_search(keywords: str) -> str:
    return "https://www.linkedin.com/search/results/people/?keywords=" + quote(keywords.strip())


def search_links(company: str, title: str, past_employers: list[str], college: str | None) -> list[tuple[str, str]]:
    if excluded(company):
        return []
    links = [(f"Likely hiring manager at {company}", linkedin_search(f"{company} {manager_title_for(title)}"))]
    for p in [x.strip() for x in past_employers if x.strip()][:5]:
        if not same_company(p, company):
            links.append((f"People at {company} who worked at {p}", linkedin_search(f"{company} {p}")))
    if college and college.strip():
        links.append((f"{college.strip()} alumni at {company}", linkedin_search(f"{company} {college.strip()}")))
    return links

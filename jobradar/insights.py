"""JobRadar insights: role families, red flags, hidden-job signals, market view, seasonality,
search-term stats for "Get found", and what's working (learning search).

Everything here reads JobRadar's own history on your Mac. Nothing leaves your computer.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd

# ------------------------------------------------------------ role family ---
# Based on the rules Backchannel uses (src/lib/jobs/process.ts), so both apps mostly agree on what a role is.
_INCLUDE: list[tuple[str, str]] = [
    (r"\b(head of|director|vp|vice president|manager|lead),? (of )?(sales development|business development|sdr|bdr|outbound|inside sales)\b", "Sales leadership"),
    (r"\b(sdr|bdr|sales development|business development rep(resentative)?|lead development|market development rep(resentative)?|inside sales|outbound (sales )?rep(resentative)?|revenue development|account development rep(resentative)?|adr)\b", "SDR/BDR"),
    (r"\b(gtm|go[- ]to[- ]market) (engineer|engineering|systems|operations|automation)\b|\brevops engineer\b|\bgrowth engineer\b|\bsales (systems|automation) engineer\b", "GTM Engineer"),
    (r"\b(account executive|\bae\b|new business (sales|manager|executive)|sales executive|business development (manager|executive)|founding (sales|ae))\b", "Account Executive"),
    (r"\b(partner(ship)?s? (manager|executive|lead|director|development)|channel (sales|manager|partner)|alliances? (manager|lead|director))\b", "Partnerships"),
    (r"\b(account manager|key account|client partner|strategic account|major account|relationship manager)\b", "Account management"),
    (r"\b(sales manager|sales team lead|sales lead|regional sales (manager|director)|area sales manager|country manager|team lead.{0,12}(sales|sdr|bdr))\b", "Sales leadership"),
    (r"\b(head of sales|sales director|director of sales|vp,? sales|vice president,? sales|chief revenue officer|cro)\b", "Sales leadership"),
    (r"\b(sales operations|revenue operations|revops|sales enablement|sales analyst|customer success (manager|executive|associate|specialist|lead)|client success|onboarding (manager|specialist))\b", "Sales ops & CS"),
]
_EXCLUDE = re.compile(r"\b(intern(ship)?|software engineer|data engineer|recruit(er|ing)|talent acquisition|legal|counsel|accountant|accounting|payroll|solutions? engineer|sales engineer|support engineer|customer support|customer success engineer|technical account manager|partner(ship)? marketing|product marketing)\b", re.I)
_INCLUDE_RE = [(re.compile(p, re.I), f) for p, f in _INCLUDE]
LEADER = re.compile(r"\b(head of (sales|business development|growth|revenue|sales development)|sales director|director,? (of )?sales|vp,? (of )?sales|vice president,? sales|chief revenue officer|\bcro\b|country manager|general manager)\b", re.I)


def role_family(title) -> str:
    t = str(title or "")
    if _EXCLUDE.search(t) and not re.search(r"gtm engineer|growth engineer", t, re.I):
        return ""
    for rx, fam in _INCLUDE_RE:
        if rx.search(t):
            return fam
    return ""


# -------------------------------------------------------------- red flags ---
_FLAGS: list[tuple[str, str]] = [
    (r"commission[- ]only|commission based only|no (base|fixed) (salary|pay)|100% commission|unpaid", "Commission-only"),
    (r"\b(rock ?star|ninja|guru|hustler|work hard,? play hard|thick[- ]skinned)\b", "Hype culture words"),
    (r"(bring|own) (your )?(own )?(leads|clients|book of business|network of clients)|existing client base required", "Must bring own leads"),
    (r"uncapped (commission|earnings)(?!.{0,80}(base|fixed|salary))", "Uncapped pay, no base mentioned"),
    (r"\b(\d{2,3}|hundred)\+? (cold )?calls (a|per) day\b|\b\d{3,}\+? dials\b", "Very high call quota"),
    (r"registration fee|training fee|security deposit|pay (a|the) fee", "Asks you to pay a fee"),
    (r"immediate joiners? only", "Immediate joiners only"),
]
_FLAGS_RE = [(re.compile(p, re.I), label) for p, label in _FLAGS]


def red_flags(title, description) -> str:
    text = f"{title or ''}\n{description or ''}"
    return ", ".join(label for rx, label in _FLAGS_RE if rx.search(text))


# --------------------------------------------------------- search terms ---
# Phrases recruiters write in job ads; counted per market to suggest profile keywords ("Get found").
TERMS = [
    "sdr", "bdr", "sales development", "business development", "inside sales", "account executive", "business development executive",
    "business development manager", "sales executive", "key account", "lead generation", "cold calling", "cold email", "outbound", "inbound",
    "pipeline", "quota", "b2b", "saas", "enterprise", "mid-market", "smb", "full sales cycle", "prospecting", "negotiation", "closing",
    "crm", "salesforce", "hubspot", "zoho", "outreach", "salesloft", "apollo", "linkedin sales navigator", "sales navigator", "clay", "gong",
    "zoominfo", "lusha", "excel", "arabic", "english", "hindi", "meddic", "meddpicc", "spin", "challenger", "bant", "account based",
    "abm", "demand generation", "partnerships", "channel", "go-to-market", "gtm", "revops", "fintech", "adtech", "martech", "ecommerce",
    "e-commerce", "it services", "cloud", "cybersecurity", "logistics", "real estate", "uae driving license", "driving license", "mba",
]
_TERM_RE = [(t, re.compile(r"(?<![a-z])" + re.escape(t) + r"(?![a-z])", re.I)) for t in TERMS]


def count_terms(texts: list[str]) -> Counter:
    c: Counter = Counter()
    for text in texts:
        if not text:
            continue
        for term, rx in _TERM_RE:
            if rx.search(text):
                c[term] += 1
    return c


def update_terms(path: Path, jobs: pd.DataFrame) -> None:
    """Adds term counts (per market group) from the descriptions of NEW jobs, and how many ads were read."""
    if "description" not in jobs.columns or not len(jobs):
        return
    try:
        data = json.loads(path.read_text())
    except Exception:
        data = {}
    for group, part in jobs.groupby(jobs["market"].map(market_group)):
        texts = [f"{r.get('title', '')}\n{r.get('description', '')}" for _, r in part.iterrows()
                 if isinstance(r.get("description"), str) and len(r.get("description")) > 80]
        if not texts:
            continue
        g = data.setdefault(group, {"ads": 0, "terms": {}})
        g["ads"] += len(texts)
        for t, n in count_terms(texts).items():
            g["terms"][t] = g["terms"].get(t, 0) + n
    path.write_text(json.dumps(data, indent=1))


def market_group(m) -> str:
    return "India" if str(m) == "India" else "Gulf"


# ---------------------------------------------------------------- history ---
def prepared(hist: pd.DataFrame) -> pd.DataFrame:
    """History with parsed dates, a role family and a market group; old rows without them are tolerated."""
    h = hist.copy()
    for col in ["market", "family", "keyword", "date_posted", "company", "title", "site"]:
        if col not in h.columns:
            h[col] = ""
    h["seen"] = pd.to_datetime(h["first_seen"], errors="coerce")
    h = h[h["seen"].notna()]
    h["family"] = [f if isinstance(f, str) and f else role_family(t) for f, t in zip(h["family"], h["title"])]
    h["market"] = h["market"].fillna("").replace("", "Unknown")
    h["group"] = h["market"].map(lambda m: "Unknown" if m == "Unknown" else market_group(m))
    h["company_key"] = h["company"].fillna("").map(lambda c: re.sub(r"[^a-z0-9]+", " ", c.lower()).strip())
    posted = pd.to_datetime(h["date_posted"], errors="coerce")
    h["fresh"] = (h["seen"].dt.normalize() - posted).dt.days.le(1)
    return h


# ---------------------------------------------------------------- signals ---
def signals(hist: pd.DataFrame, now: datetime | None = None) -> pd.DataFrame:
    """Hidden-job signals per company from the last 30 days of history.

    Hiring surge: 3+ sales roles. New market entry: first role in a market within 14 days, while the company
    was already seen elsewhere before. New sales leader: a head/director/VP sales role. AEs but no SDRs.
    """
    now = now or datetime.now()
    h = prepared(hist)
    h = h[h["company_key"] != ""]
    recent = h[h["seen"] >= now - timedelta(days=30)]
    rows = []
    for key, g in recent.groupby("company_key"):
        name = g["company"].mode().iloc[0]
        sales = g[g["family"] != ""]
        reasons, jobs = [], []
        if len(sales) >= 3:
            reasons.append(f"Hiring surge: {len(sales)} sales roles in 30 days")
            jobs += list(sales["title"].head(5))
        allc = h[h["company_key"] == key]
        for market, mg in g.groupby("market"):
            if market == "Unknown":
                continue
            first_here = allc[allc["market"] == market]["seen"].min()
            first_any = allc["seen"].min()
            if first_here >= now - timedelta(days=14) and first_any < first_here - timedelta(days=7):
                reasons.append(f"New market entry: first role seen in {market}")
                jobs += list(mg["title"].head(2))
        leaders = g[g["title"].fillna("").map(lambda t: bool(LEADER.search(t)))]
        if len(leaders):
            reasons.append("New sales leader role: team build likely in 2–4 months")
            jobs += list(leaders["title"].head(2))
        fams = set(g["family"])
        if "Account Executive" in fams and "SDR/BDR" not in fams and not len(allc[allc["family"] == "SDR/BDR"]):
            reasons.append("Hiring AEs but no SDRs: pitch an SDR role")
            jobs += list(g[g["family"] == "Account Executive"]["title"].head(2))
        if reasons:
            rows.append({"company": name, "signals": " · ".join(reasons), "markets": ", ".join(sorted(set(g["market"]) - {"Unknown"})),
                         "roles": len(sales), "example roles": "; ".join(dict.fromkeys(jobs))[:200],
                         "last seen": g["seen"].max().strftime("%d %b")})
    out = pd.DataFrame(rows)
    return out.sort_values("roles", ascending=False) if len(out) else out


# ------------------------------------------------------------ market view ---
def top_companies(hist: pd.DataFrame, group: str, now: datetime | None = None, n: int = 15) -> pd.DataFrame:
    """Companies with the most sales roles in the last 30 days, with the change vs the 30 days before."""
    now = now or datetime.now()
    h = prepared(hist)
    h = h[(h["group"] == group) & (h["family"] != "") & (h["company_key"] != "")]
    cur = h[h["seen"] >= now - timedelta(days=30)]
    prev = h[(h["seen"] < now - timedelta(days=30)) & (h["seen"] >= now - timedelta(days=60))]
    c1 = cur.groupby("company_key").agg(company=("company", lambda s: s.mode().iloc[0]), roles=("title", "count"),
                                        sdr_bdr=("family", lambda s: (s == "SDR/BDR").sum()),
                                        ae=("family", lambda s: (s == "Account Executive").sum()),
                                        markets=("market", lambda s: ", ".join(sorted(set(s)))))
    c0 = prev.groupby("company_key")["title"].count().rename("prev")
    out = c1.join(c0).fillna({"prev": 0})
    out["vs last month"] = (out["roles"] - out["prev"]).astype(int).map(lambda d: f"+{d}" if d > 0 else str(d))
    return out.sort_values(["roles", "sdr_bdr"], ascending=False).head(n).reset_index(drop=True)[
        ["company", "roles", "sdr_bdr", "ae", "vs last month", "markets"]]


def weekly_by_market(hist: pd.DataFrame, weeks: int = 8) -> pd.DataFrame:
    """Sales roles first seen per week, one column per market."""
    h = prepared(hist)
    h = h[(h["family"] != "") & (h["market"] != "Unknown")]
    h = h[h["seen"] >= datetime.now() - timedelta(weeks=weeks)]
    if not len(h):
        return pd.DataFrame()
    h["week"] = h["seen"].dt.to_period("W-SUN").dt.start_time.dt.strftime("%d %b")
    order = h.drop_duplicates("week").sort_values("seen")["week"]
    return h.pivot_table(index="week", columns="market", values="title", aggfunc="count", fill_value=0).reindex(order)


def family_by_market(hist: pd.DataFrame) -> pd.DataFrame:
    h = prepared(hist)
    h = h[(h["family"] != "") & (h["market"] != "Unknown") & (h["seen"] >= datetime.now() - timedelta(days=30))]
    if not len(h):
        return pd.DataFrame()
    return h.pivot_table(index="family", columns="market", values="title", aggfunc="count", fill_value=0)


def site_quality(hist: pd.DataFrame, outcomes: pd.DataFrame | None = None) -> pd.DataFrame:
    """Per site and market group: jobs, sales roles, share posted within a day of first seen, and (if known) applications/replies."""
    h = prepared(hist)
    h = h[h["seen"] >= datetime.now() - timedelta(days=30)]
    if not len(h):
        return pd.DataFrame()
    g = h.groupby(["site", "group"]).agg(jobs=("title", "count"), sales_roles=("family", lambda s: (s != "").sum()),
                                         fresh_pct=("fresh", lambda s: round(100 * s.mean()) if len(s) else 0))
    g = g.reset_index()
    if outcomes is not None and len(outcomes):
        o = outcomes.copy()
        o["site"] = o["source"].fillna("").str.replace("jobradar:", "", regex=False).replace({"pasted": "you", "careers": "careers page"})
        o["group"] = o["market"].map(lambda m: "India" if "india" in str(m).lower() else "Gulf")
        apps = o.groupby(["site", "group"]).agg(applied=("title", "count"),
                                                replies=("stage", lambda s: s.isin(["screening", "interview", "offer"]).sum()))
        g = g.merge(apps.reset_index(), on=["site", "group"], how="left").fillna({"applied": 0, "replies": 0})
        g[["applied", "replies"]] = g[["applied", "replies"]].astype(int)
    return g.sort_values(["group", "sales_roles"], ascending=[True, False])


# ------------------------------------------------------------ seasonality ---
SEASONS = [
    ("Jan–Mar", "Peak: new budgets open, most sales hiring of the year. Push hardest here."),
    ("Ramadan (about Feb–Mar 2027)", "Gulf hiring slows; interviews stretch. Use it for referrals and prep."),
    ("Apr–Jun", "Steady. India appraisal cycle means more people move, more roles open."),
    ("Jul–Aug", "Gulf summer slowdown (decision-makers travel). India steady."),
    ("Sep–Oct", "Second hiring push before year-end budgets close."),
    ("Oct–Nov (Diwali)", "India hiring slows for festival weeks."),
    ("Dec", "Quiet in most markets; good month to line up referrals for January."),
]


def monthly_volume(hist: pd.DataFrame) -> pd.DataFrame:
    h = prepared(hist)
    h = h[h["family"] != ""]
    if not len(h):
        return pd.DataFrame()
    h["month"] = h["seen"].dt.strftime("%Y-%m")
    return h.pivot_table(index="month", columns="group", values="title", aggfunc="count", fill_value=0)


# --------------------------------------------------------- learning search ---
def what_works(outcomes: pd.DataFrame) -> list[str]:
    """Plain-language lessons from Backchannel outcomes: which sources, markets and role types get replies."""
    if outcomes is None or not len(outcomes):
        return ["No applications in Backchannel yet. Lessons appear after your first few applications."]
    o = outcomes.copy()
    o["replied"] = o["stage"].isin(["screening", "interview", "offer"])
    o["site"] = o["source"].fillna("").str.replace("jobradar:", "", regex=False).replace({"pasted": "added by you", "careers": "company careers pages", "": "company careers pages"})
    o["family"] = o["title"].map(role_family).replace("", "Other")
    o["group"] = o["market"].map(lambda m: "India" if "india" in str(m).lower() else ("Gulf" if str(m) else "Unknown"))
    lessons = [f"{len(o)} applications so far, {int(o['replied'].sum())} got a reply or further."]
    for col, label in [("site", "Source"), ("group", "Market"), ("family", "Role type")]:
        g = o.groupby(col)["replied"].agg(["count", "sum"])
        g = g[g["count"] >= 3]
        if len(g) >= 2:
            g["rate"] = g["sum"] / g["count"]
            best, worst = g["rate"].idxmax(), g["rate"].idxmin()
            if best != worst:
                lessons.append(f"{label}: {best} replies most ({g.loc[best, 'sum']:.0f}/{g.loc[best, 'count']:.0f}); "
                               f"{worst} least ({g.loc[worst, 'sum']:.0f}/{g.loc[worst, 'count']:.0f}).")
    if len(lessons) == 1:
        lessons.append("Not enough applications per source yet (3+ each) to compare. Keep going.")
    return lessons


def tuned_per_site(outcomes: pd.DataFrame, sites: list[str], base: int) -> dict[str, int]:
    """Learning search: give sites that produce replies more results, and sites with 5+ applications and no reply fewer."""
    out = {s: base for s in sites}
    if outcomes is None or not len(outcomes):
        return out
    o = outcomes.copy()
    o["site"] = o["source"].fillna("").str.replace("jobradar:", "", regex=False)
    o["replied"] = o["stage"].isin(["screening", "interview", "offer"])
    for s in sites:
        part = o[o["site"] == s]
        if len(part) >= 3 and part["replied"].any():
            out[s] = min(200, int(base * 1.5))
        elif len(part) >= 5 and not part["replied"].any():
            out[s] = max(10, int(base * 0.6))
    return out


# ------------------------------------------------------------- uniqueness ---
def uniqueness(sightings: pd.DataFrame, days: int = 30) -> pd.DataFrame:
    """Per source: jobs seen, and the share no other source found. Under ~10% unique means the source mostly repeats others."""
    if sightings is None or not len(sightings):
        return pd.DataFrame()
    s = sightings.copy()
    s["seen_at"] = pd.to_datetime(s["seen"], errors="coerce")
    s = s[s["seen_at"] >= datetime.now() - timedelta(days=days)]
    if not len(s):
        return pd.DataFrame()
    n_sites = s.groupby("key")["site"].nunique()
    s["only_here"] = s["key"].map(n_sites).eq(1)
    out = s.groupby("site").agg(jobs=("key", "count"), unique=("only_here", "sum")).reset_index()
    out["unique %"] = (100 * out["unique"] / out["jobs"]).round().astype(int)
    out["verdict"] = out.apply(lambda r: "Too early (<30 jobs)" if r["jobs"] < 30 else ("Keep" if r["unique %"] >= 10 else "Mostly duplicates"), axis=1)
    return out.sort_values("unique %", ascending=False)

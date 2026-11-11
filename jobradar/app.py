"""JobRadar — personal job search for India & the Gulf, powered by JobSpy (MIT).

Runs on your own Mac. Finds jobs on 9 sites, spots hidden-job signals, shows the market, finds who can
refer you, and feeds Backchannel. The daily auto-run is autorun.py.
"""

from __future__ import annotations

import json
from datetime import datetime

import pandas as pd
import streamlit as st

import bc
import core
import insights
import people
from core import MARKETS, POSTED_WITHIN, SHOW_COLS, SITE_LABELS

st.set_page_config(page_title="JobRadar", page_icon="🛰️", layout="wide")
st.title("JobRadar")
st.caption("One search across LinkedIn, Indeed, Naukri, Glassdoor, Bayt, Instahyre, NaukriGulf, Foundit and GulfTalent — "
           "India & Gulf. Runs on your computer.")

saved = core.read_json(core.AUTORUN_FILE)  # the saved daily search also pre-fills the form
settings = core.read_json(core.SETTINGS_FILE)


def save_settings(**kw) -> None:
    settings.update(kw)
    core.SETTINGS_FILE.write_text(json.dumps(settings, indent=1))


# ---------------------------------------------------------------- sidebar ---
with st.sidebar:
    st.header("Search")
    if st.button("Load SDR / BDR / GTM keyword pack", width="stretch",
                 help="5 groups covering SDR, BDR, inside sales, lead generation, business development (India and Gulf titles), GTM and SDR lead roles."):
        st.session_state["kw_text"] = "\n".join(core.KEYWORD_PACK)
    if "kw_text" not in st.session_state:
        st.session_state["kw_text"] = "\n".join(saved.get("keywords", core.KEYWORD_PACK))
    keywords_raw = st.text_area("Job titles / keywords (one group per line; | separates alternatives)", key="kw_text", height=180,
                                help="LinkedIn and Indeed search a whole group at once. Other sites search the first few alternatives of each group.")
    markets = st.multiselect("Markets", list(MARKETS), default=[m for m in saved.get("markets", ["India", "UAE"]) if m in MARKETS])
    cities = {m: st.text_input(f"City in {m} (optional)", saved.get("cities", {}).get(m, ""), placeholder="blank = whole country") for m in markets}
    has_apify = bool(core.load_apify().get("token"))
    has_adzuna = bool(core.read_json(core.ADZUNA_FILE).get("app_key"))
    available = sorted({s for m in markets for s in MARKETS[m]["sites"]}, key=list(SITE_LABELS).index)
    if not has_apify:
        available = [s for s in available if s not in core.PAID_SITES]
    if not has_adzuna:
        available = [s for s in available if s != "adzuna"]
    free_default = [s for s in available if s not in core.PAID_SITES]
    default_sites = [s for s in saved.get("sites", free_default) if s in available] or free_default
    sites = st.multiselect("Sites", available, default=default_sites,
                           format_func=lambda s: f"{SITE_LABELS[s]} (Apify)" if s in core.PAID_SITES else SITE_LABELS[s])
    if not has_apify:
        st.caption("Add an Apify token below to unlock Instahyre, NaukriGulf, Foundit and GulfTalent.")
    elif "instahyre" in sites:
        st.caption("Instahyre doesn't show posting dates, so its jobs ignore 'Posted within'.")
    hours_to_label = {v: k for k, v in POSTED_WITHIN.items()}
    posted = st.selectbox("Posted within", list(POSTED_WITHIN),
                          index=list(POSTED_WITHIN).index(hours_to_label.get(saved.get("posted_hours", 168), "Last 7 days")))
    if POSTED_WITHIN[posted] < 24:
        st.caption("Exact to the hour on LinkedIn and Indeed. Other sites only know the posting day, so they show today's jobs.")
    per_site = st.slider("Results per site, per keyword", 10, 200, int(saved.get("per_site", 30)), step=10)
    remote_only = st.checkbox("Remote only", bool(saved.get("remote_only", False)))
    sales_only = st.checkbox("Keep only sales roles", bool(saved.get("sales_only", True)),
                             help="Drops non-sales jobs that broad keywords pull in (e.g. growth engineers in software teams).")
    full_desc = st.checkbox("Fetch full LinkedIn descriptions (slower)", bool(saved.get("full_desc", False)),
                            help="Needed for red flags and Get found keywords on LinkedIn jobs.")
    st.divider()
    exclude_raw = st.text_input("Hide companies containing (comma-separated)", ", ".join(saved.get("exclude", [])))
    must_have_raw = st.text_input("Title must contain any of (comma-separated, optional)", ", ".join(saved.get("must", [])))
    go = st.button("Search jobs", type="primary", width="stretch")
    st.divider()
    _bc = core.load_bc()
    with st.expander("Backchannel connection", expanded=not _bc):
        bc_url = st.text_input("Backchannel address", _bc.get("url", "https://backchannel-eight.vercel.app"))
        bc_secret = st.text_input("JobRadar key (JOBRADAR_SECRET)", _bc.get("secret", ""), type="password")
        if st.button("Save connection", width="stretch"):
            core.save_bc(bc_url, bc_secret)
            st.success("Saved.")
            st.rerun()
    _adz = core.read_json(core.ADZUNA_FILE)
    with st.expander("Adzuna (free, India)", expanded=False):
        st.caption("Official job-search API; personal job search is an allowed use. Free key in 2 minutes: developer.adzuna.com → "
                   "Register → copy your App ID and App Key.")
        adz_id = st.text_input("App ID", _adz.get("app_id", ""))
        adz_key = st.text_input("App Key", _adz.get("app_key", ""), type="password")
        if st.button("Save Adzuna key", width="stretch"):
            core.ADZUNA_FILE.write_text(json.dumps({"app_id": adz_id.strip(), "app_key": adz_key.strip()}))
            st.success("Saved. Adzuna now appears under Sites for India.")
            st.rerun()
    _ap = core.load_apify()
    with st.expander("Apify (Instahyre, NaukriGulf, Foundit, GulfTalent)", expanded=False):
        st.caption("Paid per result, roughly $1–2.50 per 1,000 jobs. Apify's free plan gives $5 of credit a month. "
                   "Get your token at console.apify.com → Settings → API & Integrations.")
        ap_token = st.text_input("Apify API token", _ap.get("token", ""), type="password")
        ap_max = st.number_input("Max spend per search (USD)", 0.05, 5.0, float(_ap.get("max_usd", 0.5)), step=0.05,
                                 help="Shared across all Apify sites in one search. The daily auto-run uses the same cap.")
        if st.button("Save Apify settings", width="stretch"):
            core.save_apify(ap_token, ap_max)
            st.success("Saved.")
            st.rerun()

params = {
    "keywords": [k.strip() for k in keywords_raw.splitlines() if k.strip()],
    "markets": markets, "cities": cities, "sites": sites, "posted_hours": POSTED_WITHIN[posted],
    "per_site": per_site, "remote_only": remote_only, "full_desc": full_desc, "sales_only": sales_only,
    "exclude": core.split_list(exclude_raw), "must": core.split_list(must_have_raw),
}
_n = core.count_searches(params)
with st.sidebar:
    st.caption(f"This search makes about {_n['total']} site searches ({_n['linkedin']} on LinkedIn).")
    if _n["linkedin"] > 15:
        st.warning("That's a lot of LinkedIn searches; it may block you for a while. Lower 'Results per site' or use fewer groups/markets.")

if go:
    if not params["keywords"] or not markets or not sites:
        st.warning("Add at least one keyword, market and site.")
        st.stop()
    progress = st.progress(0.0, text="Starting…")
    jobs, log, dupes = core.run_search(params, lambda f, t: progress.progress(f, text=t))
    progress.empty()
    st.session_state["log"] = pd.DataFrame(log)
    if jobs is None:
        st.error("No jobs came back. Check the Run log tab — a site may be blocking for a while; try again later or with fewer results.")
        st.session_state.pop("jobs", None)
    else:
        st.session_state["jobs"] = jobs
        st.session_state["run_id"] = st.session_state.get("run_id", 0) + 1
        st.session_state["dupes"] = dupes

# Weekly manual check of Weekday (no feed or API, so you browse it yourself).
_wk_last = settings.get("weekday_checked_at", 0)
if datetime.now().timestamp() - _wk_last > 7 * 86400:
    w1, w2 = st.columns([4, 1])
    w1.info("**Weekly check:** browse [Weekday's sales jobs](https://jobs.weekday.works/) (Indian startups, often with salaries). "
            "Add good ones in Backchannel with 'Add a job you found', and their companies under Sources → Add companies.")
    if w2.button("Done this week", width="stretch"):
        save_settings(weekday_checked_at=datetime.now().timestamp())
        st.rerun()

# Shared data for the tabs.
conns = people.load_connections(core.CONNECTIONS_FILE)
summary, summary_err = bc.summary() if core.load_bc().get("secret") else ({}, "")
history = core.load_history()
LINKS = {
    "job_url": st.column_config.LinkColumn("Link", display_text="Open"),
    "date_posted": st.column_config.DateColumn("Posted"),
    "is_remote": st.column_config.CheckboxColumn("Remote"),
    "people": st.column_config.NumberColumn("You know", help="Your LinkedIn connections at this company (Referrals tab)"),
    "rating": st.column_config.NumberColumn("Rating", help="Employee rating where the site shows one (out of 5)"),
    "flags": st.column_config.TextColumn("Red flags"),
}


def job_table(view: pd.DataFrame, key: str, sendable: bool = True) -> None:
    """Jobs with links, optional 'Send to Backchannel', and downloads."""
    view = view.reset_index(drop=True).copy()
    view["people"] = people.count_people(conns, view["company"]) if len(conns) else 0
    for c in ["rating", "flags"]:
        if c not in view.columns:
            view[c] = None
    cols = [c for c in SHOW_COLS if c in view.columns]
    conn = core.load_bc()
    if sendable and conn.get("url") and conn.get("secret"):
        tick_all = st.checkbox("Tick all shown jobs", value=False, key=f"tick_{key}")
        table = view[cols].copy()
        table.insert(0, "send", tick_all)
        edited = st.data_editor(table, width="stretch", hide_index=True, height=520, disabled=cols,
                                key=f"editor_{key}_{st.session_state.get('run_id', 0)}_{tick_all}",
                                column_config={"send": st.column_config.CheckboxColumn("Send", help="Tick jobs to send to Backchannel"), **LINKS})
        picked = view.loc[edited.index[edited["send"]]] if len(edited) else view.iloc[0:0]
        s1, s2 = st.columns([1, 2])
        add_cos = s2.checkbox("Also add their companies to Backchannel Sources", value=True, key=f"addcos_{key}",
                              help="Backchannel then tracks each company's official careers page every day.")
        if s1.button(f"Send {len(picked)} to Backchannel", type="primary", disabled=not len(picked), width="stretch", key=f"send_{key}"):
            with st.spinner("Sending to Backchannel…"):
                ok, msg, _ = core.send_to_backchannel(conn, picked, add_cos)
            (st.success if ok else st.error)(msg)
    else:
        st.dataframe(view[cols], width="stretch", hide_index=True, height=520, column_config=LINKS)
        if sendable:
            st.caption("Connect Backchannel in the sidebar to send jobs there.")
    export = view[cols + [c for c in ["job_url_direct", "description"] if c in view.columns]]
    d1, d2 = st.columns(2)
    stamp = datetime.now().strftime("%Y%m%d_%H%M")
    d1.download_button("Download Excel", core.to_excel(export), f"jobradar_{key}_{stamp}.xlsx", width="stretch", key=f"xl_{key}")
    d2.download_button("Download CSV", export.to_csv(index=False).encode(), f"jobradar_{key}_{stamp}.csv", width="stretch", key=f"csv_{key}")


HEALTH_FILE = core.DATA_DIR / "health.json"


def health_badge(company: str, health: dict) -> str:
    """Green / amber / red from employee rating (your history) and funding news (checked on request). Flag only."""
    ratings = pd.Series(dtype=float)
    if len(history) and "rating" in history.columns:
        mine = history[history["company"].fillna("").map(lambda c: people.same_company(c, company))]
        ratings = pd.to_numeric(mine["rating"], errors="coerce").dropna()
    rating = round(ratings.mean(), 1) if len(ratings) else None
    funding = (health.get(company) or {}).get("funding") or []
    reasons = []
    if rating is not None:
        reasons.append(f"rating {rating}/5")
    if funding:
        reasons.append(f"funding news: {funding[0]['title'][:70]}")
    if rating is not None and rating < 3.0:
        tone = "🔴"
    elif (rating is not None and rating >= 4.0) or funding:
        tone = "🟢"
    else:
        tone = "🟠"
    return f"{tone} " + ("; ".join(reasons) if reasons else "no rating or funding news yet")


(tab_results, tab_great, tab_signals, tab_ref, tab_market, tab_score, tab_ask, tab_found, tab_side,
 tab_auto, tab_history, tab_log) = st.tabs(["Results", "Great companies", "Signals", "Referrals", "Market view", "Scorecard",
                                             "Ask", "Get found", "Side work", "Daily auto-run", "History", "Run log"])

# ---------------------------------------------------------------- results ---
with tab_results:
    jobs = st.session_state.get("jobs")
    if jobs is None:
        st.info("Set your search on the left and press **Search jobs**.")
    else:
        view = core.apply_filters(jobs, params["exclude"], params["must"])
        c1, c2, c3, c4 = st.columns(4)
        c1.metric("Jobs found", len(view))
        c2.metric("New since last run", int((view["status"] == "NEW").sum()))
        c3.metric("Duplicates removed", st.session_state.get("dupes", 0))
        c4.metric("Companies", view["company"].nunique())
        f1, f2, f3 = st.columns([1, 1, 2])
        only_new = f1.toggle("Only NEW jobs", value=False)
        hide_flagged = f2.toggle("Hide red-flagged", value=False)
        text = f3.text_input("Filter results (title, company or location)", "")
        if only_new:
            view = view[view["status"] == "NEW"]
        if hide_flagged:
            view = view[view["flags"].fillna("") == ""]
        if text:
            t = text.lower()
            view = view[view[["title", "company", "location"]].fillna("").apply(lambda r: t in " ".join(r).lower(), axis=1)]
        job_table(view.sort_values(["status", "date_posted"], ascending=[True, False]), "results")

# -------------------------------------------------------- great companies ---
with tab_great:
    great = bc.great_companies(summary)
    if summary_err:
        st.warning(f"Couldn't refresh from Backchannel: {summary_err}")
    if not great:
        st.info("No great companies yet. Add them in Backchannel (Great companies), then come back. Backchannel must be connected.")
    else:
        health = core.read_json(HEALTH_FILE)
        st.markdown(f"**{len(great)} great companies** from Backchannel. Jobs below are from your current search and your history.")
        g1, g2 = st.columns(2)
        if g1.button("Search great companies by name now", help="LinkedIn, Naukri and Bayt, free. Runs weekly by itself in the daily auto-run."):
            with st.spinner(f"Searching {min(len(great), 15)} companies… this can take a few minutes"):
                gj, glog = core.name_search(great[:15], markets or ["India", "UAE"])
            save_settings(name_search_at=datetime.now().timestamp())
            st.session_state["great_jobs"] = gj
            st.success(f"Found {0 if gj is None else len(gj)} sales roles at your great companies.")
        if g2.button("Check funding news (Backchannel web search)"):
            with st.spinner("Checking funding news…"):
                ok, data = bc.call("POST", "/api/jobradar/company-health", {"companies": great[:10]})
            if ok:
                for r in data.get("results", []):
                    health[r["name"]] = {"funding": r.get("funding", []), "at": datetime.now().isoformat()}
                HEALTH_FILE.write_text(json.dumps(health, indent=1))
                st.rerun()
            else:
                st.error(data)
        st.dataframe(pd.DataFrame([{"company": g, "health": health_badge(g, health),
                                    "why great": next((x.get("why_great", "") for x in summary.get("great_companies", []) if x.get("name") == g), "")}
                                   for g in great]), width="stretch", hide_index=True)
        frames = [f for f in [st.session_state.get("jobs"), st.session_state.get("great_jobs")] if f is not None]
        cur = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
        if len(cur):
            cur = cur[cur["company"].fillna("").map(lambda c: any(people.same_company(c, g) for g in great))].drop_duplicates("job_url")
        if len(cur):
            st.subheader(f"Open roles at great companies ({len(cur)})")
            job_table(cur, "great")
        hist_g = history[history["company"].fillna("").map(lambda c: any(people.same_company(c, g) for g in great))] if len(history) else history
        if len(hist_g):
            with st.expander(f"Seen before at great companies ({len(hist_g)})"):
                st.dataframe(hist_g[["first_seen", "title", "company", "location", "site", "job_url"]].iloc[::-1], width="stretch", hide_index=True,
                             column_config={"job_url": st.column_config.LinkColumn("Link", display_text="Open")})

# ---------------------------------------------------------------- signals ---
with tab_signals:
    st.markdown("Companies showing **hidden-job signals** in the last 30 days of your history. Each one is a reason to "
                "reach out before roles are posted, or to ask for a referral now.")
    sig = insights.signals(history)
    if not len(sig):
        st.info("No signals yet. They appear as JobRadar builds history (a few searches over a couple of weeks).")
    else:
        st.dataframe(sig, width="stretch", hide_index=True)
        pick = st.selectbox("See a company's roles and who to ask", list(sig["company"]))
        if pick:
            roles = history[history["company"].fillna("").map(lambda c: people.same_company(c, pick))].iloc[::-1]
            st.dataframe(roles[["first_seen", "title", "location", "site", "job_url"]].head(20), width="stretch", hide_index=True,
                         column_config={"job_url": st.column_config.LinkColumn("Link", display_text="Open")})
            ppl = people.people_at(conns, pick)
            st.caption(f"You know {len(ppl)} people at {pick}." + (" See the Referrals tab to add a referral ask." if len(ppl) else ""))
            if core.load_bc().get("secret") and st.button(f"Send {pick}'s recent roles to Backchannel"):
                ok, msg, _ = core.send_to_backchannel(core.load_bc(), roles.head(20), True)
                (st.success if ok else st.error)(msg)

# -------------------------------------------------------------- referrals ---
with tab_ref:
    prof = summary.get("profile") or {}
    st.markdown("**Who can refer you.** Your LinkedIn connections at hiring companies, best first (sales people, then seniority, "
                "then how recently you connected), plus one-click LinkedIn searches. You always message people yourself.")
    with st.expander("1. Import your LinkedIn connections" + (f" ({len(conns)} saved)" if len(conns) else ""), expanded=not len(conns)):
        st.markdown("On LinkedIn: **Me → Settings & Privacy → Data privacy → Get a copy of your data → Connections → Request archive**. "
                    "LinkedIn emails a link within about 10 minutes. Unzip it and upload **Connections.csv** here. Refresh monthly.")
        up = st.file_uploader("Connections.csv", type=["csv"])
        if up is not None:
            try:
                df = people.parse_linkedin_export(up.getvalue())
                df.to_csv(core.CONNECTIONS_FILE, index=False)
                st.success(f"Saved {len(df)} connections on your Mac (your current employer's people are left out).")
                conns = people.load_connections(core.CONNECTIONS_FILE)
            except Exception as e:
                st.error(str(e))
    with st.expander("2. Your past employers and college (for search links)", expanded=not settings.get("past_employers")):
        past_raw = st.text_input("Past employers (comma-separated)", ", ".join(settings.get("past_employers") or prof.get("past_employers") or []))
        college = st.text_input("College / university", settings.get("college") or prof.get("college") or "")
        if st.button("Save, and copy connections to Backchannel"):
            save_settings(past_employers=core.split_list(past_raw), college=college.strip())
            payload = {"past_employers": core.split_list(past_raw), "college": college.strip()}
            if len(conns):
                payload["connections"] = conns.drop(columns=["company_key"], errors="ignore").to_dict("records")
            ok, data = bc.call("POST", "/api/jobradar/connections", payload, timeout=180)
            (st.success if ok else st.error)(f"Saved in Backchannel: {data.get('saved', 0)} connections, so role pages show who you know."
                                              if ok else data)
    past = settings.get("past_employers") or prof.get("past_employers") or []
    coll = settings.get("college") or prof.get("college") or ""

    st.subheader("3. Pick a job")
    pool = [f for f in [st.session_state.get("jobs"), st.session_state.get("great_jobs")] if f is not None]
    pool = pd.concat(pool, ignore_index=True).drop_duplicates("job_url") if pool else history.iloc[::-1].head(300)
    if not len(pool):
        st.info("Run a search first.")
    else:
        pool = pool.copy()
        pool["people"] = people.count_people(conns, pool["company"]) if len(conns) else 0
        pool = pool.sort_values("people", ascending=False)
        labels = [f"{r.title} · {r.company} · {r.location}" + (f"  ({r.people} you know)" if r.people else "") for r in pool.itertuples()]
        idx = st.selectbox("Job", range(len(pool)), format_func=lambda i: labels[i])
        job = pool.iloc[idx]
        ppl = people.people_at(conns, job["company"])
        left, right = st.columns(2)
        with left:
            st.markdown(f"**People you know at {job['company']}**")
            if people.excluded(job["company"]):
                st.caption("Hidden: this is your current employer.")
            elif not len(ppl):
                st.caption("None of your connections work here." if len(conns) else "Import your connections first.")
            for i, r in enumerate(ppl.itertuples()):
                a, b = st.columns([3, 2])
                a.markdown(f"[{r.full_name}]({r.linkedin_url})  \n{r.position}" if r.linkedin_url else f"**{r.full_name}**  \n{r.position}")
                if b.button("Add referral ask", key=f"ref_{idx}_{i}"):
                    ok, data = bc.call("POST", "/api/jobradar/referral", {"company": job["company"], "role_title": job["title"],
                                                                         "referrer_name": r.full_name, "job_url": job.get("job_url", ""),
                                                                         "referrer_relation": f"LinkedIn connection, {r.position}" if r.position else "LinkedIn connection"})
                    (b.success if ok else b.error)("Added: Backchannel → Referrals drafts the ask" if ok else data)
        with right:
            st.markdown("**Searches to find more** (opens LinkedIn; tip: switch to private viewing first)")
            for label, url in people.search_links(job["company"], job["title"], past, coll):
                st.markdown(f"- [{label}]({url})")
            if not past:
                st.caption("Add past employers above for ex-colleague searches.")

# ------------------------------------------------------------ market view ---
with tab_market:
    if not len(history):
        st.info("Market view builds from your search history. Run a few searches first.")
    else:
        st.subheader("Which companies to target")
        st.caption("Companies with the most sales roles first seen in the last 30 days, and the change vs the 30 days before.")
        m1, m2 = st.columns(2)
        with m1:
            st.markdown("**India**")
            st.dataframe(insights.top_companies(history, "India"), width="stretch", hide_index=True)
        with m2:
            st.markdown("**Gulf**")
            st.dataframe(insights.top_companies(history, "Gulf"), width="stretch", hide_index=True)
        st.subheader("India vs Gulf")
        wk = insights.weekly_by_market(history)
        if len(wk):
            st.caption("Sales roles first seen per week, by country.")
            st.line_chart(wk)
        fam = insights.family_by_market(history)
        if len(fam):
            st.caption("Role types by country, last 30 days.")
            st.dataframe(fam, width="stretch")
        st.subheader("Where to search")
        sq = insights.site_quality(history, bc.outcomes_df(summary))
        if len(sq):
            st.caption("Per site, last 30 days: jobs, sales roles, % posted within a day of being found (freshness), "
                       "and your Backchannel applications and replies from that source.")
            st.dataframe(sq, width="stretch", hide_index=True, column_config={"fresh_pct": st.column_config.NumberColumn("Fresh %")})
        st.subheader("Source uniqueness")
        uq = insights.uniqueness(core.load_sightings())
        if len(uq):
            st.caption("Last 30 days: what share of each source's jobs no other source found. Sources on trial (Adzuna, Working Nomads) "
                       "earn their place here: under 10% unique after 30+ jobs means they mostly repeat others.")
            uq["site"] = uq["site"].map(lambda x: SITE_LABELS.get(x, x))
            st.dataframe(uq, width="stretch", hide_index=True)
        else:
            st.caption("Appears after your next searches (this tracking starts with this version).")
        st.subheader("Timing")
        st.dataframe(pd.DataFrame(insights.SEASONS, columns=["When", "What to expect"]), width="stretch", hide_index=True)
        mv = insights.monthly_volume(history)
        if len(mv) > 1:
            st.caption("Sales roles found per month in your own history.")
            st.bar_chart(mv)

# -------------------------------------------------------------- scorecard ---
with tab_score:
    if not core.load_bc().get("secret"):
        st.info("Connect Backchannel in the sidebar: the scorecard comes from your Backchannel activity.")
    else:
        if summary_err:
            st.warning(f"Showing the last saved copy. Couldn't refresh: {summary_err}")
        if st.button("Refresh from Backchannel"):
            summary, summary_err = bc.summary(force=True)
            st.rerun()
        sc = pd.DataFrame(summary.get("scorecard") or [])
        if len(sc):
            this, last = sc.iloc[0], sc.iloc[1] if len(sc) > 1 else sc.iloc[0]
            k1, k2, k3, k4 = st.columns(4)
            k1.metric("Applications sent (north star)", int(this["applied"]), int(this["applied"] - last["applied"]))
            k2.metric("Referrals asked", int(this["referrals_asked"]), int(this["referrals_asked"] - last["referrals_asked"]))
            k3.metric("Replies", int(this["reply"]), int(this["reply"] - last["reply"]))
            k4.metric("Interviews", int(this["interview"]), int(this["interview"] - last["interview"]))
            chart = sc.set_index("week")[["applied", "referrals_asked", "reply", "interview"]].iloc[::-1]
            st.caption("Last 8 weeks (week starting Monday).")
            st.line_chart(chart)
        st.subheader("What's working")
        outcomes = bc.outcomes_df(summary)
        for line in insights.what_works(outcomes):
            st.markdown(f"- {line}")
        learning = st.toggle("Learning search: give sources that bring replies more results in the daily run, and cut ones that never do",
                             value=settings.get("learning", True))
        if learning != settings.get("learning", True):
            save_settings(learning=learning)
        st.subheader("Companies that replied: find lookalikes")
        replied = outcomes[outcomes["stage"].isin(["screening", "interview", "offer"])]["company"].dropna().unique() if len(outcomes) else []
        if not len(replied):
            st.caption("When a company replies or interviews you, find 10 similar companies here.")
        else:
            lk = st.selectbox("Company", list(replied))
            add = st.checkbox("Add the ones with a public job board to Backchannel Sources", value=True)
            if st.button("Find 10 similar companies"):
                with st.spinner("Asking Backchannel's AI and checking job boards…"):
                    ok, data = bc.call("POST", "/api/jobradar/lookalikes", {"company": lk, "add": add}, timeout=150)
                if ok:
                    st.dataframe(pd.DataFrame(data.get("companies", [])), width="stretch", hide_index=True)
                    st.caption("AI suggestions: check each company yourself. 'board' means Backchannel can read its jobs directly.")
                else:
                    st.error(data)
        st.subheader("Network keeper")
        helpers = pd.DataFrame(summary.get("helpers") or [])
        if not len(helpers):
            st.caption("People who agree to refer you appear here, so you keep in touch after the search.")
        else:
            helpers["days since"] = (pd.Timestamp.now(tz="UTC") - pd.to_datetime(helpers["last_touch"], utc=True)).dt.days
            helpers["check in?"] = helpers["days since"].map(lambda d: "Yes, say thanks / share news" if d >= 60 else "")
            st.dataframe(helpers.sort_values("days since", ascending=False), width="stretch", hide_index=True)

# -------------------------------------------------------------------- ask ---
with tab_ask:
    st.markdown("Ask about your job market, answered from JobRadar's history (sent to Backchannel's AI, a few cents per question). "
                "Examples: *Which Gulf companies posted the most AE roles this month?* · *Which sites found jobs that LinkedIn missed?*")
    if "chat" not in st.session_state:
        st.session_state["chat"] = []
    for role, text in st.session_state["chat"]:
        st.chat_message(role).markdown(text)
    q = st.chat_input("Ask about companies, markets, sites…")
    if q:
        st.session_state["chat"].append(("user", q))
        st.chat_message("user").markdown(q)
        parts = [f"TODAY: {datetime.now():%Y-%m-%d}"]
        for name, df in [("TOP COMPANIES INDIA (30d)", insights.top_companies(history, "India", n=25)),
                         ("TOP COMPANIES GULF (30d)", insights.top_companies(history, "Gulf", n=25)),
                         ("WEEKLY SALES ROLES BY MARKET", insights.weekly_by_market(history)),
                         ("ROLE TYPES BY MARKET (30d)", insights.family_by_market(history)),
                         ("SITES (30d)", insights.site_quality(history, bc.outcomes_df(summary))),
                         ("SIGNALS", insights.signals(history))]:
            if len(df):
                parts.append(f"{name}:\n{df.to_csv()}")
        if len(history):
            cols = [c for c in ["first_seen", "title", "company", "location", "market", "site", "family"] if c in history.columns]
            parts.append("RECENT JOBS (newest 300):\n" + history[cols].iloc[::-1].head(300).to_csv(index=False))
        with st.spinner("Thinking…"):
            ok, data = bc.call("POST", "/api/jobradar/ask", {"question": q, "context": "\n\n".join(parts)[:40000]}, timeout=90)
        answer = data.get("answer", "") if ok else f"⚠️ {data}"
        st.session_state["chat"].append(("assistant", answer))
        st.chat_message("assistant").markdown(answer)

# -------------------------------------------------------------- get found ---
with tab_found:
    terms = core.read_json(core.TERMS_FILE)
    st.subheader("What recruiters search for")
    st.caption("How often each phrase appears in the job ads JobRadar has read (descriptions of new jobs). "
               "Tick 'Fetch full LinkedIn descriptions' to read more ads.")
    headline = st.text_area("Your current LinkedIn / Naukri headline", settings.get("headline", ""), height=70)
    if headline != settings.get("headline", ""):
        save_settings(headline=headline)
    t1, t2 = st.columns(2)
    for col, group in [(t1, "India"), (t2, "Gulf")]:
        with col:
            g = terms.get(group) or {}
            st.markdown(f"**{group}** · {g.get('ads', 0)} ads read")
            if g.get("terms"):
                df = pd.DataFrame(sorted(g["terms"].items(), key=lambda x: -x[1])[:25], columns=["phrase", "ads"])
                df["% of ads"] = (100 * df["ads"] / max(1, g["ads"])).round().astype(int)
                df["in your headline"] = df["phrase"].map(lambda p: "✓" if p.lower() in headline.lower() else "")
                st.dataframe(df, width="stretch", hide_index=True)
    if st.button("Suggest headlines (Backchannel AI, uses only your real facts)"):
        prof = summary.get("profile") or {}
        ctx = json.dumps({"profile": {k: prof.get(k) for k in ["current_role", "tools", "target_titles", "markets"]}, "current_headline": headline,
                          "top_terms": {grp: sorted((terms.get(grp) or {}).get("terms", {}).items(), key=lambda x: -x[1])[:25] for grp in ["India", "Gulf"]}})
        with st.spinner("Writing…"):
            ok, data = bc.call("POST", "/api/jobradar/ask", {"question": "Suggest headlines.", "context": ctx, "task": "headline"}, timeout=90)
        st.markdown(data.get("answer", "") if ok else f"⚠️ {data}")
    st.subheader("Gulf job-site profiles")
    st.caption("Gulf recruiters search candidates directly in these sites' CV databases. Keep each one complete and fresh.")
    checks = settings.get("gulf_checklist", {})
    items = ["Bayt profile complete (photo, summary, skills, CV uploaded)", "GulfTalent profile complete and CV uploaded",
             "NaukriGulf profile complete and CV uploaded", "Each profile's job titles use Gulf terms (Business Development Executive, Sales Executive)",
             "Preferred locations set (UAE, Saudi Arabia… whichever you'd accept)", "Profiles refreshed this week (a small edit moves you up searches)",
             "LinkedIn 'Open to work' set to recruiters only (stealth-safe)"]
    changed = False
    for it in items:
        v = st.checkbox(it, value=checks.get(it, False), key=f"chk_{it}")
        if v != checks.get(it, False):
            checks[it] = v
            changed = True
    if changed:
        save_settings(gulf_checklist=checks)
    st.subheader("Gulf-style CV")
    st.caption("Your Backchannel CV rewritten the way Gulf recruiters expect. It adds blanks for photo, nationality, visa status and "
               "availability for you to fill; it never invents facts.")
    if st.button("Make my Gulf CV"):
        with st.spinner("Writing (about 30 seconds)…"):
            ok, data = bc.call("POST", "/api/jobradar/gulf-cv", {}, timeout=120)
        if ok:
            st.session_state["gulf_cv"] = data.get("markdown", "")
        else:
            st.error(data)
    if st.session_state.get("gulf_cv"):
        st.markdown(st.session_state["gulf_cv"])
        st.download_button("Download (Markdown, opens in Word/Google Docs)", st.session_state["gulf_cv"].encode(), "gulf_cv.md")

# -------------------------------------------------------------- side work ---
with tab_side:
    st.warning("Before taking side work: check your employment contract for outside-work and conflict-of-interest clauses, "
               "and never use your employer's tools or data.")
    side_kw = st.text_area("Searches (one per line)", "\n".join(settings.get("side_keywords", [
        "contract SDR", "freelance lead generation", "appointment setter", "fractional BDR", "AI training sales expert"])), height=110)
    side_m = st.multiselect("Markets", list(MARKETS), default=markets or ["India"], key="side_markets")
    side_remote = st.checkbox("Remote only", value=True, key="side_remote")
    if st.button("Find side work"):
        save_settings(side_keywords=core.split_list(side_kw, "\n"))
        with st.spinner("Searching LinkedIn and Indeed…"):
            sj, _, _ = core.run_search({"keywords": core.split_list(side_kw, "\n"), "markets": side_m, "cities": {}, "sites": ["linkedin", "indeed"],
                                        "posted_hours": 336, "per_site": 20, "remote_only": side_remote,
                                        "sales_only": False})
        st.session_state["side_jobs"] = sj
    if st.session_state.get("side_jobs") is not None:
        job_table(st.session_state["side_jobs"], "side", sendable=False)

# --------------------------------------------------------------- auto-run ---
with tab_auto:
    st.markdown("Every morning at **8:00** your Mac runs your saved search and sends only **NEW** jobs to Backchannel. "
                "Once a week it also searches your great companies by name. If the Mac is asleep at 8:00, it runs when it wakes.")
    if not saved.get("enabled"):
        st.info("No daily search saved yet. Set up your search in the sidebar, then save it here.")
    else:
        st.success(f"On: {', '.join(saved['keywords'])} · {', '.join(saved['markets'])} · "
                   f"{', '.join(SITE_LABELS[s] for s in saved['sites'])} · posted within {saved['posted_hours']}h")
    add_cos_auto = st.checkbox("Also add new companies to Backchannel Sources", value=bool(saved.get("add_companies", True)))
    a1, a2 = st.columns(2)
    if a1.button("Save sidebar search as my daily search", type="primary", width="stretch"):
        if not params["keywords"] or not markets or not sites:
            st.warning("Add at least one keyword, market and site first.")
        else:
            core.AUTORUN_FILE.write_text(json.dumps({**params, "add_companies": add_cos_auto, "enabled": True}, indent=1))
            st.rerun()
    if saved.get("enabled") and a2.button("Turn daily auto-run off", width="stretch"):
        core.AUTORUN_FILE.write_text(json.dumps({**saved, "enabled": False}, indent=1))
        st.rerun()
    if not core.load_bc():
        st.warning("Connect Backchannel in the sidebar, otherwise the daily run can't send anything.")
    if settings.get("name_search_at"):
        st.caption(f"Last great-company name search: {datetime.fromtimestamp(settings['name_search_at']):%d %b %H:%M}.")
    runs = core.read_json(core.AUTORUN_LOG).get("runs", [])
    st.subheader("Recent daily runs")
    if runs:
        st.dataframe(pd.DataFrame(runs)[["at", "found", "new", "sent", "message"]], width="stretch", hide_index=True)
    else:
        st.caption("Nothing yet. The first run happens at the next 8:00.")

# ---------------------------------------------------------------- history ---
with tab_history:
    st.caption(f"Every job JobRadar has shown you ({len(history)}). Saved in data/jobs_history.csv next to the app.")
    if len(history):
        st.dataframe(history.drop(columns=["dedupe_key"], errors="ignore").iloc[::-1], width="stretch", hide_index=True,
                     column_config={"job_url": st.column_config.LinkColumn("Link", display_text="Open")})
        if st.button("Clear history"):
            core.HISTORY_FILE.unlink(missing_ok=True)
            st.rerun()

with tab_log:
    log = st.session_state.get("log")
    if log is None:
        st.caption("Shows how many jobs each site returned on the last run, and any errors.")
    else:
        st.dataframe(log, width="stretch", hide_index=True)
        st.caption("0 jobs with a note usually means the site rate-limited you. Wait a bit, lower 'Results per site', and retry.")

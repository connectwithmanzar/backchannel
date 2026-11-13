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


def fake_scrape(site_name, search_term=None, location=None, results_wanted=15, **kw):
    site = site_name[0]
    search_term = search_term or kw.get("google_search_term", "")   # Google Jobs sends its own search sentence
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


# --- More sources: Google Jobs and the public remote feeds, with canned replies (no network) ---
import free_sites  # noqa: E402


class FakeRes:
    def __init__(self, payload=None, content=b""):
        self._p, self.content = payload, content

    def json(self):
        return self._p


NOW = pd.Timestamp.now(tz="UTC")
RSS = f"""<?xml version="1.0"?><rss><channel>
<item><title>Acme: Sales Development Representative</title><region>Anywhere in the World</region><link>https://weworkremotely.com/jobs/1</link><pubDate>{NOW.strftime('%a, %d %b %Y %H:%M:%S +0000')}</pubDate><description>&lt;p&gt;Outbound&lt;/p&gt;</description></item>
<item><title>Globex: Account Executive</title><region>USA Only</region><link>https://weworkremotely.com/jobs/2</link><pubDate>{NOW.strftime('%a, %d %b %Y %H:%M:%S +0000')}</pubDate><description>x</description></item>
</channel></rss>""".encode()


def fake_get(url, **params):
    if "remoteok" in url:
        return FakeRes([{"legal": "link back to RemoteOK"},
                        {"position": "Business Development Representative", "company": "Initech", "location": "Worldwide", "url": "https://remoteok.com/remote-jobs/1", "date": NOW.isoformat(), "description": "<b>Pipeline</b>"},
                        {"position": "Software Engineer", "company": "Initech", "location": "Worldwide", "url": "https://remoteok.com/remote-jobs/2", "date": NOW.isoformat()},
                        {"position": "Account Executive", "company": "Hooli", "location": "US only", "url": "https://remoteok.com/remote-jobs/3", "date": NOW.isoformat()}])
    if "weworkremotely" in url:
        return FakeRes(content=RSS)
    if "himalayas" in url:
        return FakeRes({"jobs": [] if params.get("offset") or params.get("q") != "sales development representative" or params.get("country") != "India" else [
            {"title": "Sales Development Representative", "companyName": "Umbrella", "locationRestrictions": ["India", "Singapore"], "applicationLink": "https://himalayas.app/jobs/1", "pubDate": int(NOW.timestamp()), "description": "SDR"},
            {"title": "Software Engineer", "companyName": "Umbrella", "locationRestrictions": ["India"], "applicationLink": "https://himalayas.app/jobs/2", "pubDate": int(NOW.timestamp())}]})
    if "remotive" in url:
        return FakeRes({"jobs": [
            {"title": "Inside Sales Representative", "company_name": "Wonka", "candidate_required_location": "Worldwide", "url": "https://remotive.com/remote-jobs/1", "publication_date": NOW.isoformat(), "description": "Inbound"},
            {"title": "Inside Sales Representative", "company_name": "Wonka", "candidate_required_location": "USA Only", "url": "https://remotive.com/remote-jobs/2", "publication_date": NOW.isoformat()}]})
    raise AssertionError(f"unexpected request: {url}")


free_sites._get = fake_get
group = core.KEYWORD_PACK[0]
for fn, site, expect in [("remoteok", "remoteok", 1), ("weworkremotely", "weworkremotely", 1), ("himalayas", "himalayas", 1), ("remotive", "remotive", 1)]:
    df, note = getattr(free_sites, fn)(group, 168)
    check(len(df) == expect and not note, f"{site}: keeps the sales role open to India, drops US-only and non-sales")
    check(len(df) == 0 or (df["site"] == site).all() and df["job_url"].str.startswith("https://").all(), f"{site}: rows are in the shape JobRadar expects")
free_sites._feed_cache.clear()

check("India" in core.google_term("Sales Development Representative", "India", 168) and "last week" in core.google_term("SDR", "India", 168), "Google Jobs search sentence")
check(core.google_term("SDR", "India", 24).endswith("since yesterday"), "Google Jobs search sentence for the last day")
core.MARKETS["India"]["sites"].append("google")   # off by default, so the test switches it on
pj = dict(keywords=core.KEYWORD_PACK[:2], markets=["India"], cities={}, sites=["google", "remoteok", "weworkremotely", "himalayas", "remotive"], posted_hours=168, per_site=30)
CALLS.clear()
jobs3, log3, _ = core.run_search(pj)
check(sum(1 for s, _ in CALLS if s == "google") == 2, "Google Jobs searches one title per group")
check(core.count_searches(pj) == {"total": 10, "linkedin": 0}, "search counter counts one search per group for each new source")
check(jobs3 is not None and set(jobs3["site"]) >= {"remoteok", "weworkremotely", "himalayas", "remotive"}, "remote feeds flow through a full search")
core.MARKETS["India"]["sites"].remove("google")
check("google" not in core.MARKETS["India"]["sites"] and "google" not in core.MARKETS["UAE"]["sites"], "Google Jobs stays off in the daily search until it works again")


# --- Weekly great-company search must survive a company that matches nothing (it crashed the 12 Nov 8:00 run) ---
try:
    nothing, nlog = core.name_search(["Zzz Nonexistent Corp"], ["India"])
    check(nothing is None and len(nlog) > 0, "great-company search copes with a company that matches no jobs")
except Exception as e:  # noqa: BLE001
    check(False, f"great-company search copes with a company that matches no jobs ({e!r})")
found, _ = core.name_search(["Careem"], ["India", "UAE"])
check(found is not None and len(found) > 0, "great-company search still finds a matching company's sales roles")


# --- Auto-apply runner: pure decisions only (no browser, no network) ---
import apply_runner as ar  # noqa: E402

check(ar.detect_ats("https://boards.greenhouse.io/acme/jobs/123") == "greenhouse", "ats: greenhouse board URL")
check(ar.detect_ats("https://job-boards.greenhouse.io/acme/jobs/123") == "greenhouse", "ats: new greenhouse board URL")
check(ar.detect_ats("https://jobs.lever.co/acme/abc-123") == "lever", "ats: lever")
check(ar.detect_ats("https://jobs.ashbyhq.com/acme/abc") == "ashby", "ats: ashby")
check(ar.detect_ats("https://apply.workable.com/acme/j/ABC/") == "workable", "ats: workable")
check(ar.detect_ats("https://acme.recruitee.com/o/sdr") == "recruitee", "ats: recruitee")
check(ar.detect_ats("https://careers.smartrecruiters.com/Acme/123") == "smartrecruiters", "ats: smartrecruiters")
check(ar.detect_ats("https://acme.com/careers/sdr?gh_jid=555") == "greenhouse", "ats: greenhouse via gh_jid on a company page")
check(ar.detect_ats("https://acme.com/careers/sdr", frame_urls=["https://boards.greenhouse.io/embed/job_app?for=acme&token=1"]) == "greenhouse", "ats: greenhouse via embedded frame")
check(ar.detect_ats("https://acme.com/careers/sdr", html="<a href='https://jobs.lever.co/acme/1'>") == "lever", "ats: lever link on a company page")
check(ar.detect_ats("https://acme.com/careers/sdr") is None, "ats: unknown site is None")
check(ar.apply_url_for("https://jobs.lever.co/acme/abc", "lever") == "https://jobs.lever.co/acme/abc/apply", "lever form lives at /apply")
check(ar.apply_url_for("https://jobs.ashbyhq.com/acme/abc", "ashby") == "https://jobs.ashbyhq.com/acme/abc/application", "ashby form lives at /application")

check("LinkedIn" in (ar.unsupported_reason("https://www.linkedin.com/jobs/view/1") or ""), "never touches LinkedIn")
check(ar.unsupported_reason("https://in.indeed.com/viewjob?jk=1") is not None, "never touches Indeed")
check(ar.unsupported_reason("https://www.naukri.com/job-listings-x") is not None, "never touches Naukri")
check(ar.unsupported_reason("https://www.glassdoor.co.in/job-listing/x") is not None, "never touches Glassdoor")
check("Workday" in (ar.unsupported_reason("https://acme.wd5.myworkdayjobs.com/en-US/x/job/1") or ""), "Workday needs an account: stops")
check(ar.unsupported_reason("https://jobs.lever.co/acme/1") is None, "lever is allowed")

for label, want in [
    ("First Name *", "first_name"), ("Last name", "last_name"), ("Full name", "full_name"), ("Name *", "full_name"),
    ("Email *", "email"), ("E-mail address", "email"), ("Phone number *", "phone"), ("Mobile", "phone"),
    ("LinkedIn Profile", "linkedin"), ("LinkedIn URL", "linkedin"), ("Website / Portfolio", "website"),
    ("Resume/CV *", "resume"), ("Cover letter", "cover_letter"), ("Current location", "location"), ("Location (City)", "location"),
    ("Current company", "current_company"),
]:
    check(ar.map_label(label) == want, f"label '{label}' -> {want} (got {ar.map_label(label)})")
for label in ["How did you hear about us?", "Why do you want to work here?", "Are you legally authorized to work in the US?",
              "Will you require visa sponsorship?", "Expected salary", "Notice period", "Are you willing to relocate?", "Gender", "Company name", "GitHub"]:
    check(ar.map_label(label) is None, f"label '{label}' is never filled from the profile")

qs = [{"q": "Are you legally authorized to work in India?", "answer": "Yes", "sensitive": True},
      {"q": "Why this company?", "answer": "Because of X", "sensitive": False},
      {"q": "What is your notice period?", "answer": "30 days", "sensitive": True}]
check((ar.match_question("Are you authorized to work in India? *", qs) or {}).get("answer") == "Yes", "question match: same question, different wording")
check((ar.match_question("Notice period (days)", qs) or {}).get("answer") == "30 days", "question match: notice period")
check(ar.match_question("Do you require visa sponsorship?", qs) is None, "question match: unrelated question is not matched")
check(ar.match_question("How did you hear about us?", qs) is None, "question match: nothing for 'how did you hear'")

check(ar.best_option("Yes", ["Yes", "No"]) == "Yes", "option: exact")
check(ar.best_option("No", ["Yes, I need sponsorship", "No, I do not need sponsorship"]) == "No, I do not need sponsorship", "option: no -> 'No, ...'")
check(ar.best_option("30 days", ["Immediately", "30 days", "60 days"]) == "30 days", "option: contains")
check(ar.best_option("Purple", ["Yes", "No"]) is None, "option: never guesses between unrelated options")
check(ar.pick_decline(["Male", "Female", "Decline to self-identify"]) == "Decline to self-identify", "diversity: picks decline")
check(ar.pick_decline(["Male", "Female"]) is None, "diversity: no decline option -> None")
check(ar.is_diversity("Gender identity") and ar.is_diversity("Are you a protected veteran?") and not ar.is_diversity("Why us?"), "diversity labels recognised")
check(ar.is_sensitive("Will you now or in the future require visa sponsorship?") and ar.is_sensitive("Salary expectations") and not ar.is_sensitive("Tell us about yourself"), "sensitive labels recognised")
check(ar.is_consent("I have read the privacy policy") and not ar.is_consent("I have 5 years of SaaS sales experience"), "consent boxes recognised")

ok1, why1 = ar.success_signal("https://x.com/apply", "https://x.com/apply", "Thank you for applying! We have received your application.")
check(ok1 and "page says" in why1, "success: confirmation words on the page")
ok2, _ = ar.success_signal("https://x.com/apply", "https://x.com/apply/confirmation", "")
check(ok2, "success: thank-you style URL")
ok3, _ = ar.success_signal("https://x.com/apply", "https://x.com/apply", "Please fill in all required fields")
check(not ok3, "success: a form with errors is not success")
ok4, _ = ar.success_signal("https://x.com/apply", "https://x.com/other", "Submit your application")
check(not ok4, "success: a different page without confirmation is not success")
check(ar.challenge_text("Please verify you are human") and not ar.challenge_text("Thanks for applying"), "captcha wording recognised")
html = ar.cv_html("JANE\n\nEXPERIENCE\n- Booked <meetings> & more\nPlain line")
check("<li>Booked &lt;meetings&gt; &amp; more</li>" in html and "<h2>" in html, "CV text becomes a clean escaped page for the PDF")

check("not a bot" in (ar.forbids_automation("we ask you to prove that you are not a bot auto-applying to the role") or ""), "employer says no bots: detected and respected")
check(ar.forbids_automation("AI tools are not permitted during the interview") is not None, "employer says AI tools not permitted: detected")
check(ar.forbids_automation("Tell us about your sales experience and your quota attainment") is None, "an ordinary form is not flagged as anti-bot")
check(ar.clean_label("Email* Email") == "Email*" and ar.clean_label("Phone number *") == "Phone number *", "doubled form labels are collapsed")

print(f"\n{'All checks passed' if not failures else f'{len(failures)} check(s) failed'}.")
sys.exit(1 if failures else 0)

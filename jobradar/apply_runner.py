"""JobRadar auto-apply runner: fills in application forms on your Mac using a real browser.

Backchannel prepares each application (tailored CV, cover note, saved answers) and queues the ones you approved.
This runner opens each job's own application form, fills it in, and either stops before Submit (dry run) or submits (submit mode).

Rules it never breaks:
- It only uses facts Backchannel gives it. Visa, work authorisation, salary, notice period, relocation and diversity answers
  come only from the answers you saved; if there isn't one, it stops and tells you ("needs you").
- It never solves or bypasses a CAPTCHA, never creates accounts or logs in, and never touches LinkedIn, Indeed, Naukri or Glassdoor.
- It never says "submitted" without seeing a confirmation on the page.

Usage:
    python apply_runner.py                         process the queue from Backchannel
    python apply_runner.py --max 5                 at most 5 applications this run
    python apply_runner.py --headless              no visible browser window
    python apply_runner.py --url URL --dry-run     fill ONE public form with a FAKE profile (testing only; never submits)
"""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import random
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

APP_DIR = Path(__file__).resolve().parent
DATA_DIR = APP_DIR / "data"
SHOT_DIR = DATA_DIR / "apply_shots"
BROWSER_DIR = DATA_DIR / "browser"
LOCK_FILE = DATA_DIR / "apply.lock"
LOG_FILE = DATA_DIR / "apply_log.json"

ITEM_TIMEOUT_S = 240          # one application gets four minutes at most
PAUSE_RANGE_S = (20, 60)      # polite pause between applications
CALL_TIMEOUT_MS = 15_000

FAKE_PROFILE = {
    "full_name": "Jane Testwell", "first_name": "Jane", "last_name": "Testwell", "email": "jane.testwell@example.com",
    "phone": "+64 21 555 0100", "location": "Wellington, New Zealand", "linkedin_url": "https://www.linkedin.com/in/jane-testwell-example",
    "website": "https://example.com/jane",
    "cv_text": "JANE TESTWELL\nWellington, New Zealand\n\nSUMMARY\n- Test profile used only for dry runs.\n\nEXPERIENCE\nSales Development Representative, Example Co\n- Booked meetings with B2B software buyers.\n- Test data only.\n",
}


class Blocked(Exception):
    """The application needs the owner. The message is a plain-English reason."""


# ----------------------------------------------------------------------------------------------------------------------
# Pure helpers (no browser, no network). These are covered by tests/smoke_test.py.
# ----------------------------------------------------------------------------------------------------------------------

def normalize(text: str) -> str:
    t = (text or "").lower().replace("&", " and ")
    t = re.sub(r"\((required|optional)\)|\brequired\b|\boptional\b", " ", t)
    t = re.sub(r"[^a-z0-9+#@. ]+", " ", t)
    t = t.replace(".", " ")
    return re.sub(r"\s+", " ", t).strip()


_STOP = {"a", "an", "the", "of", "to", "do", "you", "your", "are", "is", "in", "for", "and", "or", "with", "please", "have", "has", "be", "this", "that", "on", "at", "us", "we", "what", "how", "which", "many", "much", "did", "does"}


def _tokens(text: str) -> set[str]:
    return {t for t in normalize(text).split() if t not in _STOP and len(t) > 1}


UNSUPPORTED_HOSTS = {
    "linkedin.com": "LinkedIn is never automated",
    "indeed.com": "Indeed is not supported", "naukri.com": "Naukri is not supported",
    "glassdoor.com": "Glassdoor is not supported", "glassdoor.co.in": "Glassdoor is not supported",
}
ACCOUNT_HOSTS = {
    "myworkdayjobs.com": "Workday", "myworkdaysite.com": "Workday", "icims.com": "iCIMS", "taleo.net": "Taleo",
    "successfactors.com": "SAP SuccessFactors", "successfactors.eu": "SAP SuccessFactors", "brassring.com": "BrassRing",
    "oraclecloud.com": "Oracle Recruiting", "jobvite.com": "Jobvite",
}


def _host(url: str) -> str:
    return (urlparse(url).hostname or "").lower()


def _host_matches(host: str, domain: str) -> bool:
    return host == domain or host.endswith("." + domain)


def unsupported_reason(url: str) -> str | None:
    """Why this site is off limits, or None. Account-only systems (Workday etc.) need you to apply by hand."""
    host = _host(url)
    for domain, why in UNSUPPORTED_HOSTS.items():
        if _host_matches(host, domain):
            return f"unsupported site: {why}"
    for domain, name in ACCOUNT_HOSTS.items():
        if _host_matches(host, domain):
            return f"{name} needs an account to apply, so it can't be filled automatically"
    return None


def detect_ats(url: str, html: str = "", frame_urls: list[str] | None = None) -> str | None:
    """greenhouse, lever, ashby, workable, recruitee or smartrecruiters, from the URL, or from what a careers page embeds."""
    host, path = _host(url), (urlparse(url).path or "").lower()
    q = (urlparse(url).query or "").lower()
    if _host_matches(host, "greenhouse.io"):
        return "greenhouse"
    if _host_matches(host, "lever.co"):
        return "lever"
    if _host_matches(host, "ashbyhq.com"):
        return "ashby"
    if _host_matches(host, "workable.com"):
        return "workable"
    if _host_matches(host, "recruitee.com"):
        return "recruitee"
    if _host_matches(host, "smartrecruiters.com"):
        return "smartrecruiters"
    blob = " ".join([html.lower(), " ".join(u.lower() for u in (frame_urls or [])), q, path])
    if "greenhouse.io" in blob or "gh_jid" in blob:
        return "greenhouse"
    if "jobs.lever.co" in blob:
        return "lever"
    if "jobs.ashbyhq.com" in blob or "ashby_jid" in blob:
        return "ashby"
    if "apply.workable.com" in blob:
        return "workable"
    if ".recruitee.com" in blob:
        return "recruitee"
    if "smartrecruiters.com" in blob:
        return "smartrecruiters"
    return None


def apply_url_for(url: str, ats: str | None) -> str:
    """Some systems keep the form on a sibling page of the job description."""
    p = urlparse(url)
    path = p.path.rstrip("/")
    if ats == "lever" and not path.endswith("/apply"):
        return p._replace(path=path + "/apply", query="").geturl()
    if ats == "ashby" and not path.endswith("/application"):
        return p._replace(path=path + "/application", query="").geturl()
    return url


_MAP: list[tuple[str, str]] = [
    ("resume", r"\b(resume|cv|curriculum vitae)\b"),
    ("cover_letter", r"cover letter|covering letter|letter of motivation"),
    ("first_name", r"\b(first|given|fore)\s?name\b|^preferred first name$"),
    ("last_name", r"\b(last|family)\s?name\b|\bsurname\b"),
    ("full_name", r"^(your |full |legal )*name$|^full legal name$"),
    ("email", r"\be ?mail\b"),
    ("phone", r"\b(phone|mobile|telephone|cell)\b|\bcontact number\b"),
    ("linkedin", r"\blinkedin\b"),
    ("website", r"\b(website|portfolio|personal (site|page|url)|homepage)\b"),
    ("current_company", r"\b(current|present|most recent) (company|employer)\b"),
    ("current_title", r"\b(current|present|most recent) (job )?(title|role|position)\b"),
    ("location", r"^(current |your )?(location|city)( city)?$|\bwhere are you (currently )?(based|located)\b|\bcity of residence\b|^location city$"),
]

# Never fill these from the profile: they need the saved answer (or the owner).
_NEVER_PROFILE = re.compile(r"relocat|sponsor|visa|authori[sz]|right to work|salary|compensation|expect|notice|start date|gender|race|ethnic|veteran|disabilit|pronoun|orientation")


def clean_label(label: str) -> str:
    """Forms often repeat the label text ("Email* Email"). Collapse the repeat and extra spaces."""
    t = re.sub(r"\s+", " ", label or "").strip()
    words = t.split(" ")
    for n in range(1, len(words) // 2 + 1):
        head = " ".join(words[:n])
        tail = " ".join(words[n:2 * n]).replace("*", "")
        if head.replace("*", "") == tail and len(words) <= 2 * n + 1:
            return head.rstrip("*").strip() + ("*" if "*" in head else "")
    return t


def map_label(label: str) -> str | None:
    """Which profile field a form label asks for (first_name, email, ...), or None when it is a different question."""
    t = normalize(label)
    if not t or _NEVER_PROFILE.search(t):
        return None
    for key, pattern in _MAP:
        if re.search(pattern, t):
            return key
    return None


def match_question(label: str, questions: list[dict]) -> dict | None:
    """The prepared question that is the same as this form question, by word overlap, or None."""
    a = _tokens(label)
    if not a:
        return None
    best, best_score = None, 0.0
    for q in questions or []:
        b = _tokens(q.get("q", ""))
        if not b:
            continue
        common = len(a & b)
        if common < min(2, len(a), len(b)):
            continue
        score = common / min(len(a), len(b))
        if score > best_score:
            best, best_score = q, score
    return best if best_score >= 0.75 else None


_DECLINE = re.compile(r"decline|prefer not|don'?t wish|do not wish|not to (say|answer|disclose|identify|specify)|rather not|no answer|choose not|i don'?t want", re.I)
_DIVERSITY = re.compile(r"\b(gender|race|racial|ethnic\w*|hispanic|latino|veteran|disabilit\w*|disabled|pronouns?|sexual orientation|transgender|lgbt\w*|religio\w*|caste|marital|date of birth)\b", re.I)
_SENSITIVE = re.compile(r"sponsor|visa|immigration|authori[sz]|right to work|eligible to work|legally|work permit|salary|compensation|\bote\b|\bctc\b|notice period|start date|relocat|where are you (based|located)|current location", re.I)
_CONSENT = re.compile(r"privacy|terms|consent|acknowledge|i agree|i have read|data processing|gdpr|certify", re.I)


def is_diversity(label: str) -> bool:
    return bool(_DIVERSITY.search(label or ""))


def is_sensitive(label: str) -> bool:
    return bool(_SENSITIVE.search(label or "")) or is_diversity(label)


def is_consent(label: str) -> bool:
    return bool(_CONSENT.search(label or ""))


def pick_decline(options: list[str]) -> str | None:
    for o in options:
        if _DECLINE.search(o or ""):
            return o
    return None


def best_option(answer: str, options: list[str]) -> str | None:
    """The form option that means the same as the answer, or None. Never guesses between unrelated options."""
    a = normalize(answer)
    if not a:
        return None
    norm = [(o, normalize(o)) for o in options]
    for o, n in norm:
        if n == a:
            return o
    for o, n in norm:
        if n and (a in n or n in a) and len(n) > 1:
            return o
    yes = a in {"yes", "y", "true"} or a.startswith("yes ")
    no = a in {"no", "n", "false"} or a.startswith("no ")
    for o, n in norm:
        if (yes and n.startswith("yes")) or (no and n.startswith("no")):
            return o
    at = _tokens(answer)
    best, score = None, 0.0
    for o, _ in norm:
        ot = _tokens(o)
        if not ot or not at:
            continue
        s = len(at & ot) / min(len(at), len(ot))
        if s > score:
            best, score = o, s
    return best if score >= 0.67 else None


_SUCCESS_TEXT = re.compile(
    r"thank you for (applying|your application|your interest)|thanks for applying|application (has been |was )?(received|submitted|sent)|"
    r"(successfully|been) (submitted|applied)|we(?:'| ha)ve received your application|your application (has been |was )?(received|submitted)|"
    r"application complete|you(?:'| ha)ve applied|we got your application", re.I)
_SUCCESS_URL = re.compile(r"confirmation|confirmed|thank-?you|thanks|submitted|success|applied|complete", re.I)
_CHALLENGE_TEXT = re.compile(r"verify (that )?you(?:'| a)re (a )?human|i(?:'| a)m not a robot|complete the captcha|select all images|solve the (captcha|puzzle)", re.I)


def success_signal(url_before: str, url_after: str, page_text: str) -> tuple[bool, str]:
    """True only with clear evidence the application went through: confirmation words on the page, or a thank-you style URL change."""
    m = _SUCCESS_TEXT.search(page_text or "")
    if m:
        return True, f'page says "{m.group(0)}"'
    if url_after != url_before and _SUCCESS_URL.search(urlparse(url_after).path or ""):
        return True, f"moved to {urlparse(url_after).path}"
    return False, ""


_NO_BOTS = re.compile(r"not a bot|auto-?appl\w*|automated (applications?|submissions?)|(bots?|ai agents?|ai tools?) (are )?(not )?(allowed|permitted|welcome)|applications? (submitted )?(by|using) (a )?(bot|automation)|no (ai|bots?|automation)", re.I)


def forbids_automation(page_text: str) -> str | None:
    """The employer's own words about bots or auto-applying, when the form says it doesn't want them. Respect it."""
    m = _NO_BOTS.search(page_text or "")
    if not m:
        return None
    start = max(0, m.start() - 60)
    return re.sub(r"\s+", " ", (page_text or "")[start:m.end() + 60]).strip()


def challenge_text(page_text: str) -> bool:
    return bool(_CHALLENGE_TEXT.search(page_text or ""))


def cv_html(text: str) -> str:
    """Plain CV text as a clean one-column page for the PDF."""
    esc = lambda s: s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")  # noqa: E731
    out, in_list = [], False
    for raw in (text or "").splitlines():
        line = raw.rstrip()
        bullet = re.match(r"^\s*[-*•]\s+(.*)$", line)
        if bullet:
            if not in_list:
                out.append("<ul>")
                in_list = True
            out.append(f"<li>{esc(bullet.group(1))}</li>")
            continue
        if in_list:
            out.append("</ul>")
            in_list = False
        if not line.strip():
            continue
        if line.isupper() and len(line) < 60:
            out.append(f"<h2>{esc(line.title())}</h2>")
        else:
            out.append(f"<p>{esc(line)}</p>")
    if in_list:
        out.append("</ul>")
    css = "body{font-family:Helvetica,Arial,sans-serif;font-size:11pt;line-height:1.4;margin:0;color:#111}h2{font-size:12pt;margin:14pt 0 4pt;border-bottom:1px solid #ccc}p{margin:3pt 0}ul{margin:3pt 0 3pt 16pt;padding:0}li{margin:2pt 0}"
    return f"<html><head><meta charset='utf-8'><style>{css}</style></head><body>{''.join(out)}</body></html>"


# ----------------------------------------------------------------------------------------------------------------------
# Browser work
# ----------------------------------------------------------------------------------------------------------------------

# Reads every visible form control on the page (or frame) and returns plain descriptors. Radios and checkboxes are grouped.
COLLECT_JS = r"""
() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const txt = (el) => ((el && el.textContent) || '').replace(/\s+/g, ' ').trim();
  const ownLabel = (el) => {
    const parts = [];
    if (el.id) { const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) parts.push(txt(l)); }
    const wrap = el.closest('label'); if (wrap) parts.push(txt(wrap));
    const aria = el.getAttribute('aria-label'); if (aria) parts.push(aria);
    const lb = el.getAttribute('aria-labelledby');
    if (lb) lb.split(/\s+/).forEach((id) => { const e = document.getElementById(id); if (e) parts.push(txt(e)); });
    return parts.join(' ').trim();
  };
  const near = (el) => {
    let a = el.parentElement;
    for (let i = 0; i < 5 && a; i++, a = a.parentElement) {
      const l = a.querySelector('legend, label, [class*="label" i], [class*="question" i], h3, h4');
      if (l && !l.contains(el) && txt(l)) return txt(l);
    }
    return '';
  };
  const fields = []; const groups = {}; let n = 0;
  const els = document.querySelectorAll('input, textarea, select, [role="combobox"]');
  for (const el of els) {
    const tag = el.tagName.toLowerCase(); const type = (el.getAttribute('type') || '').toLowerCase();
    if (['hidden', 'submit', 'button', 'image', 'reset', 'search'].includes(type)) continue;
    if (el.disabled || el.getAttribute('aria-hidden') === 'true' && type !== 'file') continue;
    if (type !== 'file' && !vis(el)) continue;
    const required = el.required || el.getAttribute('aria-required') === 'true';
    if (type === 'radio' || type === 'checkbox') {
      const key = (type + ':' + (el.name || near(el) || n));
      const optLabel = ownLabel(el) || txt(el.parentElement) || el.value;
      if (!groups[key]) {
        const g = { kind: type === 'radio' ? 'radio' : 'checkbox', label: '', options: [], required: false, group: ++n, name: el.name || '' };
        const fs = el.closest('fieldset'); const legend = fs && fs.querySelector('legend');
        const rg = el.closest('[role="radiogroup"], [role="group"]');
        g.label = (legend && txt(legend)) || (rg && (rg.getAttribute('aria-label') || '')) || near(el) || '';
        groups[key] = g; fields.push(g);
      }
      groups[key].options.push(optLabel); groups[key].required = groups[key].required || required;
      el.setAttribute('data-ja-g', String(groups[key].group)); el.setAttribute('data-ja-o', String(groups[key].options.length - 1));
      continue;
    }
    const id = ++n; el.setAttribute('data-ja', String(id));
    let kind = tag === 'select' ? 'select' : (type === 'file' ? 'file' : (el.getAttribute('role') === 'combobox' ? 'combobox' : (tag === 'textarea' ? 'textarea' : 'text')));
    const f = { kind, id, type, elid: el.id || '', name: el.name || '', label: ownLabel(el) || near(el) || el.placeholder || '', placeholder: el.placeholder || '', required, options: [], accept: el.getAttribute('accept') || '' };
    if (tag === 'select') f.options = [...el.options].map((o) => txt(o)).filter((t) => t && !/^(select|choose|please select|--)/i.test(t));
    if (type === 'file' && !f.label) f.label = el.name || el.id || '';
    f.label = f.label.slice(0, 300);
    fields.push(f);
  }
  const byParent = new Map();
  for (const b of document.querySelectorAll('button')) {
    if (!vis(b) || b.disabled) continue;
    if (!/^(yes|no)$/i.test(txt(b))) continue;
    const par = b.parentElement; if (!par) continue;
    if (!byParent.has(par)) byParent.set(par, []);
    byParent.get(par).push(b);
  }
  for (const [par, bs] of byParent) {
    if (bs.length !== 2) continue;
    const g = ++n;
    const label = near(par.firstElementChild || par) || near(par);
    bs.forEach((b, i) => { b.setAttribute('data-ja-g', String(g)); b.setAttribute('data-ja-o', String(i)); });
    fields.push({ kind: 'buttons', label: label.slice(0, 300), options: bs.map((b) => txt(b)), required: /\*/.test(label), group: g, name: '' });
  }
  return fields;
}
"""

VISIBLE_CHALLENGE_JS = r"""
() => [...document.querySelectorAll('iframe')].filter((f) => {
  const r = f.getBoundingClientRect(); const s = (f.src || '') + ' ' + (f.title || '');
  return r.width > 200 && r.height > 200 && /captcha|challenge|turnstile/i.test(s);
}).map((f) => f.src || f.title)
"""

APPLY_LINK_RE = re.compile(r"^\s*(apply( now| here| for this (job|position|role))?|apply to this job|i'?m interested)\s*[→>]?\s*$", re.I)
SUBMIT_RE = re.compile(r"^\s*(submit( my)? application|submit|send application|apply|apply now|complete application)\s*$", re.I)

AnswerFn = Callable[[str, str, list[str]], tuple[str, bool, str]]


def say(msg: str) -> None:
    print(f"[{datetime.now():%H:%M:%S}] {msg}", flush=True)


def _frames_with_fields(page) -> list:
    """The page itself, then any iframes, for application forms that live in an embed."""
    return [page] + [f for f in page.frames if f != page.main_frame]


def _has_form(frame) -> bool:
    try:
        return bool(frame.evaluate("() => !!document.querySelector('input[type=email], input[type=file], textarea')"))
    except Exception:  # noqa: BLE001
        return False


def open_application(page, url: str) -> tuple[Any, str | None]:
    """Go to the job and reach its application form. Returns (frame holding the form, ats)."""
    reason = unsupported_reason(url)
    if reason:
        raise Blocked(reason)
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    frames = [f.url for f in page.frames]
    ats = detect_ats(page.url, page.content()[:200_000], frames)
    reason = unsupported_reason(page.url)
    if reason:
        raise Blocked(reason)

    # An embedded Greenhouse form is simplest to fill as its own page.
    for f in page.frames:
        if f != page.main_frame and "greenhouse.io" in f.url and ("embed/job_app" in f.url or "job_app" in f.url):
            page.goto(f.url, wait_until="domcontentloaded")
            page.wait_for_timeout(2000)
            ats = "greenhouse"
            break

    target = apply_url_for(page.url, ats) if ats in ("lever", "ashby") else page.url
    if target != page.url and not any(_has_form(f) for f in _frames_with_fields(page)):
        page.goto(target, wait_until="domcontentloaded")
        page.wait_for_timeout(2500)

    for _ in range(2):
        for f in _frames_with_fields(page):
            if _has_form(f):
                return f, ats
        link = None
        for role in ("link", "button"):
            for cand in page.get_by_role(role).all()[:80]:
                try:
                    if cand.is_visible() and APPLY_LINK_RE.match(cand.inner_text(timeout=500) or ""):
                        link = cand
                        break
                except Exception:  # noqa: BLE001
                    continue
            if link:
                break
        if not link:
            break
        try:
            with page.context.expect_page(timeout=4000) as new_page:
                link.click()
            page = new_page.value
            page.wait_for_load_state("domcontentloaded")
        except Exception:  # noqa: BLE001
            page.wait_for_timeout(2500)
    for f in _frames_with_fields(page):
        if _has_form(f):
            return f, ats
    pw = None
    try:
        pw = page.evaluate("() => !!document.querySelector('input[type=password]')")
    except Exception:  # noqa: BLE001
        pass
    if pw:
        raise Blocked("this page asks you to log in or create an account first")
    raise Blocked("couldn't find an application form on this page")


def render_pdf(browser, text: str, path: Path) -> Path:
    """Chromium can only make PDFs when headless, so this uses its own quick headless page."""
    page = browser.new_page()
    try:
        page.set_content(cv_html(text))
        page.pdf(path=str(path), format="A4", margin={"top": "18mm", "bottom": "18mm", "left": "18mm", "right": "18mm"})
    finally:
        page.close()
    return path


def _locate(frame, f: dict, opt: int | None = None):
    if f["kind"] in ("radio", "checkbox", "buttons"):
        return frame.locator(f'[data-ja-g="{f["group"]}"][data-ja-o="{opt}"]').first
    # Forms often re-render after each field and drop my marker, so fall back to the field's own name or id.
    esc = lambda v: v.replace("\\", "\\\\").replace('"', '\\"')  # noqa: E731
    sel = f'[data-ja="{f["id"]}"]'
    if f.get("name"):
        sel += f', [name="{esc(f["name"])}"]'
    if f.get("elid"):
        sel += f', [id="{esc(f["elid"])}"]'
    return frame.locator(sel).first


def _combo_options(loc):
    """The options of THIS dropdown's own open menu (pages can hold several lists, such as a phone-country picker)."""
    scope = loc.locator("xpath=ancestor::*[.//*[@role='option']][1]")
    if scope.count() == 0:
        return None, []
    opts = scope.locator('[role="option"]')
    return opts, [t.strip() for t in opts.all_inner_texts() if t.strip()]


def _open_combobox(frame, loc) -> list[str]:
    """Opens the dropdown and returns what it offers."""
    loc.click(timeout=5000)
    frame.wait_for_timeout(500)
    _, texts = _combo_options(loc)
    if not texts:
        loc.focus()
        frame.page.keyboard.press("ArrowDown")
        frame.wait_for_timeout(500)
        _, texts = _combo_options(loc)
    return texts


def _choose_combobox(frame, loc, wanted: str | None) -> str | None:
    """Opens a dropdown-style box, types to filter, and clicks the option that matches. Returns what was chosen, or None."""
    loc.click(timeout=5000)
    if wanted:
        loc.type(wanted[:30], delay=25)
    frame.wait_for_timeout(700)
    opts, texts = _combo_options(loc)
    if not texts or not wanted:
        loc.press("Escape")
        return None
    pick = best_option(wanted, texts)
    if not pick and wanted.split(",")[0].strip().lower() in texts[0].lower():
        pick = texts[0]  # typed city: the first suggestion that contains it
    if not pick:
        loc.press("Escape")
        return None
    opts.filter(has_text=pick).first.click()
    return pick


def _profile_value(key: str, profile: dict, item: dict) -> str:
    return {
        "first_name": profile.get("first_name", ""), "last_name": profile.get("last_name", ""), "full_name": profile.get("full_name", ""),
        "email": profile.get("email", ""), "phone": profile.get("phone", ""), "location": profile.get("location", ""),
        "linkedin": profile.get("linkedin_url", ""), "website": profile.get("website", ""),
        "current_company": profile.get("current_company", ""), "current_title": profile.get("current_title", ""),
        "cover_letter": item.get("cover_note", ""),
    }.get(key, "") or ""


def fill_form(frame, item: dict, profile: dict, answer_fn: AnswerFn, cv_pdf: Path, cover_pdf: Path | None, deadline: float) -> dict:
    """Fills every field it can and returns counts. Raises Blocked when a required field can't be filled honestly."""
    fields = frame.evaluate(COLLECT_JS)
    stats = {"found": len(fields), "filled": 0, "skipped": 0, "consent": 0, "answered_by_backchannel": 0, "unfilled_required": []}
    questions = item.get("questions") or []
    uploaded_resume = False
    label, required = "", False

    def skip() -> None:
        stats["skipped"] += 1
        if required:
            stats["unfilled_required"].append(label[:70])

    for f in fields:
        if time.monotonic() > deadline:
            raise Blocked("took longer than 4 minutes")
        label = clean_label(f["label"])
        kind, required = f["kind"], bool(f["required"]) or label.endswith("*")
        key = map_label(label)
        try:
            if kind == "file":
                lab = normalize(label + " " + f.get("name", ""))
                if re.search(r"cover", lab):
                    if cover_pdf:
                        _locate(frame, f).set_input_files(str(cover_pdf))
                        stats["filled"] += 1
                    elif required:
                        raise Blocked("the form wants a cover letter file and none was prepared")
                    else:
                        skip()
                elif key == "resume" or re.search(r"resume|cv|attach|upload|file", lab) and not uploaded_resume:
                    _locate(frame, f).set_input_files(str(cv_pdf))
                    uploaded_resume = True
                    stats["filled"] += 1
                elif required:
                    raise Blocked(f'it needs a file I don\'t have: "{label[:80]}"')
                else:
                    skip()
                continue

            if kind in ("text", "textarea", "combobox", "select") and key and kind != "select":
                value = _profile_value(key, profile, item)
                if key == "cover_letter" and not value:
                    key = None
                elif value:
                    loc = _locate(frame, f)
                    if kind == "combobox":
                        if _choose_combobox(frame, loc, value):
                            stats["filled"] += 1
                        elif required:
                            raise Blocked(f'couldn\'t pick "{label[:60]}" from its list')
                        else:
                            skip()
                    else:
                        loc.fill(value)
                        stats["filled"] += 1
                    continue
                elif key in ("current_company", "current_title") and not required:
                    skip()
                    continue
                # no profile value: fall through to the question path

            if kind in ("radio", "checkbox", "buttons"):
                opts = f["options"]
                if kind == "checkbox" and len(opts) == 1 and is_consent(label + " " + opts[0]):
                    if required:
                        _locate(frame, f, 0).check()
                        stats["consent"] += 1
                    else:
                        skip()
                    continue
                choice = _decide_choice(label, opts, required, questions, item, answer_fn, stats)
                if choice is None:
                    skip()
                    continue
                for idx in choice:
                    (_locate(frame, f, idx).click() if kind == "buttons" else _locate(frame, f, idx).check())
                stats["filled"] += 1
                continue

            if kind == "select":
                opts = f["options"]
                pick = _decide_one(label, opts, required, questions, answer_fn, stats, "select")
                if pick is None:
                    skip()
                    continue
                _locate(frame, f).select_option(label=pick)
                stats["filled"] += 1
                continue

            if kind == "combobox":
                loc = _locate(frame, f)
                seen = _open_combobox(frame, loc)
                loc.press("Escape")
                pick = _decide_one(label, seen, required, questions, answer_fn, stats, "select")
                if pick is None:
                    skip()
                    continue
                if not _choose_combobox(frame, loc, pick):
                    raise Blocked(f'couldn\'t pick "{pick}" for "{label[:60]}"')
                stats["filled"] += 1
                continue

            # free text
            q = match_question(label, questions)
            if q is not None:
                answer = q.get("answer", "")
            elif is_diversity(label) and not required:
                skip()
                continue
            elif not required and not label.strip():
                skip()
                continue
            elif not required and not (is_sensitive(label)):
                skip()  # optional free-text we have no prepared answer for: leave it blank
                continue
            else:
                answer, needs, reason = answer_fn(label, "text", [])
                stats["answered_by_backchannel"] += 1
                if needs:
                    raise Blocked(reason or f'"{label[:80]}" needs your own answer')
            if not answer.strip():
                if required:
                    raise Blocked(f'"{label[:80]}" has no saved answer')
                skip()
                continue
            loc = _locate(frame, f)
            loc.fill(answer)
            frame.wait_for_timeout(500)
            try:
                opts, texts = _combo_options(loc)
            except Exception:  # noqa: BLE001  (the page re-rendered the box)
                opts, texts = None, []
            if texts:  # an autocomplete box: the value only counts once a suggestion is chosen
                pick = best_option(answer, texts)
                if not pick and answer.split(",")[0].strip().lower() in texts[0].lower():
                    pick = texts[0]
                if pick:
                    opts.filter(has_text=pick).first.click()
                else:
                    loc.press("Escape")
                    loc.fill("")
            frame.wait_for_timeout(200)
            try:
                typed = (loc.input_value(timeout=2000) or "").strip()
            except Exception:  # noqa: BLE001  (box re-rendered after typing; the fill itself succeeded)
                typed = answer.strip()
            if not typed:
                skip()
            else:
                stats["filled"] += 1
        except Blocked:
            raise
        except Exception as e:  # noqa: BLE001
            if required:
                raise Blocked(f'couldn\'t fill the required field "{label[:80]}" ({type(e).__name__}: {(str(e).splitlines() or [""])[0][:110]})') from e
            skip()
    if stats["unfilled_required"]:
        raise Blocked("these required fields are still empty: " + "; ".join(stats["unfilled_required"][:4]))
    return stats


def _decide_one(label: str, options: list[str], required: bool, questions: list[dict], answer_fn: AnswerFn, stats: dict, kind: str) -> str | None:
    """Which option to choose for one question, or None to leave it. Raises Blocked when it can't be answered honestly."""
    q = match_question(label, questions)
    if q is not None and q.get("answer", "").strip():
        pick = best_option(q["answer"], options)
        if pick:
            return pick
        raise Blocked(f'your saved answer for "{label[:70]}" doesn\'t match any of the form\'s options')
    if is_diversity(label):
        decline = pick_decline(options)
        if decline:
            return decline
        if required:
            raise Blocked(f'"{label[:70]}" is required and has no "prefer not to say" option')
        return None
    if not required:
        return None
    answer, needs, reason = answer_fn(label, kind, options)
    stats["answered_by_backchannel"] += 1
    if needs:
        raise Blocked(reason or f'"{label[:80]}" needs your own answer')
    pick = best_option(answer, options)
    if not pick:
        raise Blocked(f'couldn\'t match the answer for "{label[:70]}" to its options')
    return pick


def _decide_choice(label, options, required, questions, item, answer_fn, stats) -> list[int] | None:
    pick = _decide_one(label, options, required, questions, answer_fn, stats, "radio")
    return None if pick is None else [options.index(pick)]


def find_submit(frame):
    for role in ("button",):
        for b in frame.get_by_role(role).all()[:60]:
            try:
                if b.is_visible() and b.is_enabled() and SUBMIT_RE.match(b.inner_text(timeout=500) or ""):
                    return b
            except Exception:  # noqa: BLE001
                continue
    loc = frame.locator('button[type="submit"], input[type="submit"]').first
    return loc if loc.count() else None


def validation_errors(frame) -> list[str]:
    try:
        return frame.evaluate(
            "() => [...document.querySelectorAll('[aria-invalid=\"true\"], .error, [class*=\"error\" i]')].map(e => (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0,80)).filter(Boolean).slice(0,5)"
        )
    except Exception:  # noqa: BLE001
        return []


def submit_and_confirm(page, frame) -> tuple[bool, str]:
    before_url = page.url
    btn = find_submit(frame)
    if not btn:
        raise Blocked("couldn't find the Submit button")
    btn.click()
    end = time.monotonic() + 20
    while time.monotonic() < end:
        page.wait_for_timeout(1000)
        try:
            text = page.inner_text("body", timeout=3000)
        except Exception:  # noqa: BLE001
            text = ""
        ok, why = success_signal(before_url, page.url, text)
        if ok:
            return True, why
        try:
            challenges = page.evaluate(VISIBLE_CHALLENGE_JS)
        except Exception:  # noqa: BLE001
            challenges = []
        if challenges or challenge_text(text):
            raise Blocked("the site is showing a CAPTCHA, which I never try to solve. Finish this one by hand")
    errs = validation_errors(frame)
    if errs:
        raise Blocked("the form rejected the submit: " + "; ".join(errs[:3]))
    raise Blocked("clicked Submit but saw no confirmation, so I can't say it went through. Check the job's page")


def process_item(context, pdf_browser, item: dict, profile: dict, mode: str, answer_fn: AnswerFn, tag: str) -> dict:
    """One application. Always returns {result, log, receipt?, ats, shot}; never raises."""
    out: dict[str, Any] = {"result": "failed", "log": "", "ats": None, "shot": ""}
    page = None
    deadline = time.monotonic() + ITEM_TIMEOUT_S
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    try:
        page = context.new_page()
        page.set_default_timeout(CALL_TIMEOUT_MS)
        frame, ats = open_application(page, item["url"])
        out["ats"] = ats
        # new tab may have opened inside open_application: use the frame's own page
        page = frame.page if hasattr(frame, "page") else page
        tmp = DATA_DIR / "apply_tmp"
        tmp.mkdir(parents=True, exist_ok=True)
        cv_pdf = render_pdf(pdf_browser, item.get("tailored_cv") or profile.get("cv_text", ""), tmp / f"cv-{tag}.pdf")
        cover_pdf = render_pdf(pdf_browser, item["cover_note"], tmp / f"cover-{tag}.pdf") if item.get("cover_note") else None
        try:
            notice = forbids_automation(page.inner_text("body", timeout=5000))
        except Exception:  # noqa: BLE001
            notice = None
        if notice:
            raise Blocked(f'this employer\'s form says it does not want automated applications ("{notice[:140]}"). Apply by hand')
        stats = fill_form(frame, item, profile, answer_fn, cv_pdf, cover_pdf, deadline)
        shot = SHOT_DIR / f"{datetime.now():%Y%m%d-%H%M%S}-{tag}.png"
        try:
            page.screenshot(path=str(shot), full_page=True)
            out["shot"] = shot.name
        except Exception:  # noqa: BLE001
            pass
        summary = (f"{ats or 'unknown form'}: found {stats['found']} fields, filled {stats['filled']}, left {stats['skipped']} optional blank"
                   + (f", ticked {stats['consent']} consent box(es)" if stats["consent"] else ""))
        if mode == "submit":
            ok, why = submit_and_confirm(page, frame)
            out.update(result="submitted", log=f"{summary}. Submitted: {why}.", receipt=why)
        else:
            out.update(result="filled", log=f"{summary}. Dry run: stopped before Submit.")
    except Blocked as b:
        out.update(result="needs_you", log=f"Needs you: {b}.")
        _shot_on_problem(page, out, tag)
    except Exception as e:  # noqa: BLE001
        out.update(result="failed", log=f"Failed: {type(e).__name__}: {str(e)[:200]}")
        _shot_on_problem(page, out, tag)
    finally:
        try:
            if page:
                for pg in list(page.context.pages):
                    if pg != page and pg.url == "about:blank":
                        pg.close()
                page.close()
        except Exception:  # noqa: BLE001
            pass
    return out


def _shot_on_problem(page, out: dict, tag: str) -> None:
    if not page or out.get("shot"):
        return
    try:
        shot = SHOT_DIR / f"{datetime.now():%Y%m%d-%H%M%S}-{tag}-stopped.png"
        page.screenshot(path=str(shot), full_page=True)
        out["shot"] = shot.name
    except Exception:  # noqa: BLE001
        pass


# ----------------------------------------------------------------------------------------------------------------------
# Running
# ----------------------------------------------------------------------------------------------------------------------

def append_log(entry: dict) -> None:
    try:
        runs = json.loads(LOG_FILE.read_text()) if LOG_FILE.exists() else []
    except ValueError:
        runs = []
    LOG_FILE.write_text(json.dumps(([entry] + runs)[:200], indent=1))


class RunLock:
    def __enter__(self):
        DATA_DIR.mkdir(exist_ok=True)
        self.fh = open(LOCK_FILE, "w")  # noqa: SIM115
        try:
            fcntl.flock(self.fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            self.fh.close()
            return None
        return self

    def __exit__(self, *exc):
        try:
            fcntl.flock(self.fh, fcntl.LOCK_UN)
            self.fh.close()
        except Exception:  # noqa: BLE001
            pass


def _launch(p, headless: bool):
    BROWSER_DIR.mkdir(parents=True, exist_ok=True)
    context = p.chromium.launch_persistent_context(str(BROWSER_DIR), headless=headless, viewport={"width": 1280, "height": 900})
    pdf_browser = p.chromium.launch(headless=True)
    return context, pdf_browser


def run_test_url(url: str, headless: bool) -> int:
    """Fill ONE public form with the fake profile. Never submits and never talks to Backchannel."""
    from playwright.sync_api import sync_playwright

    def stub_answer(question: str, kind: str, options: list[str]) -> tuple[str, bool, str]:
        # Test mode only: a fake profile and no submit, so sensitive questions get a throwaway answer just to exercise the form.
        if options:
            return (best_option("No", options) or options[0]), False, ""
        return "Test answer (dry run).", False, ""

    item = {"id": "test", "job_id": "test", "url": url, "title": "test", "company": "test",
            "cover_note": "Hello, this is a dry-run test note.", "tailored_cv": FAKE_PROFILE["cv_text"], "questions": []}
    with sync_playwright() as p:
        context, pdf_browser = _launch(p, headless)
        try:
            tag = re.sub(r"[^a-z0-9]+", "-", (urlparse(url).hostname or "test") + urlparse(url).path)[:40]
            res = process_item(context, pdf_browser, item, FAKE_PROFILE, "dry_run", stub_answer, tag)
        finally:
            context.close()
            pdf_browser.close()
    say(f"{res['result']} ({res['ats']}): {res['log']}")
    if res.get("shot"):
        say(f"screenshot: {SHOT_DIR / res['shot']}")
    return 0 if res["result"] in ("filled", "needs_you") else 1


def run_queue(max_items: int | None, headless: bool) -> int:
    import bc  # needs Backchannel connected in JobRadar

    ok, data = bc.call("GET", "/api/jobradar/apply-queue", timeout=60)
    if not ok or not isinstance(data, dict):
        say(f"Couldn't read the apply queue: {data}")
        return 0
    items, mode, remaining = data.get("items") or [], data.get("mode", "dry_run"), int(data.get("remaining_today", 0))
    profile = data.get("profile") or {}
    limit = min(len(items), remaining, max_items if max_items else len(items))
    if limit <= 0:
        say("Nothing to apply to right now." if not items else "Today's limit is used up.")
        return 0
    say(f"{len(items)} queued, doing {limit} in {'SUBMIT' if mode == 'submit' else 'dry-run'} mode.")

    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        context, pdf_browser = _launch(p, headless)
        try:
            for i, item in enumerate(items[:limit]):
                app_id = item["id"]

                def answer_fn(question: str, kind: str, options: list[str], _id=app_id) -> tuple[str, bool, str]:
                    ok2, res = bc.call("POST", "/api/jobradar/apply-answer", {"application_id": _id, "question": question, "kind": kind, "options": options}, timeout=90)
                    if not ok2 or not isinstance(res, dict):
                        return "", True, f"couldn't get an answer for \"{question[:60]}\" from Backchannel ({res})"
                    return str(res.get("answer", "")), bool(res.get("needs_you")), str(res.get("reason", ""))

                say(f"[{i + 1}/{limit}] {item.get('title')} at {item.get('company')}")
                res = process_item(context, pdf_browser, item, profile, mode, answer_fn, f"{app_id[:8]}")
                say(f"  -> {res['result']}: {res['log']}")
                payload = {"id": app_id, "result": res["result"], "log": res["log"] + (f" Screenshot: {res['shot']}" if res.get("shot") else "")}
                if res.get("receipt"):
                    payload["receipt"] = res["receipt"]
                reported = False
                for _ in range(2):
                    ok3, r3 = bc.call("POST", "/api/jobradar/apply-result", payload, timeout=60)
                    if ok3:
                        reported = True
                        break
                    time.sleep(3)
                if not reported:
                    say(f"  !! couldn't tell Backchannel the result: {r3}")
                append_log({"at": datetime.now().strftime("%Y-%m-%d %H:%M"), "id": app_id, "title": item.get("title"), "company": item.get("company"),
                            "url": item.get("url"), "mode": mode, "ats": res.get("ats"), "result": res["result"], "log": res["log"], "shot": res.get("shot", ""), "reported": reported})
                if i < limit - 1 and not os.environ.get("APPLY_NO_PAUSE"):
                    time.sleep(random.uniform(*PAUSE_RANGE_S))
        finally:
            context.close()
            pdf_browser.close()
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="JobRadar auto-apply runner")
    ap.add_argument("--max", type=int, default=0, help="at most this many applications this run")
    ap.add_argument("--headless", action="store_true", help="no visible browser window")
    ap.add_argument("--url", help="test one public form with a FAKE profile (needs --dry-run)")
    ap.add_argument("--dry-run", action="store_true", help="with --url: fill but never submit")
    args = ap.parse_args()
    if args.url:
        if not args.dry_run:
            print("--url is for testing only and needs --dry-run (it never submits).")
            return 2
        return run_test_url(args.url, args.headless)
    with RunLock() as lock:
        if lock is None:
            say("Another auto-apply run is already going. Skipping this one.")
            return 0
        return run_queue(args.max or None, args.headless)


if __name__ == "__main__":
    sys.exit(main())

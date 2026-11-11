"""Talking to Backchannel's owner-only JobRadar endpoints (/api/jobradar/*), protected by your JobRadar key."""

from __future__ import annotations

import json
import time
from pathlib import Path

import pandas as pd
import requests

import core

SUMMARY_CACHE = core.DATA_DIR / "bc_summary.json"
_last_fail = 0.0
_last_err = ""


def call(method: str, path: str, payload: dict | None = None, timeout: int = 120) -> tuple[bool, dict | str]:
    """Returns (ok, data) or (False, plain-English error)."""
    bc = core.load_bc()
    if not (bc.get("url") and bc.get("secret")):
        return False, "Connect Backchannel in the sidebar first."
    try:
        res = requests.request(method, f"{bc['url']}{path}", json=payload, timeout=timeout, allow_redirects=False,
                               headers={"Authorization": f"Bearer {bc['secret']}"})
    except Exception as e:
        return False, f"Couldn't reach Backchannel: {e}"
    if res.is_redirect or res.status_code == 404:
        return False, "Backchannel doesn't have this feature yet. Publish the latest Backchannel (git push) and wait 2 minutes."
    try:
        data = res.json()
    except ValueError:
        return False, f"Backchannel sent back an unexpected page (status {res.status_code})."
    if not res.ok:
        return False, data.get("error", f"Backchannel said {res.status_code}")
    return True, data


def summary(max_age_s: int = 900, force: bool = False) -> tuple[dict, str]:
    """Great companies, profile basics, scorecard, outcomes, helpers. Cached for 15 minutes; falls back to the last copy."""
    global _last_fail, _last_err
    cached = core.read_json(SUMMARY_CACHE)
    if cached and not force and time.time() - cached.get("_at", 0) < max_age_s:
        return cached, ""
    if not force and time.time() - _last_fail < 300:  # don't retry a failing connection on every click
        return cached, _last_err
    ok, data = call("GET", "/api/jobradar/summary", timeout=20)
    if ok and isinstance(data, dict):
        data["_at"] = time.time()
        SUMMARY_CACHE.write_text(json.dumps(data))
        return data, ""
    _last_fail, _last_err = time.time(), str(data)
    return cached, _last_err


def outcomes_df(s: dict) -> pd.DataFrame:
    return pd.DataFrame(s.get("outcomes") or [], columns=["title", "company", "location", "market", "source", "url", "status", "stage", "created_at"])


def great_companies(s: dict) -> list[str]:
    return [g["name"] for g in (s.get("great_companies") or []) if g and g.get("name")]

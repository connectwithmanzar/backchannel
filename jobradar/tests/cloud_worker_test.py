"""Offline test for the cloud worker's loop and settings checks (no browser, no network).

Run:  python3 jobradar/tests/cloud_worker_test.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import cloud_worker as cw  # noqa: E402

assert cw.interval_from_env(None) == 300
assert cw.interval_from_env("abc") == 300
assert cw.interval_from_env("10") == 60, "never faster than once a minute"
assert cw.interval_from_env("900") == 900

assert cw.missing_settings({}) == ["BACKCHANNEL_URL", "JOBRADAR_SECRET"]
assert cw.missing_settings({"BACKCHANNEL_URL": "https://x", "JOBRADAR_SECRET": " "}) == ["JOBRADAR_SECRET"]
assert cw.missing_settings({"BACKCHANNEL_URL": "https://x", "JOBRADAR_SECRET": "k"}) == []

calls, waits, logs = [], [], []


def flaky() -> int:
    calls.append(1)
    if len(calls) == 2:
        raise RuntimeError("boom")
    return 0


n = cw.run_forever(flaky, 120, sleep=waits.append, max_loops=3, log=logs.append)
assert n == 3 and len(calls) == 3, "a failed run must not stop the loop"
assert waits == [120, 120, 120]
assert len(logs) == 1 and "boom" in logs[0]
print("cloud worker tests passed")

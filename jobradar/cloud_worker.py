"""JobRadar cloud worker: runs the auto-apply robot on a small server, so applications go out with your laptop closed.

It is the same robot as on your Mac (apply_runner.py), run headless in a loop. It needs two settings, given as
environment variables on the server:  BACKCHANNEL_URL  and  JOBRADAR_SECRET.  See CLOUD.md for the steps.

Environment:
    BACKCHANNEL_URL     your Backchannel address, e.g. https://backchannel-eight.vercel.app
    JOBRADAR_SECRET     the same JobRadar key you use on your Mac
    APPLY_INTERVAL_S    seconds between checks of the queue (default 300, minimum 60)
"""

from __future__ import annotations

import os
import sys
import time
import traceback
from typing import Callable


def interval_from_env(raw: str | None, default: int = 300, minimum: int = 60) -> int:
    """A usable wait in seconds: a bad or tiny value falls back so the worker never hammers the site."""
    try:
        value = int(str(raw).strip())
    except (TypeError, ValueError):
        return default
    return max(minimum, value)


def missing_settings(env: dict[str, str]) -> list[str]:
    return [k for k in ("BACKCHANNEL_URL", "JOBRADAR_SECRET") if not env.get(k, "").strip()]


def run_forever(run_once: Callable[[], int], interval_s: int, sleep: Callable[[float], None] = time.sleep, max_loops: int | None = None,
                log: Callable[[str], None] = print) -> int:
    """Runs the queue, waits, repeats. One failed run is logged and the loop carries on."""
    loops = 0
    while max_loops is None or loops < max_loops:
        loops += 1
        try:
            run_once()
        except Exception:  # noqa: BLE001 - a crash in one run must not stop the worker
            log("Run failed, will try again:\n" + traceback.format_exc())
        sleep(interval_s)
    return loops


def main() -> int:
    once_only = "--once" in sys.argv[1:]
    missing = missing_settings(dict(os.environ))
    if missing:
        print(f"Missing settings: {', '.join(missing)}. Add them in your server's environment variables (see CLOUD.md).", flush=True)
        return 2
    import apply_runner  # imported late so the checks above work without the browser installed

    def once() -> int:
        with apply_runner.RunLock() as lock:
            if lock is None:
                apply_runner.say("Another run is still going. Skipping this round.")
                return 0
            return apply_runner.run_queue(None, headless=True)

    if once_only:  # one pass, for scheduled runners such as GitHub Actions
        return once()

    interval = interval_from_env(os.environ.get("APPLY_INTERVAL_S"))
    apply_runner.say(f"Cloud worker started. Checking the queue every {interval} s.")
    run_forever(once, interval)
    return 0


if __name__ == "__main__":
    sys.exit(main())

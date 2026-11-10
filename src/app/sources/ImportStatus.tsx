"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { btnPrimary, Card } from "@/components/ui";

export const FIND_BOARDS_EVENT = "backchannel:find-boards";

interface Props { total: number; withBoard: number; unchecked: number; migrated: boolean }

/** Always-visible status of the company list: how many are saved, how many have been checked for a job board, with a Resume button. */
export default function ImportStatus({ total, withBoard, unchecked, migrated }: Props) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(unchecked);
  const [roles, setRoles] = useState(0);
  const [found, setFound] = useState(0);
  const [error, setError] = useState("");
  const stop = useRef(false);

  const run = useCallback(async () => {
    setRunning(true); setError(""); stop.current = false;
    try {
      for (;;) {
        const res = await fetch("/api/sources/find-boards", { method: "POST" });
        const data = await res.json().catch(() => ({ error: `Something went wrong (error ${res.status}).` }));
        if (!res.ok) { setError(data.error ?? "Something went wrong."); break; }
        setLeft(data.left); setRoles((n) => n + data.salesRoles); setFound((n) => n + data.withBoard);
        if (data.left === 0 || data.checked === 0 || stop.current) break;
      }
    } catch { setError("Lost the connection. Press Resume to carry on where it stopped."); }
    setRunning(false);
    router.refresh();
  }, [router]);

  // After the page refreshes with new saved companies, follow the real count.
  useEffect(() => { if (!running) setLeft(unchecked); }, [unchecked, running]);

  useEffect(() => {
    const go = () => { if (!running) void run(); };
    window.addEventListener(FIND_BOARDS_EVENT, go);
    return () => window.removeEventListener(FIND_BOARDS_EVENT, go);
  }, [run, running]);

  if (total === 0) return null;
  const checked = Math.max(0, total - left);
  const pct = Math.min(100, Math.round((checked / total) * 100));
  return (
    <Card className="flex flex-col gap-2" aria-label="Import status">
      <h2 className="text-xl font-bold">Import status</h2>
      <p className="text-sm"><b className="num">{total}</b> companies saved · <b className="num">{withBoard + found}</b> with a public job board · <b className="num">{checked}</b> checked for a board{roles ? ` · ${roles} sales roles found just now` : ""}</p>
      <div className="h-2 overflow-hidden rounded-full bg-sunk" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Companies checked"><div className="h-full bg-accent" style={{ width: `${pct}%` }} /></div>
      {left > 0 ? (
        <>
          <p className="text-sm text-muted">{running ? `Checking the next companies… ${left} left. You can leave this page; come back and press Resume if it stops.` : `${left} companies are still waiting to be checked. Nothing is lost if you leave: press Resume any time.`}</p>
          <div><button type="button" className={btnPrimary} disabled={running || !migrated} onClick={() => void run()}>{running ? "Checking…" : "Resume checking"}</button>{running && <button type="button" className="ml-3 text-sm text-muted underline" onClick={() => { stop.current = true; }}>Pause</button>}</div>
          {!migrated && <p className="text-sm text-warn">Run database update 0015 first (supabase/migrations/0015_board_checked.sql), then press Resume.</p>}
        </>
      ) : <p className="text-sm text-muted">All companies are checked. Those without a public board are scanned each morning through job-listing search.</p>}
      {error && <p role="alert" className="text-sm text-warn">{error}</p>}
    </Card>
  );
}

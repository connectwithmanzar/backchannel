"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { btn, btnPrimary, Card } from "@/components/ui";
import { chunk, parseCompanyList } from "@/lib/company-import";
import { suggestedAsText } from "@/data/suggested-companies";

type Outcome = { name: string; status: "added" | "no_feed" | "already_there" | "excluded"; ats?: string; roles?: number };

export default function ImportCompanies() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const [roles, setRoles] = useState(0);
  const [error, setError] = useState("");

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 500_000) { setError("That file is too big. Use a plain CSV or text file under 500 KB."); return; }
    setText(await file.text());
    setError("");
  }

  async function run() {
    const { rows } = parseCompanyList(text);
    if (!rows.length) { setError("Add at least one company, one per line, like: Acme, acme.com"); return; }
    setBusy(true); setError(""); setOutcomes(null); setRoles(0);
    const all: Outcome[] = [];
    let total = 0;
    const batches = chunk(rows);
    for (let i = 0; i < batches.length; i++) {
      setProgress(`Checking companies ${i * 20 + 1} to ${Math.min((i + 1) * 20, rows.length)} of ${rows.length}…`);
      const res = await fetch("/api/sources/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ companies: batches[i] }) });
      const data = await res.json().catch(() => ({ error: `Something went wrong (error ${res.status}).` }));
      if (!res.ok) { setError(data.error ?? "Import failed."); break; }
      all.push(...data.outcomes); total += data.sales_roles ?? 0;
      setOutcomes([...all]); setRoles(total);
    }
    setBusy(false); setProgress("");
    router.refresh();
  }

  const count = (s: Outcome["status"]) => outcomes?.filter((o) => o.status === s).length ?? 0;
  const noFeed = outcomes?.filter((o) => o.status === "no_feed") ?? [];

  return (
    <Card className="mb-6 flex flex-col gap-3">
      <h2 className="text-xl font-bold">Add many companies at once</h2>
      <p className="text-sm text-muted">
        Paste or upload your target companies, one per line: <code>Company, website</code>. Backchannel finds each one&apos;s public careers board and pulls the sales roles. Companies without a public board are listed so you can check them by hand.
      </p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} aria-label="Companies"
        placeholder={"Acme, acme.com\nGlobex, globex.io\nInitech"}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnPrimary} disabled={busy || !text.trim()} onClick={run}>{busy ? "Adding…" : "Add companies"}</button>
        <label className={`${btn} cursor-pointer`}>
          Upload CSV
          <input type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" disabled={busy} onChange={(e) => readFile(e.target.files?.[0])} />
        </label>
        <button type="button" className={btn} disabled={busy} onClick={() => setText(suggestedAsText())}>Fill with a starter list</button>
      </div>
      {progress && <p role="status" className="text-sm text-muted">{progress}</p>}
      {error && <p role="alert" className="text-sm text-warn">{error}</p>}
      {outcomes && (
        <div className="text-sm">
          <p className="font-semibold">
            {count("added")} added with a public board ({roles} sales roles found) · {count("no_feed")} without a public board · {count("already_there")} already watched
            {count("excluded") ? ` · ${count("excluded")} skipped (excluded or on your stealth list)` : ""}
          </p>
          {noFeed.length > 0 && (
            <p className="mt-1 text-muted">No public board found (they may use Workday or their own site, so check their careers page by hand): {noFeed.map((o) => o.name).join(", ")}.</p>
          )}
        </div>
      )}
    </Card>
  );
}

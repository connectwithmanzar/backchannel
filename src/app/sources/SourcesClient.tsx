"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export interface SourceRow {
  id: string; name: string; domain: string | null; ats_type: string; ats_slug: string; enabled: boolean;
  open_sales_roles: number | null; collect_error: string | null; last_collected_at: string | null;
}

async function call(body: object) {
  const res = await fetch("/api/sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export default function SourcesClient({ rows, owner }: { rows: SourceRow[]; owner: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState<"all" | "working" | "broken" | "off">("all");

  const shown = useMemo(() => rows.filter((r) =>
    filter === "all" ? true : filter === "off" ? !r.enabled : filter === "broken" ? r.enabled && !!r.collect_error : r.enabled && !r.collect_error
  ), [rows, filter]);
  const counts = {
    all: rows.length,
    working: rows.filter((r) => r.enabled && !r.collect_error).length,
    broken: rows.filter((r) => r.enabled && r.collect_error).length,
    off: rows.filter((r) => !r.enabled).length,
  };

  async function run(key: string, body: object, success: (d: Record<string, unknown>) => string) {
    setBusy(key); setMsg(null);
    try { const d = await call(body); setMsg({ ok: true, text: success(d) }); router.refresh(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(null); }
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {owner && (
        <form className="flex max-w-xl flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) run("add", { action: "add", name }, (d) => { const f = d.found as { ats: string; slug: string }; setName(""); return `Added ${name}: found their ${f.ats} board, ${d.sales_roles} sales role(s) now.`; }); }}>
          <input id="src-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a company, e.g. Gong or gong.io"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2" aria-label="Company name" />
          <button disabled={busy === "add"} className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-ink disabled:opacity-60">
            {busy === "add" ? "Finding board…" : "Add company"}
          </button>
        </form>
      )}
      {msg && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-good-soft text-good" : "bg-warn-soft text-warn"}`}>{msg.text}</p>}
      <div className="flex flex-wrap gap-1.5">
        {(["all", "working", "broken", "off"] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-[13px] capitalize ${filter === f ? "border-fg bg-fg text-bg" : "border-line bg-surface"}`}>
            {f === "off" ? "Turned off" : f} <span className="num">{counts[f]}</span>
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wider text-muted">
            <th className="px-3 py-2">Company</th><th className="px-3 py-2">Board</th><th className="px-3 py-2">Sales roles</th><th className="px-3 py-2">Status</th>{owner && <th className="px-3 py-2" />}
          </tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                <td className="px-3 py-2 font-semibold">{r.name}<div className="text-xs font-normal text-muted">{r.domain}</div></td>
                <td className="px-3 py-2 whitespace-nowrap"><span className="capitalize">{r.ats_type}</span> · <span className="font-mono text-xs">{r.ats_slug}</span></td>
                <td className="px-3 py-2 num">{r.open_sales_roles ?? "—"}</td>
                <td className="px-3 py-2">
                  {!r.enabled ? <span className="text-muted">Turned off</span>
                    : r.collect_error ? <span className="text-warn">Broken: {r.collect_error}</span>
                    : r.last_collected_at ? <span className="text-good">Working</span> : <span className="text-muted">Not checked yet</span>}
                </td>
                {owner && (
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {r.collect_error && r.enabled && (
                        <button type="button" disabled={!!busy} onClick={() => run(r.id + "fix", { action: "repair", id: r.id }, (d) => { const f = d.found as { ats: string; slug: string }; return `${r.name} fixed: now using ${f.ats}/${f.slug}.`; })}
                          className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold">{busy === r.id + "fix" ? "Fixing…" : "Auto-fix"}</button>
                      )}
                      {r.enabled && (
                        <button type="button" disabled={!!busy} onClick={() => run(r.id + "run", { action: "run", id: r.id }, (d) => `${r.name}: ${d.sales_roles} sales role(s).`)}
                          className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold">{busy === r.id + "run" ? "Checking…" : "Check now"}</button>
                      )}
                      <button type="button" disabled={!!busy} onClick={() => run(r.id + "tog", { action: "toggle", id: r.id, enabled: !r.enabled }, () => `${r.name} turned ${r.enabled ? "off" : "on"}.`)}
                        className="rounded-lg border border-line px-2.5 py-1 text-xs">{r.enabled ? "Turn off" : "Turn on"}</button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={5} className="px-3 py-8 text-center text-muted">No companies here. Run collection from the Roles page to load the starting list.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

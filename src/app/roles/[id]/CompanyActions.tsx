"use client";
import { useState } from "react";
import Link from "next/link";
import { btn, btnPrimary } from "@/components/ui";

/** Add the company to your list (saved and scanned every morning), or look at all its other roles. */
export default function CompanyActions({ company, domain }: { company: string; domain: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function add() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/sources/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ companies: [{ name: company, domain: domain || null }] }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    const o = d.outcomes?.[0];
    if (!res.ok || !o) { setMsg({ ok: false, text: d.error ?? "Couldn't add that company." }); return; }
    setMsg({ ok: o.status !== "excluded", text:
      o.status === "added" ? `${company} is saved and scanned: ${o.roles ?? 0} sales roles found. It is checked again every morning.`
      : o.status === "no_feed" ? `${company} is saved. It has no public job board, so it is scanned each morning through job-listing search.`
      : o.status === "already_there" ? `${company} is already in your companies.`
      : `${company} is on your stealth list, so it was not added.` });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnPrimary} disabled={busy} onClick={add}>{busy ? "Adding…" : "Add to my companies"}</button>
        <Link href={`/companies?find=${encodeURIComponent(company)}`} className={btn}>See more roles here</Link>
      </div>
      {msg && <p role="status" className={`text-sm ${msg.ok ? "text-good" : "text-warn"}`}>{msg.text}</p>}
    </div>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { btn, Card } from "@/components/ui";

export default function DiscoverButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/discover", { method: "POST" });
    const d = await res.json().catch(() => ({ error: `Something went wrong (error ${res.status}).` }));
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: d.error ?? "Discovery failed." }); return; }
    setMsg({ ok: true, text: d.note ?? `Ran ${d.searches} searches, found ${d.found} new company boards, added ${d.added}, with ${d.sales_roles} sales roles.` });
    router.refresh();
  }
  return (
    <Card className="mb-6 flex flex-col gap-2">
      <h2 className="text-xl font-bold">Find more companies</h2>
      <p className="text-sm text-muted">Searches company job pages for sales roles in India, the Gulf, the UK, Europe, Singapore and remote, then adds every company board it finds. It also runs by itself every morning. Each search uses one web-search credit.</p>
      <div><button type="button" className={btn} disabled={busy} onClick={run}>{busy ? "Searching… (about a minute)" : "Find more companies now"}</button></div>
      {msg && <p role="status" className={`text-sm ${msg.ok ? "text-good" : "text-warn"}`}>{msg.text}</p>}
    </Card>
  );
}

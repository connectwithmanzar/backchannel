"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { btn, btnPrimary, Card, input, Pill } from "@/components/ui";
import { postJson } from "@/lib/api";
import { OFFER_CURRENCIES, type OfferRow } from "@/lib/offers";
import NegotiationStrategist from "@/components/NegotiationStrategist";

const usd = (n: number | null) => (n == null ? "n/a" : `$${Math.round(n).toLocaleString("en-US")}`);
const blank = { company: "", role_title: "", location: "", currency: "USD", base: "", variable: "", joining_bonus: "", equity_note: "", visa_note: "", deadline: "", notes: "" };

export default function OffersClient({ offers }: { offers: OfferRow[] }) {
  const router = useRouter();
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function act(key: string, body: object, ok: string, after?: () => void) {
    setBusy(key); setMsg(null);
    try { await postJson("/api/offers", body); setMsg({ ok: true, text: ok }); after?.(); router.refresh(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(""); }
  }
  const field = (k: keyof typeof blank, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="grid gap-1 text-xs text-muted">{label}
      <input className={input + " text-fg"} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...extra} /></label>
  );

  return (
    <div className="flex flex-col gap-5">
      {msg && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-good-soft text-good" : "bg-warn-soft text-warn"}`}>{msg.text}</p>}
      <Card>
        <h2 className="mb-3 text-xl font-bold">Add an offer</h2>
        <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); act("add", { action: "add", ...f }, "Offer added.", () => setF(blank)); }}>
          {field("company", "Company *")}{field("role_title", "Role")}{field("location", "Location")}
          <label className="grid gap-1 text-xs text-muted">Currency
            <select className={input + " text-fg"} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{OFFER_CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
          {field("base", "Yearly base", { type: "number", min: 0 })}{field("variable", "Yearly variable or commission", { type: "number", min: 0 })}
          {field("joining_bonus", "Joining bonus (one time)", { type: "number", min: 0 })}{field("deadline", "Reply by", { type: "date" })}
          {field("visa_note", "Visa or relocation")}
          <label className="grid gap-1 text-xs text-muted sm:col-span-3">Equity or other benefits (as written in the offer)
            <input className={input + " text-fg"} value={f.equity_note} onChange={(e) => setF({ ...f, equity_note: e.target.value })} /></label>
          <label className="grid gap-1 text-xs text-muted sm:col-span-3">Notes
            <input className={input + " text-fg"} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
          <div><button type="submit" className={btnPrimary} disabled={!!busy || !f.company.trim()}>{busy === "add" ? "Adding…" : "Add offer"}</button></div>
        </form>
      </Card>

      <NegotiationStrategist />

      {offers.length === 0 ? <Card><p className="text-sm text-muted">No offers yet. When one arrives, add it above to compare.</p></Card> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead><tr className="text-xs uppercase tracking-wider text-muted">
              <th className="py-2 pr-3">Offer</th><th className="pr-3">Yearly cash (USD)</th><th className="pr-3">Year one with bonus</th><th className="pr-3">Equity / benefits</th><th className="pr-3">Visa</th><th className="pr-3">Status</th><th /></tr></thead>
            <tbody className="divide-y divide-line align-top">
              {offers.map((o) => (
                <tr key={o.id}>
                  <td className="py-3 pr-3"><b>{o.company}</b>{o.isBest && <> <Pill tone="good">Highest cash</Pill></>}
                    <div className="text-muted">{o.role_title ?? ""}{o.location ? ` · ${o.location}` : ""}</div>
                    {o.deadline && <div className="text-xs text-muted">Reply by {o.deadline}</div>}</td>
                  <td className="pr-3 num"><b>{usd(o.annualUsd)}</b><div className="text-xs text-muted">{o.currency} {((o.base ?? 0) + (o.variable ?? 0)).toLocaleString("en-US")}{o.rank ? ` · #${o.rank}` : ""}</div></td>
                  <td className="pr-3 num">{usd(o.yearOneUsd)}</td>
                  <td className="pr-3">{o.equity_note ?? <span className="text-muted">none noted</span>}</td>
                  <td className="pr-3">{o.visa_note ?? <span className="text-muted">none noted</span>}</td>
                  <td className="pr-3"><select aria-label="Status" className={input + " w-auto"} value={o.status} disabled={!!busy} onChange={(e) => act(o.id + "s", { action: "status", id: o.id, status: e.target.value }, "Updated.")}>
                    {["considering", "accepted", "declined", "expired"].map((s) => <option key={s}>{s}</option>)}</select></td>
                  <td><button className={btn} disabled={!!busy} onClick={() => act(o.id + "d", { action: "delete", id: o.id }, "Deleted.")}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted">Conversion uses rough fixed exchange rates. Yearly cash is base plus variable at target. It ignores tax, cost of living, and equity value, which only you can judge.</p>
        </Card>
      )}
    </div>
  );
}

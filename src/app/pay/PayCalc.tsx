"use client";
import { useState } from "react";
import { Card, input } from "@/components/ui";

const RATES: Record<string, number> = { USD: 1, INR: 1 / 84, EUR: 1.08, GBP: 1.27, AED: 0.272 };

export default function PayCalc({ groups }: { groups: { fam: string; market: string; lo: number; hi: number; n: number }[] }) {
  const [pick, setPick] = useState(groups[0] ? `${groups[0].fam}|${groups[0].market}` : "");
  const [amount, setAmount] = useState(1800000);
  const [cur, setCur] = useState("INR");
  const g = groups.find((x) => `${x.fam}|${x.market}` === pick);
  const you = amount * (RATES[cur] ?? 1);
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-xl font-bold">Is your pay fair?</h2>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <input id="pay-amt" type="number" className={input} value={amount} onChange={(e) => setAmount(+e.target.value)} aria-label="Your yearly pay (OTE)" />
        <select id="pay-cur" className={input + " w-auto"} value={cur} onChange={(e) => setCur(e.target.value)} aria-label="Currency">{Object.keys(RATES).map((c) => <option key={c}>{c}</option>)}</select>
      </div>
      <select id="pay-grp" className={input} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Compare with">
        {groups.map((x) => <option key={`${x.fam}|${x.market}`} value={`${x.fam}|${x.market}`}>{x.fam} · {x.market} ({x.n} roles)</option>)}
      </select>
      {g ? (
        <p className="text-sm">
          You earn about <b className="num">${Math.round(you / 1000)}k</b> a year. Published roles like this pay <b className="num">${Math.round(g.lo / 1000)}k–${Math.round(g.hi / 1000)}k</b>.{" "}
          {you < g.lo ? <span className="font-semibold text-good">These roles would be a raise of about ${Math.round((g.lo - you) / 1000)}k or more.</span>
            : you > g.hi ? <span className="text-muted">You&apos;re already above the typical range here.</span>
            : <span className="text-muted">You&apos;re inside the typical range.</span>}
        </p>
      ) : <p className="text-sm text-muted">Comparison appears once roles with published pay are collected.</p>}
    </Card>
  );
}

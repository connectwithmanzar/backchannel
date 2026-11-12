"use client";
import { useEffect, useRef, useState } from "react";
import { Card, btn } from "@/components/ui";
import { WORK_MODE_LABEL, type Research } from "@/lib/company-research";
import { suggestTier, TIER_MEANING } from "@/lib/company-rating";

async function readJson(res: Response): Promise<{ error?: string; [k: string]: unknown }> {
  return res.json().catch(() => ({ error: `Something went wrong (error ${res.status}).` }));
}

const link = (host: string) => `https://${host.replace(/^https?:\/\//, "")}`;

/** The facts about a company. When none are saved yet, they are fetched from the open web automatically. */
export default function CompanyInfo({ companyId, name, domain, initial }: { companyId: string; name: string; domain: string | null; initial: Research }) {
  const [info, setInfo] = useState<Research>(initial);
  const [state, setState] = useState<"idle" | "fetching" | "error">("idle");
  const [error, setError] = useState("");
  const started = useRef(false);

  async function fetchInfo() {
    setState("fetching"); setError("");
    try {
      const d = await readJson(await fetch("/api/company-research", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ company_id: companyId, action: "research" }) }));
      if (d.error) { setState("error"); setError(d.error); return; }
      const drafted = d.research as Research;
      // Facts you already filled in stay; the web only fills the gaps.
      const merged: Research = {
        ...drafted,
        website: info.website ?? drafted.website, hq: info.hq ?? drafted.hq, work_mode: info.work_mode ?? drafted.work_mode,
        hiring_locations: info.hiring_locations ?? drafted.hiring_locations, pay_note: info.pay_note ?? drafted.pay_note,
        perks: info.perks.length ? info.perks : drafted.perks, summary: info.summary ?? drafted.summary,
        glassdoor_rating: info.glassdoor_rating ?? drafted.glassdoor_rating, ambitionbox_rating: info.ambitionbox_rating ?? drafted.ambitionbox_rating,
        wlb_rating: info.wlb_rating ?? drafted.wlb_rating, growth_rating: info.growth_rating ?? drafted.growth_rating,
        sources: { ...drafted.sources, ...info.sources },
      };
      const saved = await readJson(await fetch("/api/company-research", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ company_id: companyId, research: merged }) }));
      if (saved.error) { setState("error"); setError(saved.error); return; }
      setInfo((saved.research as Research) ?? merged);
      setState("idle");
    } catch { setState("error"); setError("Couldn't reach the server. Check your connection."); }
  }

  // First visit with nothing saved: fetch it without being asked.
  useEffect(() => {
    if (started.current || initial.researched_at) return;
    started.current = true;
    fetchInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const site = info.website ?? domain;
  const tier = suggestTier(info);
  const facts: [string, string | null][] = [
    ["Website", site],
    ["Headquarters", info.hq],
    ["Work mode", info.work_mode ? WORK_MODE_LABEL[info.work_mode] : null],
    ["Hires for your roles in", info.hiring_locations],
    ["Pay for your roles", info.pay_note],
    ["Perks", info.perks.length ? info.perks.join(", ") : null],
  ];

  return (
    <Card className="mt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold">About {name}</h2>
        <button type="button" className={btn} onClick={fetchInfo} disabled={state === "fetching"}>{state === "fetching" ? "Fetching from the web…" : "Refresh from the web"}</button>
      </div>
      {state === "fetching" && !info.researched_at && <p className="mt-3 text-sm text-muted">Looking up {name}: website, where it is based, work mode, pay and perks. This takes about ten seconds.</p>}
      {state === "error" && <p role="alert" className="mt-3 text-sm text-warn">{error}</p>}
      {info.summary && <p className="mt-3 text-sm leading-relaxed">{info.summary}</p>}
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {facts.map(([k, v]) => (
          <div key={k} className="flex gap-2"><dt className="w-40 shrink-0 text-muted">{k}</dt>
            <dd className="min-w-0 break-words">{v ? (k === "Website" ? <a className="font-semibold text-accent" href={link(v)} target="_blank" rel="noopener noreferrer">{v.replace(/^https?:\/\//, "")} ↗</a> : v) : <span className="text-muted">not found</span>}</dd></div>
        ))}
      </dl>
      <p className="mt-3 text-sm">
        {tier.tier ? <><b>Review rating suggests Tier {tier.tier}</b> ({TIER_MEANING[tier.tier]}), from an average of {tier.average}.</> : <span className="text-muted">Not rated yet: no Glassdoor or AmbitionBox rating on file.</span>}
      </p>
      <p className="mt-2 text-xs text-muted">{info.researched_at ? "Found by web search. It can be wrong; correct it from the Companies list (Research)." : "Nothing saved yet."}</p>
    </Card>
  );
}

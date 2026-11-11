"use client";
import { useEffect, useState } from "react";
import { btn, btnPrimary, input } from "@/components/ui";
import { EMPTY_RESEARCH, WORK_MODES, WORK_MODE_LABEL, reviewLinks, type Research, type WorkMode } from "@/lib/company-research";
import { TIER_MEANING, suggestTier, type Tier } from "@/lib/company-rating";

type Msg = { ok: boolean; text: string } | null;
type Form = Omit<Research, "perks" | "glassdoor_rating" | "ambitionbox_rating" | "wlb_rating" | "growth_rating"> & {
  perks: string; glassdoor_rating: string; ambitionbox_rating: string; wlb_rating: string; growth_rating: string;
};

const toForm = (r: Research): Form => ({
  ...r, perks: r.perks.join(", "),
  glassdoor_rating: r.glassdoor_rating?.toString() ?? "", ambitionbox_rating: r.ambitionbox_rating?.toString() ?? "",
  wlb_rating: r.wlb_rating?.toString() ?? "", growth_rating: r.growth_rating?.toString() ?? "",
});
const num = (s: string): number | null => { const n = Number(s.trim()); return s.trim() && Number.isFinite(n) ? n : null; };
const toResearch = (f: Form): Research => ({
  ...f, perks: f.perks.split(",").map((p) => p.trim()).filter(Boolean),
  glassdoor_rating: num(f.glassdoor_rating), ambitionbox_rating: num(f.ambitionbox_rating), wlb_rating: num(f.wlb_rating), growth_rating: num(f.growth_rating),
});

async function readJson(res: Response): Promise<{ error?: string; [k: string]: unknown }> {
  return res.json().catch(() => ({ error: `Something went wrong (error ${res.status}).` }));
}

export default function ResearchPanel({ companyId, name, tier, onSaved, onUseTier }: {
  companyId: string; name: string; tier: Tier | null;
  onSaved: (r: Research) => void; onUseTier: (t: Tier) => void;
}) {
  const [form, setForm] = useState<Form>(toForm(EMPTY_RESEARCH));
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<"research" | "save" | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/company-research?company_id=${encodeURIComponent(companyId)}`).then(readJson).then((d) => {
      if (d.research) setForm(toForm(d.research as Research));
      if (d.error) setMsg({ ok: false, text: d.error });
    }).catch(() => setMsg({ ok: false, text: "Couldn't load it. Check your connection." })).finally(() => setLoaded(true));
  }, [companyId]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const links = reviewLinks(name);
  const suggestion = suggestTier({ glassdoor_rating: num(form.glassdoor_rating), ambitionbox_rating: num(form.ambitionbox_rating) });

  async function research() {
    setBusy("research"); setMsg(null);
    try {
      const d = await readJson(await fetch("/api/company-research", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ company_id: companyId, action: "research" }) }));
      if (d.error) { setMsg({ ok: false, text: d.error }); return; }
      // Keep anything you already filled in; the draft only fills the gaps.
      const draft = toForm(d.research as Research);
      setForm((f) => ({
        ...draft,
        website: f.website || draft.website, hq: f.hq || draft.hq, work_mode: f.work_mode ?? draft.work_mode,
        hiring_locations: f.hiring_locations || draft.hiring_locations, pay_note: f.pay_note || draft.pay_note,
        perks: f.perks || draft.perks, summary: f.summary || draft.summary,
        glassdoor_rating: f.glassdoor_rating || draft.glassdoor_rating, ambitionbox_rating: f.ambitionbox_rating || draft.ambitionbox_rating,
        wlb_rating: f.wlb_rating || draft.wlb_rating, growth_rating: f.growth_rating || draft.growth_rating,
        sources: { ...draft.sources, ...f.sources },
      }));
      setMsg({ ok: true, text: `Draft ready from ${d.checked ?? "several"} web results. It can be wrong: read each line, fix what is off, then save.` });
    } catch { setMsg({ ok: false, text: "Couldn't reach the server." }); } finally { setBusy(null); }
  }

  async function save() {
    setBusy("save"); setMsg(null);
    try {
      const d = await readJson(await fetch("/api/company-research", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ company_id: companyId, research: toResearch(form) }) }));
      if (d.error) { setMsg({ ok: false, text: d.error }); return; }
      onSaved(d.research as Research); setMsg({ ok: true, text: "Saved." });
    } catch { setMsg({ ok: false, text: "Couldn't reach the server." }); } finally { setBusy(null); }
  }

  const src = (k: string) => form.sources[k] ? <a href={form.sources[k]} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs font-semibold text-accent">source ↗</a> : null;
  const text = (k: "website" | "hq" | "hiring_locations" | "pay_note", label: string, hint: string) => (
    <label className="block text-sm font-semibold">{label}{src(k)}
      <input type="text" className={`${input} mt-1 font-normal`} value={form[k] ?? ""} placeholder={hint} onChange={(e) => set(k, e.target.value || null)} />
    </label>
  );
  const rate = (k: "glassdoor_rating" | "ambitionbox_rating" | "wlb_rating" | "growth_rating", label: string) => (
    <label className="block text-sm font-semibold">{label}{src(k)}
      <input type="number" inputMode="decimal" min={0} max={5} step={0.1} className={`${input} mt-1 font-normal`} value={form[k]} placeholder="0 to 5" onChange={(e) => set(k, e.target.value)} />
    </label>
  );

  if (!loaded) return <p className="mt-3 text-sm text-muted">Loading…</p>;
  return (
    <div className="mt-3 flex flex-col gap-4 rounded-xl border border-line bg-bg p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={btnPrimary} disabled={busy !== null} onClick={research}>{busy === "research" ? "Searching the web…" : "Research this company"}</button>
        <span className="text-sm text-muted">Fills the gaps from open web search. You correct it.</span>
      </div>
      {form.summary && <p className="text-sm leading-relaxed">{form.summary}{src("summary")}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {text("website", "Website", "company.com")}
        {text("hq", "Headquarters", "City, country")}
        <label className="block text-sm font-semibold">Work mode{src("work_mode")}
          <select className={`${input} mt-1 font-normal`} value={form.work_mode ?? ""} onChange={(e) => set("work_mode", (e.target.value || null) as WorkMode | null)}>
            <option value="">Not found</option>
            {WORK_MODES.map((m) => <option key={m} value={m}>{WORK_MODE_LABEL[m]}</option>)}
          </select>
        </label>
        {text("hiring_locations", "Where they hire for your roles", "For example India, remote EMEA")}
        {text("pay_note", "Pay for your roles", "Fixed and variable, with currency")}
        <label className="block text-sm font-semibold">Perks they are known for{src("perks")}
          <input type="text" className={`${input} mt-1 font-normal`} value={form.perks} placeholder="Family health cover, learning budget, flexible leave" onChange={(e) => set("perks", e.target.value)} />
        </label>
      </div>

      <div>
        <h3 className="text-sm font-bold">What employees say</h3>
        <p className="mt-1 text-sm text-muted">Open the review pages, read them, and enter the ratings (out of 5). Backchannel does not read those sites for you.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <a className={btn} href={links.glassdoor} target="_blank" rel="noopener noreferrer">Find on Glassdoor ↗</a>
          <a className={btn} href={links.ambitionbox} target="_blank" rel="noopener noreferrer">Find on AmbitionBox ↗</a>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {rate("glassdoor_rating", "Glassdoor overall")}
          {rate("ambitionbox_rating", "AmbitionBox overall")}
          {rate("wlb_rating", "Work-life balance")}
          {rate("growth_rating", "Promotions and growth")}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface px-3 py-2.5 text-sm">
        {suggestion.tier ? (
          <>
            <span><b>Suggested: Tier {suggestion.tier}</b> ({TIER_MEANING[suggestion.tier]}) from an average rating of {suggestion.average}.</span>
            {tier !== suggestion.tier && <button type="button" className={btn} onClick={() => onUseTier(suggestion.tier!)}>Use Tier {suggestion.tier}</button>}
            {tier === suggestion.tier && <span className="text-good">Matches your tier.</span>}
          </>
        ) : <span className="text-muted"><b>Not rated.</b> Enter a Glassdoor or AmbitionBox overall rating to get a suggested tier.</span>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={btnPrimary} disabled={busy !== null} onClick={save}>{busy === "save" ? "Saving…" : "Save"}</button>
        {msg && <span role="status" className={`text-sm ${msg.ok ? "text-good" : "text-warn"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}

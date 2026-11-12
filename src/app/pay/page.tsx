import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Empty } from "@/components/ui";
import { fetchAllRows } from "@/lib/db-paging";
import { FX_TO_USD } from "@/lib/score";
import { toRoleFamily } from "@/lib/jobs/scoring";
import PayCalc from "./PayCalc";

export const dynamic = "force-dynamic";

type Row = { title: string; market: string | null; currency: string | null; base_min: number | null; base_max: number | null; ote_min: number | null; ote_max: number | null; url: string; companies: { name: string } | null };

function median(xs: number[]) { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
const k = (n: number) => `$${Math.round(n / 1000)}k`;
const range = (lo: number, hi: number) => (k(lo) === k(hi) ? k(hi) : `${k(lo)}–${k(hi)}`);

export default async function PayPage() {
  const db = await createClient();
  const { data } = await fetchAllRows((a, b) => db.from("jobs").select("title, market, currency, base_min, base_max, ote_min, ote_max, url, companies(name)")
    .eq("is_active", true).or("base_max.not.is.null,ote_max.not.is.null").order("id").range(a, b), 6000);
  const rows = ((data ?? []) as unknown as Row[]).map((r) => {
    const fx = FX_TO_USD[r.currency ?? ""];
    const top = r.ote_max ?? r.base_max; const bottom = r.ote_min ?? r.base_min ?? top;
    return fx && top ? { ...r, fam: toRoleFamily(r.title), lo: (bottom ?? top) * fx, hi: top * fx, kind: r.ote_max ? "OTE" : "Base" } : null;
  }).filter((r): r is NonNullable<typeof r> => !!r && r.hi > 10_000 && r.hi < 600_000);

  const groups = new Map<string, typeof rows>();
  for (const r of rows) { const key = `${r.fam}|${r.market ?? "Other"}`; groups.set(key, [...(groups.get(key) ?? []), r]); }
  const table = [...groups.entries()].map(([key, rs]) => {
    const [fam, market] = key.split("|");
    return { fam, market, n: rs.length, lo: median(rs.map((r) => r.lo)), hi: median(rs.map((r) => r.hi)), max: Math.max(...rs.map((r) => r.hi)) };
  }).sort((a, b) => b.n - a.n);
  const best = [...rows].sort((a, b) => b.hi - a.hi).slice(0, 10);

  return (
    <section className="py-6">
      <PageHeader eyebrow="Pay benchmark" title="What sales roles really pay">
        Built from the pay ranges employers publish in the roles Backchannel collects, converted to US dollars per year so markets compare. It updates every morning. Many companies don&apos;t publish pay, so treat small samples with care.
      </PageHeader>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="overflow-x-auto">
          <h2 className="mb-3 text-xl font-bold">Published pay by role and market</h2>
          {table.length ? (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wider text-muted"><th className="py-2 pr-3">Role</th><th className="py-2 pr-3">Market</th><th className="py-2 pr-3">Typical range</th><th className="py-2 pr-3">Highest</th><th className="py-2">Roles</th></tr></thead>
              <tbody className="num">{table.map((t) => (
                <tr key={t.fam + t.market} className="border-t border-line"><td className="py-2 pr-3">{t.fam}</td><td className="py-2 pr-3">{t.market}</td><td className="py-2 pr-3 whitespace-nowrap">{range(t.lo, t.hi)}</td><td className="py-2 pr-3">{k(t.max)}</td><td className="py-2">{t.n}</td></tr>
              ))}</tbody>
            </table>
          ) : <Empty>No published pay yet. Run collection on the Roles page; US, UK and some EU roles often publish ranges.</Empty>}
        </Card>
        <div className="flex flex-col gap-5">
          <PayCalc groups={table.map((t) => ({ fam: t.fam, market: t.market, lo: t.lo, hi: t.hi, n: t.n }))} />
          <Card>
            <h2 className="mb-3 text-xl font-bold">Highest-paying open roles</h2>
            {best.length ? <ul className="flex flex-col gap-2 text-sm">{best.map((b) => (
              <li key={b.url} className="flex justify-between gap-3"><a className="min-w-0 truncate hover:underline" href={b.url} target="_blank" rel="noopener noreferrer">{b.companies?.name} · {b.title}</a><b className="num whitespace-nowrap">{k(b.hi)} {b.kind}</b></li>
            ))}</ul> : <Empty>Nothing yet.</Empty>}
          </Card>
        </div>
      </div>
    </section>
  );
}

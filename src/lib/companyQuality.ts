// Company quality (0-100) from signals we can verify in our own data. Funding stage is not included
// until a licensed data source is chosen; nothing here is guessed.
export interface CompanySignals {
  openSalesRoles: number;
  payShare: number; // 0-1: share of this company's open roles that publish pay
}

export const NEUTRAL_QUALITY = 50;

export function companyQuality(s: CompanySignals | undefined): number {
  if (!s || s.openSalesRoles <= 0) return NEUTRAL_QUALITY;
  const momentum = Math.min(100, 30 + s.openSalesRoles * 14); // 1 role = 44, 5+ roles = 100
  const transparency = Math.round(s.payShare * 100);
  return Math.round(momentum * 0.6 + transparency * 0.4);
}

type JobPayRow = { company_id: string | null; ote_max?: number | null; base_max?: number | null };

/** Per-company signals from the active jobs we already loaded. Pasted jobs (no company_id) are skipped. */
export function signalsFromRows(rows: JobPayRow[]): Map<string, CompanySignals> {
  const acc = new Map<string, { n: number; paid: number }>();
  for (const r of rows) {
    if (!r.company_id) continue;
    const a = acc.get(r.company_id) ?? { n: 0, paid: 0 };
    a.n += 1;
    if (r.ote_max || r.base_max) a.paid += 1;
    acc.set(r.company_id, a);
  }
  return new Map([...acc].map(([id, a]) => [id, { openSalesRoles: a.n, payShare: a.paid / a.n }]));
}

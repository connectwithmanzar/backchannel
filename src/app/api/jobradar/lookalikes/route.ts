import { NextRequest, NextResponse } from "next/server";
import { jobradarOwner } from "@/lib/jobradar-auth";
import { aiJson, hasAIKey, NO_AI_MESSAGE, untrusted, DATA_NOTICE } from "@/lib/ai";
import { discoverBoard } from "@/lib/collectors/ats";
import { isExcludedCompany } from "@/data/companies";

export const runtime = "nodejs";
export const maxDuration = 120;

const SYSTEM = `You suggest real companies similar to a given company, as job-search targets for a B2B sales professional in India and the Gulf.
Similar = same industry or buyer, similar size and stage, a sales team in India or the Gulf. Only companies you are confident exist.
Never claim hiring status, funding or awards. ${DATA_NOTICE}
Return JSON: {"companies":[{"name": string, "domain": string, "why": string (one short sentence)}]} with up to 10 items.`;

// POST /api/jobradar/lookalikes { company, add?: boolean } -> up to 10 similar companies, each checked for a public job board.
// With add: true, the ones with a board are added to Sources so Backchannel collects their roles daily.
export async function POST(req: NextRequest) {
  const auth = await jobradarOwner(req, 20);
  if (auth instanceof NextResponse) return auth;
  if (!hasAIKey()) return NextResponse.json({ error: NO_AI_MESSAGE }, { status: 503 });
  const { svc } = auth;
  const b = await req.json().catch(() => ({}));
  const company = typeof b.company === "string" ? b.company.trim().slice(0, 120) : "";
  if (!company) return NextResponse.json({ error: "Which company?" }, { status: 400 });
  let list: { name: string; domain: string; why: string }[] = [];
  try {
    const x = await aiJson<{ companies?: { name?: string; domain?: string; why?: string }[] }>(SYSTEM, `Company: ${untrusted("company", company)}`, { maxTokens: 1200 });
    list = (x.companies ?? []).map((c) => ({ name: String(c.name ?? "").trim(), domain: String(c.domain ?? "").trim(), why: String(c.why ?? "").trim() }))
      .filter((c) => c.name && !isExcludedCompany(c.name, c.domain) && c.name.toLowerCase() !== company.toLowerCase()).slice(0, 10);
  } catch (e) {
    return NextResponse.json({ error: `AI didn't answer: ${(e as Error).message}`.slice(0, 200) }, { status: 502 });
  }
  const deadline = Date.now() + 70_000;
  const out = await Promise.all(list.map(async (c) => {
    if (Date.now() > deadline) return { ...c, board: null, added: false };
    const found = await discoverBoard(c.name, c.domain || null).catch(() => null);
    let added = false;
    if (found && b.add === true) {
      const { error } = await svc.from("companies").upsert({ name: c.name, domain: c.domain || null, ats_type: found.ats, ats_slug: found.slug, enabled: true }, { onConflict: "ats_type,ats_slug" });
      added = !error;
    }
    return { ...c, board: found ? `${found.ats}/${found.slug}` : null, added };
  }));
  return NextResponse.json({ ok: true, companies: out });
}

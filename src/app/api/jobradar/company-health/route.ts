import { NextRequest, NextResponse } from "next/server";
import { jobradarOwner } from "@/lib/jobradar-auth";
import { searchWeb, webSearchConfigured } from "@/lib/websearch";

export const runtime = "nodejs";
export const maxDuration = 60;

const FUNDING = /\b(raises?|raised|funding|series [a-f]|seed round|investment|backed|valuation|ipo)\b/i;

// POST /api/jobradar/company-health { companies: string[] } -> recent funding news per company (last 12 months).
export async function POST(req: NextRequest) {
  const auth = await jobradarOwner(req, 30);
  if (auth instanceof NextResponse) return auth;
  if (!webSearchConfigured()) return NextResponse.json({ error: "Web search isn't set up in Backchannel (TAVILY_API_KEY), so funding news is unavailable." }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  const names: string[] = Array.isArray(b.companies) ? b.companies.map((x: unknown) => String(x ?? "").trim().slice(0, 120)).filter(Boolean).slice(0, 10) : [];
  if (!names.length) return NextResponse.json({ error: "No companies given." }, { status: 400 });
  const results = await Promise.all(names.map(async (name) => {
    try {
      const hits = await searchWeb(`"${name}" raises funding OR "series" OR investment`, { days: 365, max: 5 });
      const funding = hits.filter((h) => FUNDING.test(`${h.title} ${h.snippet}`) && `${h.title} ${h.snippet}`.toLowerCase().includes(name.toLowerCase().split(" ")[0]))
        .slice(0, 3).map((h) => ({ title: h.title, url: h.url }));
      return { name, funding };
    } catch (e) {
      return { name, funding: [], error: (e as Error).message.slice(0, 120) };
    }
  }));
  return NextResponse.json({ ok: true, results });
}

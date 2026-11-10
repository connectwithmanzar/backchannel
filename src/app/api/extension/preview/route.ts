import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitShared, retryAfter } from "@/lib/rate-limit";
import { isExcludedCompany } from "@/data/companies";
import { previewScore } from "@/lib/jobs/preview";

export const runtime = "nodejs";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// POST /api/extension/preview { url, title, company, location, remote, text }: scores a page for the signed-in user. Saves nothing.
export async function POST(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!(await rateLimitShared(`ext:${user.id}`, 120, 3600_000))) return NextResponse.json({ error: `Slow down a little. Try again in ${retryAfter(`ext:${user.id}`)}s.` }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  const input = { url: str(b.url, 1000), title: str(b.title, 200), company: str(b.company, 200), location: str(b.location, 200), remote: b.remote === true, text: str(b.text, 12000) };
  if (input.text.length < 80) return NextResponse.json({ error: "This page has too little text to score." }, { status: 400 });
  if (!input.title) return NextResponse.json({ error: "I couldn't find a job title on this page. Add it under Fix the details." }, { status: 422 });
  if (isExcludedCompany(input.company, input.url)) return NextResponse.json({ error: `${input.company || "That company"} is on your stealth or excluded list, so it won't be scored.` }, { status: 400 });
  const { data: profile } = await db.from("profiles").select("name, tools, markets, target_titles, min_ote_usd, min_ote_by_market").eq("user_id", user.id).maybeSingle();
  return NextResponse.json({ ok: true, ...previewScore(input, profile) });
}

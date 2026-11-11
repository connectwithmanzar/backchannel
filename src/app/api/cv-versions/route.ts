import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiText, hasAIKey, NO_AI_MESSAGE, DATA_NOTICE } from "@/lib/ai";
import { rateLimitShared, retryAfter } from "@/lib/rate-limit";
import { isMissingSchema, MIGRATION_0017 } from "@/lib/migration";
import { familyById } from "@/lib/cv-versions";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You reorder and tighten a candidate's CV for one kind of role. ${DATA_NOTICE} Absolute rules:
- Use ONLY facts already in the master CV. Never add employers, dates, titles, numbers, tools or results. Never change a number.
- You may reorder sections and bullets, cut bullets that do not help this role, and lead each job with the most relevant results.
- Keep it single column plain text: standard headings (Summary, Experience, Skills, Education), "- " bullets, no tables, no icons, no em-dashes.
- Lead the summary with the strongest real numbers for this role.
- Keep every employer and date exactly as in the master CV.`;

// GET /api/cv-versions: the versions you saved.
export async function GET() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { data, error } = await db.from("cv_versions").select("family, cv_text, updated_at").eq("user_id", user.id);
  if (error) return NextResponse.json({ versions: [], needsMigration: isMissingSchema(error), error: isMissingSchema(error) ? MIGRATION_0017 : "Couldn't load your CV versions." });
  return NextResponse.json({ versions: data ?? [] });
}

// POST /api/cv-versions { family, action: "draft" }   -> AI draft from your master CV (not saved)
// POST /api/cv-versions { family, cv_text }           -> save your reviewed version
export async function POST(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const fam = familyById(String(b.family ?? ""));
  if (!fam) return NextResponse.json({ error: "Pick GTM Specialist, Associate AE or SDR / BDR." }, { status: 400 });

  if (b.action === "draft") {
    const { data: p } = await db.from("profiles").select("cv_text").eq("user_id", user.id).maybeSingle();
    if (!p?.cv_text || p.cv_text.length < 200) return NextResponse.json({ error: "Upload your master CV on the Upload CV tab first." }, { status: 400 });
    if (!hasAIKey()) return NextResponse.json({ error: NO_AI_MESSAGE }, { status: 503 });
    if (!(await rateLimitShared(`cvv:${user.id}`, 12, 3600_000))) return NextResponse.json({ error: `Too many in a row. Try again in ${retryAfter(`cvv:${user.id}`)}s.` }, { status: 429 });
    try {
      const text = await aiText(SYSTEM, `ROLE KIND: ${fam.label}. Emphasise ${fam.focus}.\n\nMASTER CV (the only source of facts):\n${p.cv_text.slice(0, 12000)}`, { maxTokens: 2200, smart: true });
      if (!text) return NextResponse.json({ error: "The AI gave no answer. Try again." }, { status: 502 });
      return NextResponse.json({ ok: true, text });
    } catch (e) {
      console.error("cv draft failed:", e);
      return NextResponse.json({ error: "Couldn't write the draft. Try again." }, { status: 502 });
    }
  }

  const cv_text = typeof b.cv_text === "string" ? b.cv_text.slice(0, 20000) : "";
  if (cv_text.trim().length < 50) return NextResponse.json({ error: "That version is empty. Draft or paste it first." }, { status: 400 });
  const { error } = await db.from("cv_versions").upsert({ user_id: user.id, family: fam.id, cv_text, updated_at: new Date().toISOString() }, { onConflict: "user_id,family" });
  if (error) return NextResponse.json({ error: isMissingSchema(error) ? MIGRATION_0017 : "Couldn't save that." }, { status: isMissingSchema(error) ? 503 : 500 });
  return NextResponse.json({ ok: true });
}

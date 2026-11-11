import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isMissingSchema, MIGRATION_0017 } from "@/lib/migration";

export const runtime = "nodejs";

// GET /api/gap-line: the one honest sentence you use about a career gap.
export async function GET() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { data, error } = await db.from("profiles").select("gap_line").eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ gap_line: "", needsMigration: isMissingSchema(error), error: isMissingSchema(error) ? MIGRATION_0017 : "Couldn't load it." });
  return NextResponse.json({ gap_line: (data as { gap_line?: string | null } | null)?.gap_line ?? "" });
}

// POST /api/gap-line { gap_line }: save it. Only you write this text; Backchannel never invents a reason.
export async function POST(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const gap = typeof b.gap_line === "string" ? b.gap_line.trim().slice(0, 400) : "";
  const { data, error } = await db.from("profiles").update({ gap_line: gap }).eq("user_id", user.id).select("user_id");
  if (error) return NextResponse.json({ error: isMissingSchema(error) ? MIGRATION_0017 : "Couldn't save that." }, { status: isMissingSchema(error) ? 503 : 500 });
  if (!data?.length) return NextResponse.json({ error: "Fill in your scorecard on this page first, then save the gap line." }, { status: 400 });
  return NextResponse.json({ ok: true });
}

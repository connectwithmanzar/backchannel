import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const STATUSES = ["interested", "applied", "not_for_me"];

// POST /api/company-notes { company_id, status?: "interested" | "applied" | "not_for_me" | null, note?: string }
// Saves the signed-in user's own status and note for a company (row-level security keeps it theirs).
export async function POST(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const id = String(b.company_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Missing company." }, { status: 400 });

  const patch: Record<string, unknown> = { user_id: user.id, company_id: id };
  if ("status" in b) {
    if (b.status !== null && !STATUSES.includes(b.status)) return NextResponse.json({ error: "Unknown status." }, { status: 400 });
    patch.status = b.status;
    if (b.status === "interested" || b.status === "applied") patch.watching = true;
  }
  if (typeof b.note === "string") patch.note = b.note.slice(0, 2000);
  if (Object.keys(patch).length === 2) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

  const { error } = await db.from("watchlist").upsert(patch, { onConflict: "user_id,company_id" });
  if (error) {
    const missing = /column .*(status|note)|schema cache/i.test(error.message);
    return NextResponse.json({ error: missing ? "Status and notes need the latest database update (migration 0013) to be run once." : "Couldn't save that." }, { status: missing ? 503 : 500 });
  }
  return NextResponse.json({ ok: true });
}

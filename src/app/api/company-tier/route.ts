import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isMissingSchema, MIGRATION_0017 } from "@/lib/migration";

export const runtime = "nodejs";

// POST /api/company-tier { company_id, tier: "A" | "B" | null }
// Sets the signed-in user's own tier for a company. A tier also means you watch the company.
export async function POST(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const id = String(b.company_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Missing company." }, { status: 400 });
  if (b.tier !== null && b.tier !== "A" && b.tier !== "B") return NextResponse.json({ error: "Tier must be A, B or none." }, { status: 400 });

  const patch: Record<string, unknown> = { user_id: user.id, company_id: id, tier: b.tier };
  if (b.tier) patch.watching = true;
  const { error } = await db.from("watchlist").upsert(patch, { onConflict: "user_id,company_id" });
  if (error) {
    console.error("company-tier failed:", error.message);
    return NextResponse.json({ error: isMissingSchema(error) ? MIGRATION_0017 : "Couldn't save that." }, { status: isMissingSchema(error) ? 503 : 500 });
  }
  return NextResponse.json({ ok: true, tier: b.tier });
}

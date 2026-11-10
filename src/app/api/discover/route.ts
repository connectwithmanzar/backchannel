import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isCronAuthorized, isOwner } from "@/lib/owner";
import { discoverCompanies, scanBoardlessCompanies } from "@/lib/jobs/discover";
import { SHARED_JOBS_TAG } from "@/lib/jobs/shared-cache";

export const runtime = "nodejs";
export const maxDuration = 300;

async function run() {
  const result = await discoverCompanies();
  const scan = await scanBoardlessCompanies().catch((e) => ({ scanned: 0, saved: 0, note: (e as Error).message }));
  revalidateTag(SHARED_JOBS_TAG, { expire: 0 });
  return NextResponse.json({ ok: true, ...result, boardless: scan });
}

// GET /api/discover: daily scheduled run (Bearer CRON_SECRET), from the GitHub Actions workflow.
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { return await run(); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

// POST /api/discover: the owner's "Find more companies now" button.
export async function POST() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isOwner(user.email)) return NextResponse.json({ error: "Only the owner can run discovery." }, { status: 403 });
  try { return await run(); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

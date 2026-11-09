import { NextRequest, NextResponse } from "next/server";
import { createClient as userClient } from "@/lib/supabase/server";
import { isOwner, isCronAuthorized } from "@/lib/owner";
import { runIngestion } from "@/lib/jobs/ingest";
import { revalidateTag } from "next/cache";
import { SHARED_JOBS_TAG } from "@/lib/jobs/shared-cache";

export const runtime = "nodejs";
export const maxDuration = 300;

// POST /api/collect-jobs — admin "Run now" (optionally ?company=<id> for one company)
export async function POST(req: NextRequest) {
  const uc = await userClient();
  const { data: { user } } = await uc.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOwner(user.email)) return NextResponse.json({ error: "Only the owner can run collection." }, { status: 403 });
  try {
    const companyId = new URL(req.url).searchParams.get("company") ?? undefined;
    const result = await runIngestion({ companyId });
    revalidateTag(SHARED_JOBS_TAG, { expire: 0 });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// GET /api/collect-jobs — daily Vercel cron (Bearer CRON_SECRET)
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const result = await runIngestion();
    revalidateTag(SHARED_JOBS_TAG, { expire: 0 });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

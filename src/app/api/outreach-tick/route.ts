import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import { isCronAuthorized } from "@/lib/owner";
import { runOutreach } from "@/lib/outreach/engine";

export const runtime = "nodejs";
export const maxDuration = 120;

// GET /api/outreach-tick: run hourly by an outside scheduler (Bearer CRON_SECRET). Vercel's free plan only allows
// daily jobs, but each automatic email waits for the recipient's own morning, which falls at a different hour for
// India, the Gulf, Europe and the US. Each tick sends whatever is due and inside its window, within the daily limit.
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const svc = serviceClient();
  const end = Date.now() + 100_000;
  const { data: accounts } = await svc.from("gmail_accounts").select("user_id");
  const results: Record<string, unknown>[] = [];
  for (const a of accounts ?? []) {
    if (Date.now() > end) break;
    try { results.push({ user: a.user_id, ...(await runOutreach(svc, a.user_id, end)) }); }
    catch (e) { results.push({ user: a.user_id, error: (e as Error).message }); }
  }
  console.log(JSON.stringify({ job: "outreach-tick", users: results.length, results }));
  return NextResponse.json({ ok: true, results });
}

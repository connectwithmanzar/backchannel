import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import { isCronAuthorized } from "@/lib/owner";
import { scoreForUser } from "@/lib/jobs/scoring";
import { autoPrepare } from "@/lib/apps/auto";
import { inSendWindow, runOutreach } from "@/lib/outreach/engine";
import { runDigest } from "@/lib/notify";

export const runtime = "nodejs";
export const maxDuration = 300;

// GET /api/daily — runs every morning after job collection (Vercel cron, Bearer CRON_SECRET).
// For each user: score new roles → Autopilot prepares applications (if on) → outreach replies + follow-ups → Telegram digest.
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const svc = serviceClient();
  const startedAt = Date.now();
  const end = startedAt + 270_000;
  const { data: { users } } = await svc.auth.admin.listUsers({ perPage: 1000 });
  const share = Math.max(30_000, Math.floor(260_000 / Math.max(1, users?.length ?? 1)));
  const results = [];
  for (const u of users ?? []) {
    if (Date.now() > end) break;
    const userEnd = Math.min(end, Date.now() + share);
    const r: Record<string, unknown> = { user: u.id };
    const step = async (name: string, fn: () => Promise<unknown>) => {
      try { r[name] = await fn(); } catch (e) { r[name] = { error: (e as Error).message }; }
    };
    await step("scoring", () => scoreForUser(svc, u.id, { deadline: Math.min(userEnd, Date.now() + 40_000), ai: true }));
    await step("autopilot", () => autoPrepare(svc, u.id, Math.min(userEnd, Date.now() + 90_000)));
    await step("outreach", () => runOutreach(svc, u.id, Math.min(userEnd, Date.now() + 60_000)));
    await step("telegram", () => runDigest(u.id));
    results.push(r);
  }
  console.log(JSON.stringify({
    job: "daily", users: results.length, ms: Date.now() - startedAt, inSendWindow: inSendWindow(),
    outreach: results.map((r) => r.outreach),
  }));
  return NextResponse.json({ ok: true, results });
}

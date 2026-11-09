import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as serviceClient } from "@supabase/supabase-js";
import { runDigest } from "@/lib/notify";
import { isCronAuthorized, isOwner } from "@/lib/owner";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/notify — authenticated manual trigger from the UI
export async function POST() {
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isOwner(user.email)) return NextResponse.json({ ok: false, sent: 0, error: "The Telegram digest is set up for the owner only." }, { status: 403 });
  const result = await runDigest(user.id);
  return NextResponse.json(result, { status: result.ok ? 200 : (result.error?.includes("not configured") ? 400 : 500) });
}

// GET /api/notify — Vercel cron endpoint (secured by CRON_SECRET)
// Vercel automatically passes `Authorization: Bearer <CRON_SECRET>` for cron jobs.
// Runs the digest for every signed-up user and sends matching alerts.
export async function GET(req: NextRequest) {
  // Fails closed when CRON_SECRET is unset (middleware no longer redirects this path).
  if (!isCronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const svc = serviceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Page through all users (up to 1 000 for the Hobby plan)
  const { data: { users } } = await svc.auth.admin.listUsers({ perPage: 1000 });
  if (!users?.length) return NextResponse.json({ ok: false, error: "No users found" }, { status: 404 });

  let totalSent = 0;
  const userResults: Array<{ userId: string; sent: number; ok: boolean; error?: string }> = [];

  for (const u of users) {
    const result = await runDigest(u.id);
    userResults.push({ userId: u.id, sent: result.sent, ok: result.ok, error: result.error });
    if (result.ok) totalSent += result.sent;
  }

  return NextResponse.json({ ok: true, users_checked: users.length, total_sent: totalSent, results: userResults });
}

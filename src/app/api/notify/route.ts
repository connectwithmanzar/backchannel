import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as serviceClient } from "@supabase/supabase-js";
import { sendTelegramMessage, isTelegramConfigured } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 60;

const MIN_SCORE = 75;
const MAX_JOBS = 10;

type JobRow = {
  title: string; url: string; board: string; currency?: string;
  ote_min?: number; ote_max?: number; base_min?: number; base_max?: number;
  companies: { name: string } | null;
};

function fmt(n?: number, cur?: string): string {
  if (!n || !cur) return "";
  if (cur === "INR") return `₹${(n / 1e5).toFixed(1).replace(/\.0$/, "")}L`;
  const sym: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" };
  return `${sym[cur] ?? cur + " "}${Math.round(n / 1000)}k`;
}

async function runDigest(userId: string): Promise<{ ok: boolean; sent: number; reason?: string; error?: string }> {
  if (!isTelegramConfigured()) {
    return { ok: false, sent: 0, error: "Telegram not configured" };
  }

  const svc = serviceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: scoreRows } = await svc
    .from("job_scores")
    .select("job_id, score, telegram_notified_at, jobs(title, url, board, currency, ote_min, ote_max, base_min, base_max, companies(name))")
    .eq("user_id", userId)
    .gte("score", MIN_SCORE)
    .is("telegram_notified_at", null)
    .order("score", { ascending: false })
    .limit(MAX_JOBS);

  const rows = scoreRows ?? [];
  if (rows.length === 0) {
    return { ok: true, sent: 0, reason: "No new high-scoring roles to send" };
  }

  const lines: string[] = [
    `<b>🎯 Backchannel — ${rows.length} new role${rows.length > 1 ? "s" : ""} scoring ${MIN_SCORE}+</b>`,
    "",
  ];

  for (const row of rows) {
    const job = row.jobs as unknown as JobRow | null;
    if (!job) continue;
    const company = job.companies?.name ?? "Unknown";
    const payMax = job.ote_max ?? job.base_max;
    const payStr = payMax ? ` · ${fmt(payMax, job.currency)}` : "";
    const score = row.score ?? 0;
    lines.push(
      `<b>${score}% fit</b> — <a href="${job.url}">${job.title}</a>`,
      `${company}${payStr} · via ${job.board}`,
      ""
    );
  }

  lines.push(`<i>Open Backchannel to save, skip or apply.</i>`);

  const result = await sendTelegramMessage(lines.join("\n"));
  if (!result.ok) return { ok: false, sent: 0, error: result.error };

  const notifiedAt = new Date().toISOString();
  await svc
    .from("job_scores")
    .update({ telegram_notified_at: notifiedAt })
    .eq("user_id", userId)
    .in("job_id", rows.map((r) => r.job_id));

  return { ok: true, sent: rows.length };
}

// POST /api/notify — authenticated manual trigger from the UI
export async function POST() {
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await runDigest(user.id);
  return NextResponse.json(result, { status: result.ok ? 200 : (result.error?.includes("not configured") ? 400 : 500) });
}

// GET /api/notify — Vercel cron endpoint (secured by CRON_SECRET)
// Vercel automatically passes `Authorization: Bearer <CRON_SECRET>` for cron jobs.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Find the first active user (single-user mode)
  const svc = serviceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: users } = await svc.auth.admin.listUsers({ perPage: 1 });
  const user = users?.users?.[0];
  if (!user) return NextResponse.json({ ok: false, error: "No users found" }, { status: 404 });

  const result = await runDigest(user.id);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

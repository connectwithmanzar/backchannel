import { serviceClient } from "@/lib/supabase/service";
import { sendTelegramMessage, isTelegramConfigured } from "@/lib/telegram";

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

export async function runDigest(userId: string): Promise<{ ok: boolean; sent: number; reason?: string; error?: string }> {
  if (!isTelegramConfigured()) {
    return { ok: false, sent: 0, error: "Telegram not configured" };
  }

  const svc = serviceClient();

  const { data: scoreRows } = await svc
    .from("job_scores")
    .select("job_id, score, telegram_notified_at, jobs(title, url, board, currency, ote_min, ote_max, base_min, base_max, companies(name))")
    .eq("user_id", userId)
    .gte("score", MIN_SCORE)
    .is("telegram_notified_at", null)
    .order("score", { ascending: false })
    .limit(MAX_JOBS);

  // New roles at companies you're watching are always included, whatever their score.
  const { data: watched } = await svc.from("watchlist").select("company_id").eq("user_id", userId).eq("watching", true);
  const watchedIds = (watched ?? []).map((w: { company_id: string }) => w.company_id);
  const { data: watchRows } = watchedIds.length
    ? await svc.from("job_scores")
        .select("job_id, score, telegram_notified_at, jobs!inner(title, url, board, currency, ote_min, ote_max, base_min, base_max, company_id, is_active, companies(name))")
        .eq("user_id", userId).is("telegram_notified_at", null).eq("jobs.is_active", true).in("jobs.company_id", watchedIds)
        .order("score", { ascending: false }).limit(MAX_JOBS)
    : { data: [] };
  const seen = new Set<string>();
  const rows = [...(watchRows ?? []), ...(scoreRows ?? [])].filter((r) => (seen.has(r.job_id) ? false : (seen.add(r.job_id), true))).slice(0, MAX_JOBS + 5);
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


import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as serviceClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { scoreJob, type SearchProfile } from "@/lib/score";
import type { Job, Market, RemoteType } from "@/lib/collector/types";

export const runtime = "nodejs";
export const maxDuration = 300;

// ── helpers ──────────────────────────────────────────────────────────────────

function toMarket(m: string): Market {
  const l = (m ?? "").toLowerCase();
  if (l === "india") return "india";
  if (l === "remote") return "remote-in";
  if (l === "us" || l === "usa") return "us";
  if (
    ["uk", "united kingdom", "germany", "france", "netherlands", "ireland",
     "spain", "emea", "uae", "israel"].some((c) => l.includes(c))
  )
    return "emea";
  return "global";
}

function toRoleFamily(title: string) {
  const t = title.toLowerCase();
  if (/\b(sdr|bdr|sales development|business development rep|inside sales)\b/.test(t)) return "SDR/BDR" as const;
  if (/\b(account executive|\bae\b|new business sales|sales executive)\b/.test(t)) return "Account Executive" as const;
  if (/\b(gtm|go.to.market) (engineer|systems|operations)\b|\bgrowth engineer\b/i.test(t)) return "GTM Engineer" as const;
  if (/\b(vp|head of|director).{0,20}(sales|revenue)\b/i.test(t)) return "Sales leadership" as const;
  return "Other sales" as const;
}

function countryToMarket(country: string): Market {
  const c = country.toLowerCase();
  if (c === "india") return "india";
  if (c === "united states") return "us";
  if (["united kingdom", "germany", "netherlands", "france", "ireland", "spain", "uae"].some((x) => c.includes(x))) return "emea";
  return "global";
}

// Use Claude to write a 2-sentence explanation — returns null if no API key
async function aiExplain(
  job: Job,
  profile: SearchProfile,
  score: number
): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY ?? "";
  if (!key || key.startsWith("sk-ant-api03-PLACEHOLDER")) return null;

  const client = new Anthropic({ apiKey: key });
  const prompt = `You are a career coach. Given a sales job and a candidate profile, write exactly 2 sentences explaining why the fit score is ${score}/100.

Job: ${job.title} at ${job.company} (${job.location})
Role type: ${job.roleFamily}
Description excerpt: ${job.description.slice(0, 600)}

Candidate profile:
- Target roles: ${profile.targetFamilies.join(", ")}
- Target markets: ${profile.markets.join(", ")}
- Key tools: ${profile.tools.join(", ") || "not specified"}
- Min OTE: $${profile.minOteUsd.toLocaleString()}

Write 2 short, direct sentences. First sentence: main reason for the score. Second: one specific thing to look out for.`;

  try {
    const msg = await client.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 120,
      messages: [{ role: "user", content: prompt }],
    });
    return (msg.content[0] as { text: string }).text.trim();
  } catch {
    return null;
  }
}

// ── POST /api/score-jobs ──────────────────────────────────────────────────────

export async function POST() {
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Load profile
  const { data: profileRow } = await userClient.from("profiles")
    .select("name, tools, markets, min_ote_usd")
    .maybeSingle();

  const profile: SearchProfile = {
    name: profileRow?.name ?? "You",
    targetFamilies: ["SDR/BDR", "GTM Engineer", "Account Executive"],
    markets: (profileRow?.markets ?? []).map(countryToMarket),
    tools: profileRow?.tools ?? [],
    minOteUsd: profileRow?.min_ote_usd ?? 0,
    prefersRemote: false,
  };

  // Find unscored active jobs for this user
  const { data: scoredIds } = await userClient
    .from("job_scores")
    .select("job_id")
    .eq("user_id", user.id);

  const alreadyScored = new Set((scoredIds ?? []).map((r: { job_id: string }) => r.job_id));

  const { data: jobRows } = await userClient
    .from("jobs")
    .select("*, companies(name)")
    .eq("is_active", true)
    .order("last_checked_at", { ascending: false })
    .limit(500);

  const unscored = (jobRows ?? []).filter((r) => !alreadyScored.has(r.id));

  // Service role for writing job_scores
  const svc = serviceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let scored = 0;
  const hasAI = !!process.env.ANTHROPIC_API_KEY &&
    !process.env.ANTHROPIC_API_KEY.startsWith("sk-ant-api03-PLACEHOLDER");

  for (const row of unscored) {
    const job: Job = {
      id: row.id,
      company: (row.companies as { name: string } | null)?.name ?? "Unknown",
      title: row.title,
      location: row.location ?? "",
      remoteType: (row.remote_type ?? "unknown") as RemoteType,
      market: toMarket(row.market ?? ""),
      sourceType: "careers",
      board: row.board ?? "",
      url: row.url ?? "",
      postedAt: row.posted_at ?? undefined,
      lastCheckedAt: row.last_checked_at ?? new Date().toISOString(),
      currency: row.currency ?? undefined,
      payMin: row.ote_min ?? row.base_min ?? undefined,
      payMax: row.ote_max ?? row.base_max ?? undefined,
      payBandStatus: row.pay_band_status === "verified" ? "verified" : "unknown",
      visaSponsorship: (row.visa_sponsorship ?? "unknown") as "yes" | "no" | "unknown",
      roleFamily: toRoleFamily(row.title),
      description: row.description ?? "",
    };

    const result = scoreJob(job, profile);
    // AI explanation only for top 50 jobs (avoid cost on clearly bad fits)
    const explanation =
      hasAI && result.score >= 40
        ? await aiExplain(job, profile, result.score)
        : null;

    await svc.from("job_scores").upsert(
      {
        user_id: user.id,
        job_id: row.id,
        score: result.score,
        parts: result.parts,
        explanation: explanation ?? result.explanation,
        model: explanation ? "claude-haiku-5-5" : "rule-based",
        scored_at: new Date().toISOString(),
      },
      { onConflict: "user_id,job_id" }
    );
    scored++;
  }

  return NextResponse.json({
    ok: true,
    scored,
    skipped: alreadyScored.size,
    ai_enabled: hasAI,
  });
}

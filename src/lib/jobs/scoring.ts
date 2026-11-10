import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreJob, buildSearchProfile, type SearchProfile } from "@/lib/score";
import { companyQuality, signalsFromRows } from "@/lib/companyQuality";
import { toMarket } from "@/lib/jobs/market";
import type { Job, RemoteType, RoleFamily } from "@/lib/collector/types";
import { createAIClient, hasAIKey, AI_MODEL, AI_MODEL_FAST, untrusted, DATA_NOTICE } from "@/lib/ai";

// ── helpers ──────────────────────────────────────────────────────────────────


export function toRoleFamily(title: string): RoleFamily {
  const t = title.toLowerCase();
  if (/\b(sdr|bdr|sales development|business development rep|inside sales|market development|lead development)\b/.test(t)) return "SDR/BDR";
  if (/\b(account executive|\bae\b|new business sales|sales executive)\b/.test(t)) return "Account Executive";
  if (/\b(gtm|go.to.market) (engineer|systems|operations)\b|\brevops engineer\b|\bgrowth engineer\b/i.test(t)) return "GTM Engineer";
  if (/\b(vp|vice president|head of|director).{0,20}(sales|revenue|growth)\b|\b(sales manager|sales team lead|sales lead|country manager)\b/i.test(t)) return "Sales leadership";
  if (/\b(account manager|key account|client partner|strategic account|major account|relationship manager)\b/.test(t)) return "Account management";
  if (/\b(partner(ship)?s? (manager|executive|lead|director|development)|channel (sales|manager|partner)|alliances? (manager|lead|director))\b/.test(t)) return "Partnerships";
  if (/\b(sales operations|revenue operations|revops|sales enablement|sales analyst|customer success|client success|onboarding (manager|specialist))\b/.test(t)) return "Sales ops & CS";
  return "Other sales";
}

// Use Claude via OpenRouter to write a 2-sentence explanation — returns null if no API key
async function aiExplain(
  job: Job,
  profile: SearchProfile,
  score: number
): Promise<string | null> {
  if (!hasAIKey()) return null;

  const client = createAIClient();
  const prompt = `You are a career coach. ${DATA_NOTICE} Given a sales job and a candidate profile, write exactly 2 sentences explaining why the fit score is ${score}/100.

Job: ${job.title} at ${job.company} (${job.location})
Role type: ${job.roleFamily}
Description excerpt: ${untrusted("job_description", job.description.slice(0, 600))}

Candidate profile:
- Target roles: ${profile.targetFamilies.join(", ")}
- Target markets: ${profile.markets.join(", ")}
- Key tools: ${profile.tools.join(", ") || "not specified"}
- Min OTE: $${profile.minOteUsd.toLocaleString()}

Write 2 short, direct sentences. First sentence: main reason for the score. Second: one specific thing to look out for.`;

  try {
    const response = await client.chat.completions.create({
      model: AI_MODEL_FAST,
      max_tokens: 120,
      messages: [{ role: "user", content: prompt }],
    });
    return response.choices[0].message.content?.trim() ?? null;
  } catch {
    return null;
  }
}


/** Scores active roles for one user (new ones, or all with rescoreAll). Rule-based first, AI explanations for the best within the deadline. */
export async function scoreForUser(svc: SupabaseClient, userId: string, opts: { rescoreAll?: boolean; deadline: number; ai?: boolean }) {
  const rescoreAll = !!opts.rescoreAll;
  const deadline = opts.deadline;
  const { data: profileRow } = await svc.from("profiles").select("name, tools, markets, target_titles, min_ote_usd, min_ote_by_market").eq("user_id", userId).maybeSingle();
  const profile = buildSearchProfile(profileRow);

  const { data: existing } = await svc.from("job_scores").select("job_id, model").eq("user_id", userId);
  const scoredBefore = new Map((existing ?? []).map((r: { job_id: string; model: string | null }) => [r.job_id, r.model]));

  const { data: jobRows } = await svc.from("jobs").select("*, companies(name)").eq("is_active", true).or(`added_by.is.null,added_by.eq.${userId}`).order("last_checked_at", { ascending: false }).limit(2000);
  const signals = signalsFromRows(jobRows ?? []);
  const targets = (jobRows ?? []).filter((r) => rescoreAll || !scoredBefore.has(r.id) || !scoredBefore.get(r.id));

  const scored = targets.map((row) => {
    const job: Job = {
      id: row.id,
      company: (row.companies as { name: string } | null)?.name ?? row.company_name ?? "Unknown",
      title: row.title,
      location: row.location ?? "",
      remoteType: (row.remote_type ?? "unknown") as RemoteType,
      market: toMarket(row.market, row.remote_type),
      sourceType: "careers",
      board: row.board ?? "",
      url: row.url ?? "",
      postedAt: row.posted_at ?? undefined,
      lastCheckedAt: row.last_checked_at ?? new Date().toISOString(),
      currency: row.currency ?? undefined,
      payMin: row.ote_min ?? row.base_min ?? undefined,
      payMax: row.ote_max ?? row.base_max ?? undefined,
      payKind: (row.ote_max ?? row.ote_min) != null ? "ote" : "base",
      payBandStatus: row.pay_band_status === "verified" ? "verified" : "unknown",
      visaSponsorship: (row.visa_sponsorship ?? "unknown") as "yes" | "no" | "unknown",
      roleFamily: toRoleFamily(row.title),
      description: row.description ?? "",
      companyQuality: companyQuality(signals.get(row.company_id)),
    };
    return { job, result: scoreJob(job, profile) };
  });

  // 1) Save rule-based scores in batches (fast, no AI).
  const now = new Date().toISOString();
  for (let i = 0; i < scored.length; i += 250) {
    const batch = scored.slice(i, i + 250).map(({ job, result }) => ({
      user_id: userId, job_id: job.id, score: result.score, parts: result.parts,
      explanation: result.explanation, model: "rule-based", scored_at: now,
    }));
    const { error } = await svc.from("job_scores").upsert(batch, { onConflict: "user_id,job_id" });
    if (error) throw new Error(`Saving scores failed: ${error.message}`);
  }

  // 2) AI explanations for the best matches, 5 at a time, within ~45 seconds.
  let explained = 0;
  // No profile yet means the explanation would be generic, so don't spend AI on it.
  const hasProfileData = profile.tools.length > 0 || profile.markets.length > 0 || profile.minOteUsd > 0 || Object.keys(profile.minOteByMarket ?? {}).length > 0;
  if (hasAIKey() && hasProfileData) {
    const top = !opts.ai ? [] : scored.filter((s) => s.result.score >= 60).sort((a, b) => b.result.score - a.result.score).slice(0, 30);
    for (let i = 0; i < top.length && Date.now() < deadline; i += 5) {
      const chunk = top.slice(i, i + 5);
      const texts = await Promise.all(chunk.map(({ job, result }) => aiExplain(job, profile, result.score)));
      await Promise.all(chunk.map(({ job }, k) => texts[k]
        ? svc.from("job_scores").update({ explanation: texts[k], model: AI_MODEL }).eq("user_id", userId).eq("job_id", job.id)
        : Promise.resolve()));
      explained += texts.filter(Boolean).length;
    }
  }

  return { scored: scored.length, ai_explained: explained };
}

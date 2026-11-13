import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/supabase/service";
import { cleanAutoMode } from "@/lib/auto-apply";
import { buildSteps, progressOf, type SetupProgress, type SetupStep } from "@/lib/onboarding";

/** Reads what is already set up. Missing columns or tables count as "not set up" instead of failing the page. */
export async function loadSetup(db: SupabaseClient, userId: string): Promise<{ steps: SetupStep[]; progress: SetupProgress }> {
  const [{ data: profile }, prefsRes, { count: appCount }, gmail] = await Promise.all([
    db.from("profiles").select("cv_text, target_titles, markets, min_ote_usd, min_ote_by_market").eq("user_id", userId).maybeSingle(),
    db.from("preferences").select("standard_answers, auto_apply_mode").eq("user_id", userId).maybeSingle(),
    db.from("applications").select("id", { count: "exact", head: true }).eq("user_id", userId),
    serviceClient().from("gmail_accounts").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);
  const prefs = prefsRes.error
    ? ((await db.from("preferences").select("standard_answers").eq("user_id", userId).maybeSingle()).data as { standard_answers?: unknown } | null)
    : (prefsRes.data as { standard_answers?: unknown; auto_apply_mode?: unknown } | null);
  const answers = prefs?.standard_answers && typeof prefs.standard_answers === "object" ? Object.values(prefs.standard_answers as Record<string, unknown>).filter((v) => String(v ?? "").trim()).length : 0;
  const byMarket = profile?.min_ote_by_market && typeof profile.min_ote_by_market === "object" ? Object.keys(profile.min_ote_by_market as object).length : 0;
  const steps = buildSteps({
    hasCv: !!profile?.cv_text?.trim(),
    targetTitles: (profile?.target_titles as string[] | null)?.length ?? 0,
    markets: (profile?.markets as string[] | null)?.length ?? 0,
    hasPayFloor: (profile?.min_ote_usd ?? 0) > 0 || byMarket > 0,
    savedAnswers: answers,
    gmailConnected: !!gmail.data,
    autoApplyMode: cleanAutoMode((prefs as { auto_apply_mode?: unknown } | null)?.auto_apply_mode),
    applicationCount: appCount ?? 0,
  });
  return { steps, progress: progressOf(steps) };
}

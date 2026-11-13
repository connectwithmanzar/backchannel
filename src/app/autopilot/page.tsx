import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { hasAIKey } from "@/lib/ai";
import { cleanRules } from "@/lib/auto-rules";
import { cleanAutoMode, clampAutoCap } from "@/lib/auto-apply";
import AutopilotClient, { type AppRow, type Suggestion } from "./AutopilotClient";

export const dynamic = "force-dynamic";

export default async function AutopilotPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const uid = user?.id ?? "";
  const [{ data: prefs }, { data: profile }, { data: apps }] = await Promise.all([
    db.from("preferences").select("*").eq("user_id", uid).maybeSingle(),
    db.from("profiles").select("cv_text").eq("user_id", uid).maybeSingle(),
    db.from("applications").select("*, jobs(title, url, location, companies(name))").eq("user_id", uid).order("updated_at", { ascending: false }),
  ]);
  const minFit = prefs?.autopilot_min_fit ?? 75;
  const done = new Set((apps ?? []).map((a) => a.job_id));
  const { data: scores } = await db.from("job_scores")
    .select("job_id, score, reaction, explanation, jobs!inner(title, url, location, is_active, companies(name))")
    .eq("user_id", uid).eq("jobs.is_active", true).order("score", { ascending: false }).limit(200);
  const suggestions: Suggestion[] = (scores ?? [])
    .filter((s) => !done.has(s.job_id) && s.reaction !== "skipped" && ((s.score ?? 0) >= minFit || s.reaction === "bookmarked"))
    .slice(0, 25)
    .map((s) => {
      const j = s.jobs as unknown as { title: string; url: string; location: string; companies: { name: string } | null };
      return { job_id: s.job_id, score: s.score ?? 0, bookmarked: s.reaction === "bookmarked", explanation: s.explanation ?? "", title: j.title, url: j.url, location: j.location, company: j.companies?.name ?? "" };
    });

  return (
    <section className="py-6">
      <PageHeader eyebrow="Applications" title="Applications, prepared for you">
        For your best matches, Autopilot writes a tailored CV and cover note using only facts from your CV, and drafts answers to the form questions. It stops and asks you about visa, salary and notice period. You review, open the company&apos;s page and submit. Nothing is ever sent without you.
      </PageHeader>
      <AutopilotClient
        apps={(apps ?? []) as unknown as AppRow[]}
        suggestions={suggestions}
        settings={{ mode: prefs?.autopilot_mode === "auto" ? "auto" : "ask", minFit, cap: prefs?.autopilot_daily_cap ?? 5, autoMode: cleanAutoMode(prefs?.auto_apply_mode), autoCap: clampAutoCap(prefs?.auto_apply_daily_cap), autoUseSaved: prefs?.auto_apply_use_saved === true, rules: cleanRules(prefs?.auto_apply_rules) }}
        savedAnswers={(prefs?.standard_answers ?? {}) as Record<string, string>}
        hasCv={(profile?.cv_text ?? "").length > 200}
        aiReady={hasAIKey()}
      />
    </section>
  );
}

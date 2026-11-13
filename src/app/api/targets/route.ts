import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cleanStrategy, cleanSteps, isStepKey } from "@/lib/target-plan";
import { formatCompanyName } from "@/lib/company-name";
import { canonicalUrl } from "@/lib/jobs/url";

export const runtime = "nodejs";

const MIGRATION = "The Target list needs one database update first. Run supabase/migrations/0022_targets.sql in Supabase (SQL Editor, paste, Run), then try again.";
const missing = (e: { message?: string; code?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|could not find/i.test(e.message ?? ""));
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export async function POST(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const now = new Date().toISOString();
  const fail = (e: { message?: string; code?: string }) => NextResponse.json({ error: missing(e) ? MIGRATION : "Couldn't save that." }, { status: missing(e) ? 503 : 500 });

  switch (b.action) {
    case "add": {
      // From Swipe, a job page or a company's jobs: the role is already in Backchannel.
      const jobId = clip(b.job_id, 64);
      if (!jobId) return NextResponse.json({ error: "Missing role." }, { status: 400 });
      const { data: job } = await db.from("jobs").select("title, url, company_name, companies(name)").eq("id", jobId).maybeSingle();
      if (!job) return NextResponse.json({ error: "That role is no longer available." }, { status: 404 });
      const j = job as unknown as { title: string; url: string | null; company_name: string | null; companies: { name: string } | null };
      const source = ["swipe", "job", "company"].includes(b.source) ? b.source : "job";
      const { data, error } = await db.from("targets").upsert(
        { user_id: user.id, job_id: jobId, company: formatCompanyName(j.companies?.name ?? j.company_name ?? ""), title: j.title, url: "", source, updated_at: now },
        { onConflict: "user_id,job_id", ignoreDuplicates: true },
      ).select("id").maybeSingle();
      if (error) return fail(error);
      return NextResponse.json({ ok: true, id: data?.id ?? null, existed: !data });
    }
    case "add_link": {
      // A role from anywhere on the web: a pasted link with the title and company the page gave.
      const url = clip(b.url, 1500);
      const title = clip(b.title, 200);
      const company = clip(b.company, 200);
      if (!url && !(title && company)) return NextResponse.json({ error: "Add a link, or a company and a role title." }, { status: 400 });
      const { data, error } = await db.from("targets").upsert(
        { user_id: user.id, job_id: null, company: formatCompanyName(company), title: title || "Role", url: url ? canonicalUrl(url) : "", source: "link", updated_at: now },
        { onConflict: "user_id,url", ignoreDuplicates: true },
      ).select("id").maybeSingle();
      if (error) {
        // Without a link there is nothing to dedupe on, so a plain insert is used.
        if (!url) {
          const ins = await db.from("targets").insert({ user_id: user.id, company: formatCompanyName(company), title: title || "Role", url: "", source: "link" }).select("id").maybeSingle();
          if (ins.error) return fail(ins.error);
          return NextResponse.json({ ok: true, id: ins.data?.id ?? null });
        }
        return fail(error);
      }
      return NextResponse.json({ ok: true, id: data?.id ?? null, existed: !data });
    }
    case "toggle": {
      if (!isStepKey(b.step)) return NextResponse.json({ error: "Unknown step." }, { status: 400 });
      const { data: row, error: readError } = await db.from("targets").select("steps").eq("id", b.id).eq("user_id", user.id).maybeSingle();
      if (readError) return fail(readError);
      if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
      const steps = { ...cleanSteps(row.steps), [b.step]: b.done === true };
      const { error } = await db.from("targets").update({ steps, updated_at: now }).eq("id", b.id).eq("user_id", user.id);
      if (error) return fail(error);
      return NextResponse.json({ ok: true, steps });
    }
    case "strategy": {
      const { error } = await db.from("targets").update({ strategy: cleanStrategy(b.strategy), updated_at: now }).eq("id", b.id).eq("user_id", user.id);
      if (error) return fail(error);
      return NextResponse.json({ ok: true });
    }
    case "notes": {
      const { error } = await db.from("targets").update({ notes: clip(b.notes, 4000), updated_at: now }).eq("id", b.id).eq("user_id", user.id);
      if (error) return fail(error);
      return NextResponse.json({ ok: true });
    }
    case "remove": {
      const { error } = await db.from("targets").delete().eq("id", b.id).eq("user_id", user.id);
      if (error) return fail(error);
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}

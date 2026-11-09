import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { PageHeader } from "@/components/ui";
import { gmailConfigured } from "@/lib/outreach/gmail";
import { hasAIKey } from "@/lib/ai";
import OutreachClient, { type ContactRow, type JobOption } from "./OutreachClient";

export const dynamic = "force-dynamic";

export default async function OutreachPage({ searchParams }: { searchParams: Promise<{ gmail?: string }> }) {
  const sp = await searchParams;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const uid = user?.id ?? "";
  const [{ data: contacts }, { data: steps }, { data: prefs }, { data: gmail }, { data: jobs }] = await Promise.all([
    db.from("contacts").select("id, name, title, email, linkedin_url, company_name, notes, created_at").eq("user_id", uid).order("created_at", { ascending: false }),
    db.from("outreach").select("id, contact_id, step_index, channel, status, subject, body, scheduled_for, sent_at, error").eq("user_id", uid).order("step_index"),
    db.from("preferences").select("email_daily_limit, email_signature").eq("user_id", uid).maybeSingle(),
    serviceClient().from("gmail_accounts").select("email").eq("user_id", uid).maybeSingle(),
    db.from("job_scores").select("job_id, score, jobs!inner(title, is_active, companies(name))").eq("user_id", uid).eq("jobs.is_active", true).order("score", { ascending: false }).limit(60),
  ]);
  const rows: ContactRow[] = (contacts ?? []).map((c) => ({ ...c, steps: (steps ?? []).filter((s) => s.contact_id === c.id) }));
  const jobOptions: JobOption[] = (jobs ?? []).map((j) => {
    const x = j.jobs as unknown as { title: string; companies: { name: string } | null };
    return { id: j.job_id, label: `${x.companies?.name ?? ""} · ${x.title}`, company: x.companies?.name ?? "" };
  });
  const since = Date.now() - 24 * 3600 * 1000;
  const sentToday = (steps ?? []).filter((s) => s.channel === "email" && s.sent_at && new Date(s.sent_at).getTime() > since).length;

  return (
    <section className="py-6">
      <PageHeader eyebrow="Outreach · email + LinkedIn" title="Get in front of the people who hire">
        Add a hiring manager or recruiter and AI writes a short, personal sequence from your real numbers: three emails from your own Gmail and two LinkedIn steps you send yourself. You approve the first email; follow-ups go out each morning and stop as soon as they reply.
      </PageHeader>
      <OutreachClient
        contacts={rows} jobs={jobOptions} gmailEmail={gmail?.email ?? null} gmailReady={gmailConfigured()} aiReady={hasAIKey()}
        notice={sp.gmail ?? null} sentToday={sentToday}
        settings={{ limit: prefs?.email_daily_limit ?? 20, signature: prefs?.email_signature ?? "" }}
      />
    </section>
  );
}

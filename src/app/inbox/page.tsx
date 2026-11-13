import Link from "next/link";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { Card, PageHeader, Pill } from "@/components/ui";
import { accessToken, gmailConfigured, listInbox } from "@/lib/outreach/gmail";
import { INBOX_QUERY, KIND_LABEL, routeMails, type AppRef, type RoutedMail } from "@/lib/inbox-routing";
import { formatCompanyName } from "@/lib/company-name";
import StageButton from "./StageButton";

export const dynamic = "force-dynamic";

const TONE = { interview: "good", offer: "signal", assessment: "accent", rejection: "warn", received: "neutral", other: "neutral" } as const;

async function load(uid: string): Promise<{ state: "off" | "error" | "ok"; mails: RoutedMail[]; email?: string; error?: string }> {
  if (!gmailConfigured()) return { state: "off", mails: [] };
  const { data: acct } = await serviceClient().from("gmail_accounts").select("email, refresh_token").eq("user_id", uid).maybeSingle();
  if (!acct) return { state: "off", mails: [] };
  const db = await createClient();
  const { data: rows } = await db.from("applications").select("id, stage, jobs(title, company_name, companies(name))").eq("user_id", uid).limit(500);
  const apps: AppRef[] = (rows ?? []).map((r) => {
    const j = r.jobs as unknown as { title: string; company_name: string | null; companies: { name: string } | null } | null;
    return { id: r.id as string, stage: (r.stage as string | null) ?? null, title: j?.title ?? "", company: formatCompanyName(j?.companies?.name ?? j?.company_name ?? "") };
  });
  try {
    const token = await accessToken(acct.refresh_token);
    const items = await listInbox(token, INBOX_QUERY);
    return { state: "ok", mails: routeMails(items, apps), email: acct.email };
  } catch (e) {
    return { state: "error", mails: [], error: e instanceof Error ? e.message : "Couldn't read your Gmail." };
  }
}

export default async function InboxPage() {
  const user = await getSessionUser();
  const data = await load(user?.id ?? "");
  const routed = data.mails.filter((m) => m.app);
  const loose = data.mails.filter((m) => !m.app);

  const row = (m: RoutedMail) => (
    <li key={m.id}>
      <Card className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm text-muted">{m.from.replace(/<.*>/, "").trim() || m.from} · {m.date ? new Date(m.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""}</p>
            <h2 className="text-base font-bold leading-snug">{m.subject || "(no subject)"}</h2>
          </div>
          <Pill tone={TONE[m.kind]}>{KIND_LABEL[m.kind]}</Pill>
        </div>
        <p className="line-clamp-2 text-sm text-muted">{m.snippet}</p>
        {m.app && (
          <p className="text-sm">For <Link href={`/applications`} className="font-semibold text-accent">{m.app.title || "your application"}{m.app.company ? ` at ${m.app.company}` : ""}</Link></p>
        )}
        <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
          {m.app && m.suggestedStage && <StageButton applicationId={m.app.id} stage={m.suggestedStage} />}
          <a href={`https://mail.google.com/mail/u/0/#inbox/${m.threadId}`} target="_blank" rel="noopener noreferrer" className="text-accent">Open in Gmail ↗</a>
        </div>
      </Card>
    </li>
  );

  return (
    <section className="py-6">
      <PageHeader eyebrow="Applications" title="Replies from companies">
        Job-related mail from the last 30 days, matched to the application it belongs to. Backchannel only reads; it never replies or moves a stage without your tap.
      </PageHeader>
      {data.state === "off" && <Card><p className="text-sm">Connect your Gmail to see replies here. <Link href="/outreach" className="font-semibold text-accent">Connect Gmail</Link></p></Card>}
      {data.state === "error" && <Card><p role="alert" className="text-sm text-warn">{data.error}</p><p className="mt-2 text-sm text-muted">If this keeps happening, reconnect Gmail on the <Link href="/outreach" className="font-semibold text-accent">Messages page</Link>.</p></Card>}
      {data.state === "ok" && data.mails.length === 0 && <Card><p className="text-sm text-muted">No job-related mail in the last 30 days in {data.email}.</p></Card>}
      {routed.length > 0 && <><h2 className="mb-3 text-lg font-semibold">Matched to an application</h2><ul className="mb-8 flex flex-col gap-3">{routed.map(row)}</ul></>}
      {loose.length > 0 && <><h2 className="mb-1 text-lg font-semibold">Not matched to any application</h2><p className="mb-3 text-sm text-muted">Could be recruiters reaching out first, or mail from a company you haven&apos;t applied to.</p><ul className="flex flex-col gap-3">{loose.map(row)}</ul></>}
    </section>
  );
}

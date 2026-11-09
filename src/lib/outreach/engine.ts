import type { SupabaseClient } from "@supabase/supabase-js";
import { aiJson, hasAIKey, NO_AI_MESSAGE } from "@/lib/ai";
import { accessToken, sendEmail, threadState } from "./gmail";
import { MAX_EMAILS_PER_DAY, bouncePaused, effectiveDailyLimit } from "./limits";
import { OPT_OUT, autoSendDecision, renderTemplate } from "./templates";
import { inRecipientWindow, recipientTimezone } from "./timezone";

export { MAX_EMAILS_PER_DAY, OPT_OUT };
import { isExcludedCompany } from "@/data/companies";
import { htmlToText } from "@/lib/collector/fetchers";

const DAY = 24 * 3600 * 1000;

// Day offset, channel, which generated text to use
export const SEQUENCE: { day: number; channel: "email" | "linkedin_task"; key: "email1" | "email2" | "email3" | "li_connect" | "li_message"; label: string }[] = [
  { day: 0, channel: "email", key: "email1", label: "Intro email" },
  { day: 2, channel: "linkedin_task", key: "li_connect", label: "LinkedIn connection request" },
  { day: 4, channel: "email", key: "email2", label: "Follow-up with a proof point" },
  { day: 7, channel: "linkedin_task", key: "li_message", label: "LinkedIn message (if connected)" },
  { day: 10, channel: "email", key: "email3", label: "Short final note" },
];

type Gen = { subject: string; email1: string; email2: string; email3: string; li_connect: string; li_message: string };

export async function isBlocked(db: SupabaseClient, userId: string, email: string, company: string, name = "") {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (isExcludedCompany(company, domain)) return true;
  const { data } = await db.from("blocklist").select("type, value").eq("user_id", userId);
  return (data ?? []).some((b: { type: string; value: string }) => {
    const v = b.value.toLowerCase().trim();
    if (!v) return false;
    if (b.type === "domain") return domain === v || domain.endsWith("." + v) || domain.includes(v);
    if (b.type === "company") return company.toLowerCase().includes(v);
    return email.toLowerCase().includes(v) || (!!name && name.toLowerCase().includes(v));
  });
}

/** Writes the 3 emails + 2 LinkedIn notes for one contact, using only facts from the user's profile. */
export async function generateSequence(db: SupabaseClient, userId: string, c: { name: string; title?: string | null; company_name: string; notes?: string | null; job_id?: string | null }) {
  if (!hasAIKey()) throw new Error(NO_AI_MESSAGE);
  const [{ data: p }, { data: prefs }, jobRes] = await Promise.all([
    db.from("profiles").select("name, current_role, years_in_sales, quota_attainment_pct, meetings_per_month, segment, motion, tools, cv_text").eq("user_id", userId).maybeSingle(),
    db.from("preferences").select("email_signature").eq("user_id", userId).maybeSingle(),
    c.job_id ? db.from("jobs").select("title, description").eq("id", c.job_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const job = jobRes.data as { title: string; description: string } | null;
  const facts = [
    p?.current_role && `Role: ${p.current_role}`, p?.years_in_sales && `Years in sales: ${p.years_in_sales}`,
    p?.quota_attainment_pct && `Quota attainment: ${p.quota_attainment_pct}%`, p?.meetings_per_month && `Meetings booked per month: ${p.meetings_per_month}`,
    p?.segment && `Segment: ${p.segment}`, p?.motion && `Motion: ${p.motion}`, p?.tools?.length && `Tools: ${p.tools.join(", ")}`,
  ].filter(Boolean).join("\n");

  const g = await aiJson<Gen>(
    `You write short, human outreach from a B2B sales professional to someone who hires at a company they want to join.
Rules: only use facts given about the sender; never invent numbers, names, mutual connections or company news. If no company news is given, don't claim any.
Plain text, no em-dashes, no buzzwords, no "I hope this finds you well". Each email 70-120 words with one clear ask (a 15-minute call or the right person to talk to). Sign off with the sender's first name only.`,
    `SENDER FACTS:\n${facts || "(only the name is known)"}\nSender name: ${p?.name ?? ""}\n${p?.cv_text ? `CV excerpt:\n${p.cv_text.slice(0, 3000)}` : ""}
RECIPIENT: ${c.name}${c.title ? `, ${c.title}` : ""} at ${c.company_name}
${job ? `ROLE THEY'RE HIRING FOR: ${job.title}\n${htmlToText(job.description ?? "").slice(0, 2500)}` : "No specific open role; ask about upcoming sales hiring."}
${c.notes ? `SENDER'S NOTES ABOUT THIS PERSON: ${c.notes}` : ""}

Return JSON: {"subject": "short, specific subject (max 7 words)", "email1": "intro", "email2": "follow-up 4 days later, adds one proof point from the facts", "email3": "brief final note 10 days later", "li_connect": "LinkedIn connection note, max 280 characters", "li_message": "LinkedIn message after connecting, max 500 characters"}`,
    { maxTokens: 1800 }
  );
  const sig = prefs?.email_signature?.trim();
  const finish = (b: string) => `${b.trim()}${sig ? `\n\n${sig}` : ""}\n\n${OPT_OUT}`;
  return { ...g, email1: finish(g.email1), email2: finish(g.email2), email3: finish(g.email3) };
}

/** The owner's approved template filled in for this contact, but only when auto-send is allowed. Otherwise null. */
async function autoSendPlan(db: SupabaseClient, userId: string, input: { name: string; email?: string; company_name: string; job_id?: string | null }) {
  if (!input.email) return null;
  const [{ data: prefs }, { data: tpl }, { data: prof }, scoreRes, jobRes] = await Promise.all([
    db.from("preferences").select("autosend_enabled, autosend_min_fit, email_ramp_start, email_signature").eq("user_id", userId).maybeSingle(),
    db.from("outreach_templates").select("subject, body, approved_at").eq("user_id", userId).eq("name", "Default").maybeSingle(),
    db.from("profiles").select("name").eq("user_id", userId).maybeSingle(),
    input.job_id ? db.from("job_scores").select("score").eq("user_id", userId).eq("job_id", input.job_id).maybeSingle() : Promise.resolve({ data: null }),
    input.job_id ? db.from("jobs").select("title").eq("id", input.job_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const decision = autoSendDecision({
    enabled: prefs?.autosend_enabled === true, templateApproved: !!tpl?.approved_at,
    fit: (scoreRes.data as { score: number | null } | null)?.score ?? null, minFit: prefs?.autosend_min_fit ?? 75,
    rampStart: prefs?.email_ramp_start ?? null, recipientName: input.name,
  });
  const sender = (prof?.name ?? "").trim();
  if (!decision.auto || !tpl || !sender) return null;
  return renderTemplate(tpl, {
    first_name: input.name.trim().split(/\s+/)[0], company: input.company_name,
    role_title: (jobRes.data as { title: string } | null)?.title ?? "a sales role", sender_name: sender,
  }, prefs?.email_signature);
}

/** Creates the contact and its 5-step sequence. The first email starts as a draft for you to approve. */
export async function startSequence(db: SupabaseClient, userId: string, input: { name: string; title?: string; email?: string; linkedin_url?: string; company_name: string; job_id?: string | null; notes?: string }) {
  if (input.email && (await isBlocked(db, userId, input.email, input.company_name, input.name))) {
    throw new Error(`${input.company_name} is on your blocklist (stealth). Backchannel won't contact them.`);
  }
  if (isExcludedCompany(input.company_name)) throw new Error(`${input.company_name} is excluded. Backchannel won't contact them.`);
  const g = await generateSequence(db, userId, { ...input, job_id: input.job_id ?? null });
  const { data: contact, error } = await db.from("contacts").insert({
    user_id: userId, name: input.name, title: input.title || null, email: input.email || null, linkedin_url: input.linkedin_url || null,
    company_name: input.company_name, job_id: input.job_id || null, notes: input.notes || null, source: "manual",
  }).select("id").single();
  if (error) throw new Error(`Saving the contact failed: ${error.message}`);

  const auto = await autoSendPlan(db, userId, input);
  const start = Date.now();
  const rows = SEQUENCE
    .filter((s) => (s.channel === "email" ? !!input.email : true))
    .map((s) => ({
      user_id: userId, contact_id: contact.id, step_index: SEQUENCE.indexOf(s), channel: s.channel,
      // Every email starts as a draft and stays one until you approve it. The only exception is the
      // first email when auto-send is on and allowed: it goes out from your approved template, not AI text.
      status: s.channel === "email" ? (auto && s.key === "email1" ? "scheduled" : "draft") : "task_open",
      subject: auto && s.key === "email1" ? auto.subject : s.channel === "email" ? (s.key === "email1" ? g.subject : `Re: ${g.subject}`) : s.label,
      body: auto && s.key === "email1" ? auto.body : g[s.key], to_email: s.channel === "email" ? input.email : null,
      scheduled_for: new Date(start + s.day * DAY).toISOString(),
    }));
  const { error: e2 } = await db.from("outreach").insert(rows);
  if (e2) throw new Error(`Saving the sequence failed: ${e2.message}`);
  return { contact_id: contact.id as string, steps: rows.length };
}

/** Sent and bounced counts over the last 14 days, used to pause automatic sending when addresses are bad. */
async function recentBounceStats(svc: SupabaseClient, userId: string) {
  const since = new Date(Date.now() - 14 * DAY).toISOString();
  const { data } = await svc.from("outreach").select("status, error").eq("user_id", userId).eq("channel", "email").gte("sent_at", since);
  const rows = data ?? [];
  return { sent: rows.length, bounced: rows.filter((r: { status: string; error: string | null }) => r.status === "failed" && r.error === "Bounced").length };
}

async function markBounced(svc: SupabaseClient, contactId: string) {
  await svc.from("outreach").update({ status: "failed", error: "Bounced" }).eq("contact_id", contactId).eq("status", "sent");
  await stopContact(svc, contactId, "stopped");
}

async function sentToday(svc: SupabaseClient, userId: string) {
  const { count } = await svc.from("outreach").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("channel", "email").gte("sent_at", new Date(Date.now() - DAY).toISOString());
  return count ?? 0;
}

/** Sends one email step now (respects the daily limit, blocklist and stop-on-reply). Uses the service client. */
export async function sendStep(svc: SupabaseClient, userId: string, outreachId: string, opts: { auto?: boolean } = {}) {
  const [{ data: step }, { data: acct }, { data: prefs }] = await Promise.all([
    svc.from("outreach").select("id, contact_id, status, subject, body, to_email, step_index, contacts(company_name, email, name, job_id)").eq("id", outreachId).eq("user_id", userId).single(),
    svc.from("gmail_accounts").select("email, refresh_token").eq("user_id", userId).maybeSingle(),
    svc.from("preferences").select("email_daily_limit, email_ramp_start").eq("user_id", userId).maybeSingle(),
  ]);
  if (!step) throw new Error("That email no longer exists.");
  if (!acct) throw new Error("Connect your Gmail first.");
  if (!["draft", "scheduled", "failed"].includes(step.status)) throw new Error("This email was already sent or stopped.");
  const contact = step.contacts as unknown as { company_name: string; email: string; name: string; job_id: string | null } | null;
  const to = step.to_email ?? contact?.email;
  if (!to) throw new Error("This contact has no email address.");
  if (opts.auto) {
    // Automatic sends wait for the recipient's own morning. Manual sends (you click Send) have no time restriction.
    const { data: job } = contact?.job_id ? await svc.from("jobs").select("market, location").eq("id", contact.job_id).maybeSingle() : { data: null };
    const tz = recipientTimezone({ market: job?.market, location: job?.location, email: to });
    if (!inRecipientWindow(tz)) throw new Error(`Waiting for the recipient's morning (${tz}).`);
  }
  if (await isBlocked(svc, userId, to, contact?.company_name ?? "", contact?.name ?? "")) throw new Error("Blocked by your stealth list.");
  if (opts.auto) {
    const stats = await recentBounceStats(svc, userId);
    if (bouncePaused(stats.sent, stats.bounced)) throw new Error("Automatic sending is paused: more than 2% of recent emails bounced. Check your addresses.");
  }
  const limit = effectiveDailyLimit(prefs?.email_daily_limit, prefs?.email_ramp_start);
  if ((await sentToday(svc, userId)) >= limit) throw new Error(`Daily limit of ${limit} emails reached (warm-up ramps 5, 10, 15, then 20 a day). It will go out tomorrow.`);

  // Reuse the thread of the earlier email so follow-ups land as replies.
  const { data: prev } = await svc.from("outreach").select("gmail_thread_id").eq("contact_id", step.contact_id).not("gmail_thread_id", "is", null).limit(1);
  const threadId = prev?.[0]?.gmail_thread_id ?? null;
  const token = await accessToken(acct.refresh_token);
  const state = threadId ? await threadState(token, threadId, acct.email) : { reply: false, bounce: false };
  if (state.bounce) {
    await markBounced(svc, step.contact_id);
    throw new Error("That address bounced, so the sequence stopped.");
  }
  if (state.reply) {
    await stopContact(svc, step.contact_id, "replied");
    throw new Error("They already replied, so the sequence stopped.");
  }
  try {
    const sent = await sendEmail(token, { from: acct.email, to, subject: step.subject ?? "", body: step.body ?? "", threadId });
    await svc.from("outreach").update({ status: "sent", sent_at: new Date().toISOString(), gmail_message_id: sent.id, gmail_thread_id: sent.threadId, error: null }).eq("id", step.id);
    await svc.from("funnel_events").insert({ user_id: userId, type: "outreach_sent", ref_id: step.id });
    if (!prefs?.email_ramp_start) await svc.from("preferences").upsert({ user_id: userId, email_ramp_start: new Date().toISOString() }, { onConflict: "user_id" });
    // Once the first email is sent, later steps get due dates from today. They stay drafts: you approve each one.
    if (step.step_index === 0) {
      const { data: later } = await svc.from("outreach").select("id, step_index").eq("contact_id", step.contact_id).gt("step_index", 0);
      await Promise.all((later ?? []).map((l: { id: string; step_index: number }) =>
        svc.from("outreach").update({ scheduled_for: new Date(Date.now() + SEQUENCE[l.step_index].day * DAY).toISOString() }).eq("id", l.id)));
    }
    return sent;
  } catch (e) {
    await svc.from("outreach").update({ status: "failed", error: (e as Error).message }).eq("id", step.id);
    throw e;
  }
}

export async function stopContact(svc: SupabaseClient, contactId: string, why: "replied" | "stopped") {
  await svc.from("outreach").update({ status: "stopped" }).eq("contact_id", contactId).in("status", ["draft", "scheduled", "failed", "task_open"]);
  if (why === "replied") {
    const { data: last } = await svc.from("outreach").select("id, user_id").eq("contact_id", contactId).eq("status", "sent").order("sent_at", { ascending: false }).limit(1);
    if (last?.[0]) {
      await svc.from("outreach").update({ status: "replied" }).eq("id", last[0].id);
      await svc.from("funnel_events").insert({ user_id: last[0].user_id, type: "reply", ref_id: last[0].id });
    }
  }
}

/** Daily run: detect replies (and stop those sequences), then send due follow-ups within the limit. */
export async function runOutreach(svc: SupabaseClient, userId: string, deadline: number) {
  const { data: acct } = await svc.from("gmail_accounts").select("email, refresh_token").eq("user_id", userId).maybeSingle();
  if (!acct) return { replies: 0, sent: 0, reason: "Gmail not connected" };
  const token = await accessToken(acct.refresh_token);

  let replies = 0;
  let bounces = 0;
  const { data: sent } = await svc.from("outreach").select("contact_id, gmail_thread_id").eq("user_id", userId).eq("status", "sent").not("gmail_thread_id", "is", null);
  const threads = [...new Map((sent ?? []).map((s: { contact_id: string; gmail_thread_id: string }) => [s.contact_id, s.gmail_thread_id])).entries()];
  for (const [contactId, threadId] of threads) {
    if (Date.now() > deadline) break;
    try {
      const state = await threadState(token, threadId, acct.email);
      if (state.bounce) { await markBounced(svc, contactId); bounces++; }
      else if (state.reply) { await stopContact(svc, contactId, "replied"); replies++; }
    } catch { /* skip */ }
  }

  const stats = await recentBounceStats(svc, userId);
  if (bouncePaused(stats.sent, stats.bounced)) return { replies, bounces, sent: 0, reason: "Auto-send paused: more than 2% of recent emails bounced" };

  let delivered = 0;
  const { data: due } = await svc.from("outreach").select("id").eq("user_id", userId).eq("channel", "email").eq("status", "scheduled")
    .lte("scheduled_for", new Date().toISOString()).order("scheduled_for").limit(50);
  for (const d of due ?? []) {
    if (Date.now() > deadline) break;
    try { await sendStep(svc, userId, d.id, { auto: true }); delivered++; } catch (e) { if (/Daily limit/.test((e as Error).message)) break; }
  }
  return { replies, bounces, sent: delivered };
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { generateSequence, OPT_OUT, sendStep, startSequence, stopContact } from "@/lib/outreach/engine";
import { rateLimit, retryAfter } from "@/lib/rate-limit";
import { validateTemplate } from "@/lib/outreach/templates";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));

  try {
    switch (b.action) {
      case "add_contact": {
        if (!rateLimit(`seq:${user.id}`, 30, 3600_000)) return NextResponse.json({ error: `Slow down a little. Try again in ${retryAfter(`seq:${user.id}`)}s.` }, { status: 429 });
        const name = String(b.name ?? "").trim(), company = String(b.company_name ?? "").trim();
        const email = String(b.email ?? "").trim();
        if (!name || !company) return NextResponse.json({ error: "Name and company are required." }, { status: 400 });
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "That email address doesn't look right." }, { status: 400 });
        if (!email && !b.linkedin_url) return NextResponse.json({ error: "Add an email address or a LinkedIn profile link." }, { status: 400 });
        const r = await startSequence(db, user.id, { name, company_name: company, email, title: b.title, linkedin_url: b.linkedin_url, job_id: b.job_id || null, notes: b.notes });
        return NextResponse.json({ ok: true, ...r });
      }
      case "edit_step": {
        const patch: Record<string, string> = {};
        if (typeof b.subject === "string") patch.subject = b.subject;
        if (typeof b.body === "string") patch.body = b.body.includes(OPT_OUT) || b.channel === "linkedin_task" ? b.body : `${b.body.trim()}\n\n${OPT_OUT}`;
        const { error } = await db.from("outreach").update(patch).eq("id", b.id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "send_now": {
        const { data: own } = await db.from("outreach").select("id").eq("id", b.id).maybeSingle();
        if (!own) return NextResponse.json({ error: "Email not found." }, { status: 404 });
        await sendStep(serviceClient(), user.id, b.id);
        return NextResponse.json({ ok: true });
      }
      case "task_done": {
        const { error } = await db.from("outreach").update({ status: "task_done", sent_at: new Date().toISOString() }).eq("id", b.id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "mark_replied":
      case "stop": {
        const { data: own } = await db.from("contacts").select("id").eq("id", b.contact_id).maybeSingle();
        if (!own) return NextResponse.json({ error: "Contact not found." }, { status: 404 });
        await stopContact(serviceClient(), b.contact_id, b.action === "mark_replied" ? "replied" : "stopped");
        return NextResponse.json({ ok: true });
      }
      case "regenerate": {
        const { data: c } = await db.from("contacts").select("name, title, company_name, notes, job_id").eq("id", b.contact_id).single();
        if (!c) return NextResponse.json({ error: "Contact not found." }, { status: 404 });
        const g = await generateSequence(db, user.id, c);
        const { data: steps } = await db.from("outreach").select("id, step_index, channel, status").eq("contact_id", b.contact_id);
        const keys = ["email1", "li_connect", "email2", "li_message", "email3"] as const;
        await Promise.all((steps ?? []).filter((s) => ["draft", "scheduled", "task_open"].includes(s.status)).map((s) =>
          db.from("outreach").update({ body: g[keys[s.step_index]], ...(s.channel === "email" ? { subject: s.step_index === 0 ? g.subject : `Re: ${g.subject}` } : {}) }).eq("id", s.id)));
        return NextResponse.json({ ok: true });
      }
      case "delete_contact": {
        const { error } = await db.from("contacts").delete().eq("id", b.contact_id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "settings": {
        const patch: Record<string, unknown> = { user_id: user.id };
        if (Number.isFinite(b.email_daily_limit)) patch.email_daily_limit = Math.max(1, Math.min(20, Number(b.email_daily_limit)));
        if (typeof b.email_signature === "string") patch.email_signature = b.email_signature.slice(0, 500);
        const { error } = await db.from("preferences").upsert(patch, { onConflict: "user_id" });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "save_template": {
        const subject = String(b.subject ?? "").trim(), body = String(b.body ?? "").trim();
        const problem = validateTemplate(subject, body);
        if (problem) return NextResponse.json({ error: problem }, { status: 400 });
        // Any edit removes the approval: only the exact text you approved can auto-send.
        const { error } = await db.from("outreach_templates").upsert(
          { user_id: user.id, name: "Default", subject, body, approved_at: null, updated_at: new Date().toISOString() },
          { onConflict: "user_id,name" });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "approve_template": {
        const { data: t } = await db.from("outreach_templates").select("subject, body").eq("user_id", user.id).eq("name", "Default").maybeSingle();
        if (!t) return NextResponse.json({ error: "Save a template first." }, { status: 400 });
        const problem = validateTemplate(t.subject, t.body);
        if (problem) return NextResponse.json({ error: problem }, { status: 400 });
        const { error } = await db.from("outreach_templates").update({ approved_at: new Date().toISOString() }).eq("user_id", user.id).eq("name", "Default");
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "autosend_settings": {
        const enabled = b.enabled === true;
        const minFit = Math.max(60, Math.min(95, Math.round(Number(b.min_fit) || 75)));
        if (enabled) {
          const [{ data: t }, { data: g }] = await Promise.all([
            db.from("outreach_templates").select("approved_at").eq("user_id", user.id).eq("name", "Default").maybeSingle(),
            serviceClient().from("gmail_accounts").select("email").eq("user_id", user.id).maybeSingle(),
          ]);
          if (!t?.approved_at) return NextResponse.json({ error: "Approve a template first." }, { status: 400 });
          if (!g) return NextResponse.json({ error: "Connect your Gmail first." }, { status: 400 });
        }
        const { error } = await db.from("preferences").upsert({ user_id: user.id, autosend_enabled: enabled, autosend_min_fit: minFit }, { onConflict: "user_id" });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message ?? "Something went wrong." }, { status: 500 });
  }
}

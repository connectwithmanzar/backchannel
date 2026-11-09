import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiText, hasAIKey, NO_AI_MESSAGE } from "@/lib/ai";
import { isExcludedCompany } from "@/data/companies";

export const runtime = "nodejs";
export const maxDuration = 60;
const STAGES = ["to_ask", "asked", "agreed", "referred", "interview", "declined"];

export async function POST(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const now = new Date().toISOString();
  try {
    switch (b.action) {
      case "add": {
        const company = String(b.company_name ?? "").trim(), who = String(b.referrer_name ?? "").trim();
        if (!company || !who) return NextResponse.json({ error: "Company and the person's name are required." }, { status: 400 });
        if (isExcludedCompany(company)) return NextResponse.json({ error: `${company} is excluded.` }, { status: 400 });
        const { data, error } = await db.from("referrals").insert({
          user_id: user.id, company_name: company, referrer_name: who, role_title: b.role_title || null, job_id: b.job_id || null,
          referrer_relation: b.referrer_relation || null, channel: ["linkedin", "email", "whatsapp", "other"].includes(b.channel) ? b.channel : "linkedin",
          follow_up_on: b.follow_up_on || null,
        }).select("id").single();
        if (error) throw error;
        return NextResponse.json({ ok: true, id: data.id });
      }
      case "draft": {
        if (!hasAIKey()) return NextResponse.json({ error: NO_AI_MESSAGE }, { status: 503 });
        const { data: r } = await db.from("referrals").select("*").eq("id", b.id).single();
        if (!r) return NextResponse.json({ error: "Not found." }, { status: 404 });
        const [{ data: p }, jobRes] = await Promise.all([
          db.from("profiles").select("name, current_role, years_in_sales, quota_attainment_pct, meetings_per_month, segment, motion, tools").eq("user_id", user.id).maybeSingle(),
          r.job_id ? db.from("jobs").select("title, url").eq("id", r.job_id).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        const job = jobRes.data as { title: string; url: string } | null;
        const facts = p ? Object.entries(p).filter(([, v]) => v && (!Array.isArray(v) || v.length)).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join("\n") : "";
        const msg = await aiText(
          `Write a short referral request from a sales professional to someone they know. Warm, specific, easy to say yes to. Use only the facts given; never invent shared history. No em-dashes. Max ${r.channel === "linkedin" || r.channel === "whatsapp" ? 600 : 900} characters. End by offering to send a short blurb and CV they can forward.`,
          `Sender facts:\n${facts}\nRecipient: ${r.referrer_name}${r.referrer_relation ? ` (${r.referrer_relation})` : ""} at ${r.company_name}\nRole: ${job?.title ?? r.role_title ?? "a sales role there"}${job?.url ? ` (${job.url})` : ""}\nChannel: ${r.channel}`,
          { maxTokens: 500 }
        );
        await db.from("referrals").update({ message: msg, updated_at: now }).eq("id", b.id);
        return NextResponse.json({ ok: true, message: msg });
      }
      case "update": {
        const patch: Record<string, unknown> = { updated_at: now };
        if (STAGES.includes(b.stage)) patch.stage = b.stage;
        if (typeof b.message === "string") patch.message = b.message;
        if (typeof b.notes === "string") patch.notes = b.notes;
        if (b.follow_up_on !== undefined) patch.follow_up_on = b.follow_up_on || null;
        const { error } = await db.from("referrals").update(patch).eq("id", b.id);
        if (error) throw error;
        if (b.stage === "referred") await db.from("funnel_events").insert({ user_id: user.id, type: "referral", ref_id: b.id });
        if (b.stage === "interview") await db.from("funnel_events").insert({ user_id: user.id, type: "interview", ref_id: b.id });
        return NextResponse.json({ ok: true });
      }
      case "delete": {
        const { error } = await db.from("referrals").delete().eq("id", b.id);
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

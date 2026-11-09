import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAIClient, hasAIKey, AI_MODEL, NO_AI_MESSAGE, untrusted, DATA_NOTICE } from "@/lib/ai";
import { rateLimitShared } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/chat { messages: [{role, content}] } — "Ask Backchannel", answers from the user's own data.
export async function POST(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!hasAIKey()) return NextResponse.json({ error: NO_AI_MESSAGE }, { status: 503 });
  if (!(await rateLimitShared(`chat:${user.id}`, 60, 3600_000))) return NextResponse.json({ error: "You've sent a lot of messages. Try again in a bit." }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const history = (Array.isArray(body.messages) ? body.messages : []).slice(-12)
    .filter((m: { role: string; content: string }) => ["user", "assistant"].includes(m.role) && typeof m.content === "string")
    .map((m: { role: "user" | "assistant"; content: string }) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!history.length) return NextResponse.json({ error: "Ask me something." }, { status: 400 });

  const [{ data: profile }, { data: scores }, { data: apps }, { data: refs }, { data: contacts }, { data: insights }] = await Promise.all([
    db.from("profiles").select("name, current_role, years_in_sales, quota_attainment_pct, meetings_per_month, segment, motion, tools, markets").eq("user_id", user.id).maybeSingle(),
    db.from("job_scores").select("score, reaction, explanation, jobs!inner(title, location, url, currency, base_min, base_max, ote_min, ote_max, visa_sponsorship, remote_type, is_active, companies(name))").eq("user_id", user.id).eq("jobs.is_active", true).order("score", { ascending: false }).limit(40),
    db.from("applications").select("status, stage, submitted_at, jobs(title, companies(name))").eq("user_id", user.id).limit(50),
    db.from("referrals").select("company_name, referrer_name, stage, follow_up_on").eq("user_id", user.id).limit(50),
    db.from("contacts").select("name, company_name").eq("user_id", user.id).limit(50),
    db.from("company_insights").select("why_great, criteria_tags, companies(name, country)").eq("user_id", user.id).eq("hidden", false).limit(40),
  ]);

  const roles = (scores ?? []).map((s) => {
    const j = s.jobs as unknown as Record<string, unknown> & { companies: { name: string } | null };
    const pay = j.ote_max ?? j.base_max ? `${j.currency ?? ""} ${j.ote_min ?? j.base_min ?? ""}-${j.ote_max ?? j.base_max} ${j.ote_max ? "OTE" : "base"}` : "pay not published";
    return `- ${s.score}% | ${j.title} | ${j.companies?.name} | ${j.location} | ${j.remote_type} | ${pay} | visa: ${j.visa_sponsorship}${s.reaction ? ` | you: ${s.reaction}` : ""} | ${j.url}`;
  }).join("\n");

  const context = `TODAY: ${new Date().toDateString()}
USER PROFILE: ${JSON.stringify(profile ?? {})}
TOP MATCHING OPEN ROLES (fit% | title | company | location | work type | pay | visa | user's reaction | link):
${roles || "(none collected yet)"}
APPLICATIONS: ${JSON.stringify((apps ?? []).map((a) => { const j = a.jobs as unknown as { title: string; companies: { name: string } | null } | null; return { role: j?.title, company: j?.companies?.name, status: a.status, stage: a.stage }; }))}
REFERRALS: ${JSON.stringify(refs ?? [])}
OUTREACH CONTACTS: ${JSON.stringify(contacts ?? [])}
GREAT COMPANIES: ${JSON.stringify((insights ?? []).map((i) => ({ company: (i.companies as unknown as { name: string } | null)?.name, why: i.why_great, tags: i.criteria_tags })))}`;

  try {
    const res = await createAIClient().chat.completions.create({
      model: AI_MODEL,
      max_tokens: 900,
      messages: [
        { role: "system", content: `You are Backchannel's assistant, helping a B2B sales professional land a better-paid job. Answer from the user's data below. Be concise and practical; use short lists. Link roles with their URL. Never invent roles, pay, companies, people or facts about the user. Never state, guess or suggest an answer to a visa, work-authorisation, salary-expectation, notice-period or diversity question: tell the user to answer those themselves on their Profile. ${DATA_NOTICE} If the data doesn't answer it, say so and suggest which Backchannel page helps (Roles, Great companies, Autopilot, Outreach, Referrals, Pay benchmark). For interview prep, use the role's company and the user's real numbers. No em-dashes.\n\n${untrusted("user_data", context)}` },
        ...history,
      ],
    });
    return NextResponse.json({ reply: res.choices[0]?.message?.content?.trim() ?? "Sorry, I didn't get an answer. Try again." });
  } catch (e) {
    return NextResponse.json({ error: `The assistant couldn't answer: ${(e as Error).message}` }, { status: 500 });
  }
}

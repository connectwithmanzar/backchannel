import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiText, hasAIKey, NO_AI_MESSAGE, untrusted, DATA_NOTICE } from "@/lib/ai";
import { rateLimitShared, retryAfter } from "@/lib/rate-limit";
import { questionById } from "@/lib/practice-questions";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You coach a B2B sales candidate who is practising for an interview. ${DATA_NOTICE} Absolute rules:
- Judge only the answer they typed. Use the CV and stories only to check that their claims are real and to find true facts they could add.
- Never invent employers, numbers, tools, results or experience. If a stronger answer needs a number they did not give, write [YOUR NUMBER] as a placeholder.
- Be direct and kind. Plain text, no markdown symbols other than "- " bullets, no em-dashes.
Write exactly these three sections, each title on its own line:
What worked (2 bullets)
Tighten this (3 bullets, most important first)
A sharper version (under 120 words, in their voice, using only facts from the answer, CV or stories)`;

// POST /api/practice { question_id, answer }: feedback on one practice answer. Nothing is stored.
export async function POST(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const q = questionById(String(b.question_id ?? ""));
  const answer = typeof b.answer === "string" ? b.answer.trim().slice(0, 3000) : "";
  if (!q) return NextResponse.json({ error: "Pick a question first." }, { status: 400 });
  if (answer.length < 20) return NextResponse.json({ error: "Write or say a little more first. A real answer is a few sentences." }, { status: 400 });
  if (!hasAIKey()) return NextResponse.json({ error: NO_AI_MESSAGE }, { status: 503 });
  if (!(await rateLimitShared(`practice:${user.id}`, 40, 3600_000))) {
    return NextResponse.json({ error: `Too many in a row. Try again in ${retryAfter(`practice:${user.id}`)}s.` }, { status: 429 });
  }

  // The gap line and stories arrive with migration 0017, so they are read apart and never block practice.
  const [{ data: cv }, gap, stories] = await Promise.all([
    db.from("profiles").select("cv_text").eq("user_id", user.id).maybeSingle(),
    db.from("profiles").select("gap_line").eq("user_id", user.id).maybeSingle(),
    db.from("stories").select("title, situation, action, result").eq("user_id", user.id).limit(10),
  ]);
  const gapLine = gap.error ? "" : (gap.data as { gap_line?: string | null } | null)?.gap_line ?? "";
  const storyText = (stories.error ? [] : stories.data ?? [])
    .map((s) => `${s.title}: ${s.situation} ${s.action} ${s.result}`.trim()).join("\n").slice(0, 4000);

  try {
    const content = await aiText(SYSTEM,
      `QUESTION: ${q.text}\n\n${untrusted("candidate_answer", answer)}\n\nCV (facts only):\n${(cv?.cv_text ?? "(none on file)").slice(0, 6000)}\n\nGAP LINE (their own words):\n${gapLine || "(none)"}\n\nSTORIES (their own words):\n${storyText || "(none)"}`,
      { maxTokens: 900 });
    if (!content) return NextResponse.json({ error: "The AI gave no answer. Try again." }, { status: 502 });
    return NextResponse.json({ ok: true, content });
  } catch (e) {
    console.error("practice failed:", e);
    return NextResponse.json({ error: "Couldn't write feedback. Try again." }, { status: 502 });
  }
}

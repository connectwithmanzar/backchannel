import { NextRequest, NextResponse } from "next/server";
import { jobradarOwner } from "@/lib/jobradar-auth";
import { aiText, hasAIKey, NO_AI_MESSAGE, untrusted, DATA_NOTICE } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You answer questions about a job-search dataset for a B2B sales professional (SDR/BDR, AE, GTM) searching in India and the Gulf.
Answer ONLY from the data given. If the data can't answer, say what is missing. Be brief: lead with the answer and its numbers,
then at most 5 bullets. Plain words, no em-dashes. ${DATA_NOTICE}`;

const TASKS: Record<string, string> = {
  ask: SYSTEM,
  headline: `You suggest LinkedIn and Naukri headline wording for a B2B sales professional. Use the person's real facts only, never invent
experience, numbers or employers. Use the most common search terms recruiters use in each market (given as data).
Return 3 India headlines and 3 Gulf headlines, each under 220 characters, then a one-line note on which terms each covers. ${DATA_NOTICE}`,
};

// POST /api/jobradar/ask { question, context, task?: "ask" | "headline" }: JobRadar's chat, using Backchannel's AI key.
export async function POST(req: NextRequest) {
  const auth = await jobradarOwner(req, 60);
  if (auth instanceof NextResponse) return auth;
  if (!hasAIKey()) return NextResponse.json({ error: NO_AI_MESSAGE }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  const question = typeof b.question === "string" ? b.question.trim().slice(0, 1000) : "";
  const context = typeof b.context === "string" ? b.context.slice(0, 40_000) : "";
  const system = TASKS[b.task as string] ?? SYSTEM;
  if (!question) return NextResponse.json({ error: "Type a question." }, { status: 400 });
  try {
    const answer = await aiText(system, `${untrusted("data", context)}\n\nQUESTION: ${question}`, { maxTokens: 900 });
    return NextResponse.json({ ok: true, answer });
  } catch (e) {
    return NextResponse.json({ error: `AI didn't answer: ${(e as Error).message}`.slice(0, 200) }, { status: 502 });
  }
}

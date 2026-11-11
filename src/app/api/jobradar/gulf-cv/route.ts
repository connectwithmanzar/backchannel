import { NextRequest, NextResponse } from "next/server";
import { jobradarOwner } from "@/lib/jobradar-auth";
import { aiText, hasAIKey, NO_AI_MESSAGE, untrusted, DATA_NOTICE } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 90;

const SYSTEM = `Rewrite a sales professional's CV in the style Gulf (UAE, Saudi Arabia, Qatar, Kuwait, Oman, Bahrain) recruiters expect.
Rules: use ONLY facts in the CV; never invent employers, dates, numbers, skills or achievements. Keep every metric exactly as written.
Gulf format: a personal details block at the top with these placeholders the person fills in themselves:
[Photo: add a professional headshot], [Nationality], [Visa status], [Notice period / availability], [Current location], [Languages].
Never fill those placeholders, even if the CV seems to hint at them. Then a 3-line professional summary, key skills, experience
(newest first, achievements as bullets with numbers), education, certifications. Output Markdown only. No em-dashes. ${DATA_NOTICE}`;

// POST /api/jobradar/gulf-cv -> your saved CV, rewritten in Gulf style, with personal-detail placeholders for you to fill.
export async function POST(req: NextRequest) {
  const auth = await jobradarOwner(req, 10);
  if (auth instanceof NextResponse) return auth;
  if (!hasAIKey()) return NextResponse.json({ error: NO_AI_MESSAGE }, { status: 503 });
  const { svc, ownerId } = auth;
  const { data: p } = await svc.from("profiles").select("cv_text").eq("user_id", ownerId).maybeSingle();
  const cv = (p?.cv_text ?? "").trim();
  if (cv.length < 200) return NextResponse.json({ error: "No CV saved in Backchannel yet. Upload it on your Profile page first." }, { status: 409 });
  try {
    const md = await aiText(SYSTEM, untrusted("cv", cv.slice(0, 20_000)), { maxTokens: 2500, smart: true });
    return NextResponse.json({ ok: true, markdown: md });
  } catch (e) {
    return NextResponse.json({ error: `AI didn't answer: ${(e as Error).message}`.slice(0, 200) }, { status: 502 });
  }
}

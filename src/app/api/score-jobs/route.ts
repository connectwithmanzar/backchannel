import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { rateLimitShared, retryAfter } from "@/lib/rate-limit";
import { hasAIKey } from "@/lib/ai";
import { scoreForUser } from "@/lib/jobs/scoring";

export const runtime = "nodejs";
export const maxDuration = 300;

// POST /api/score-jobs — score roles for the signed-in user. ?all=1 re-scores everything (after a profile change).
export async function POST(req: Request) {
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await rateLimitShared(`score:${user.id}`, 10, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Rate limit exceeded. Try again in " + retryAfter(`score:${user.id}`) + "s." }, { status: 429 });
  }
  try {
    const r = await scoreForUser(serviceClient(), user.id, {
      rescoreAll: new URL(req.url).searchParams.get("all") === "1", deadline: Date.now() + 45_000, ai: true,
    });
    return NextResponse.json({ ok: true, ...r, ai_enabled: hasAIKey() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

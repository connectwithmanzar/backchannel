import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractStoriesFromCv } from "@/lib/auto-apply/ats-answerer";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/stories/extract
// Analyzes the candidate's CV and extracts 4-6 quantitative STAR stories into their Story Bank.
export async function POST(_req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const { data: profile } = await db.from("profiles").select("cv_text").eq("user_id", user.id).maybeSingle();
  if (!profile?.cv_text || profile.cv_text.length < 200) {
    return NextResponse.json({ error: "Please upload your CV in Profile first." }, { status: 400 });
  }

  try {
    const stories = await extractStoriesFromCv(profile.cv_text);
    if (!stories.length) {
      return NextResponse.json({ error: "Could not extract stories from CV." }, { status: 422 });
    }

    const inserted: string[] = [];
    for (const s of stories) {
      const { data, error } = await db.from("stories").insert({
        user_id: user.id,
        title: s.title.slice(0, 120),
        situation: s.situation.slice(0, 1500),
        action: s.action.slice(0, 1500),
        result: s.result.slice(0, 1500),
        updated_at: new Date().toISOString(),
      }).select("id").single();
      if (!error && data?.id) inserted.push(data.id);
    }

    return NextResponse.json({ ok: true, count: inserted.length, stories });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

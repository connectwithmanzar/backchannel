import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as serviceClient } from "@supabase/supabase-js";

// POST /api/job-action
// Body: { job_id: string, reaction: "bookmarked" | "skipped" | "applied" | null }
export async function POST(req: NextRequest) {
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { job_id, reaction } = await req.json() as {
    job_id: string;
    reaction: "bookmarked" | "skipped" | "applied" | null;
  };

  if (!job_id) return NextResponse.json({ error: "job_id required" }, { status: 400 });

  const svc = serviceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await svc.from("job_scores").upsert(
    {
      user_id: user.id,
      job_id,
      reaction: reaction ?? null,
      scored_at: new Date().toISOString(),
    },
    { onConflict: "user_id,job_id" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, reaction });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { data, error } = await db.from("targets").select("id, job_id, company, title, url, source, strategy, steps, notes, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: "Couldn't load your list." }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

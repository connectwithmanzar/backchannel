import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isMissingSchema, MIGRATION_0017 } from "@/lib/migration";

export const runtime = "nodejs";

const MAX_STORIES = 20;
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

async function who() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  return { db, user };
}

// GET /api/stories: your interview stories (situation, action, result), newest first.
export async function GET() {
  const { db, user } = await who();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { data, error } = await db.from("stories").select("id, title, situation, action, result").eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ stories: [], needsMigration: isMissingSchema(error), error: isMissingSchema(error) ? MIGRATION_0017 : "Couldn't load your stories." });
  return NextResponse.json({ stories: data ?? [] });
}

// POST /api/stories { id?, title, situation, action, result }: add a story, or update one when id is given.
export async function POST(req: NextRequest) {
  const { db, user } = await who();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const title = clip(b.title, 120);
  if (!title) return NextResponse.json({ error: "Give the story a short title." }, { status: 400 });
  const row = { title, situation: clip(b.situation, 1500), action: clip(b.action, 1500), result: clip(b.result, 1500), updated_at: new Date().toISOString() };

  if (typeof b.id === "string" && /^[0-9a-f-]{36}$/i.test(b.id)) {
    const { error } = await db.from("stories").update(row).eq("id", b.id).eq("user_id", user.id);
    if (error) return NextResponse.json({ error: isMissingSchema(error) ? MIGRATION_0017 : "Couldn't save that." }, { status: isMissingSchema(error) ? 503 : 500 });
    return NextResponse.json({ ok: true, id: b.id });
  }
  const { count } = await db.from("stories").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if ((count ?? 0) >= MAX_STORIES) return NextResponse.json({ error: `You can keep ${MAX_STORIES} stories. Delete one first.` }, { status: 400 });
  const { data, error } = await db.from("stories").insert({ ...row, user_id: user.id }).select("id").single();
  if (error) return NextResponse.json({ error: isMissingSchema(error) ? MIGRATION_0017 : "Couldn't save that." }, { status: isMissingSchema(error) ? 503 : 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

// DELETE /api/stories?id=...
export async function DELETE(req: NextRequest) {
  const { db, user } = await who();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Missing story." }, { status: 400 });
  const { error } = await db.from("stories").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Couldn't delete that." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isMissingSchema, MIGRATION_0019 } from "@/lib/migration";
import { cleanCopilotInput, MAX_COPILOTS } from "@/lib/copilots";

export const runtime = "nodejs";

const UUID = /^[0-9a-f-]{36}$/i;

async function who() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  return { db, user };
}

const toRow = (v: ReturnType<typeof cleanCopilotInput> & { ok: true }) => ({
  name: v.value.name,
  titles: v.value.titles,
  remote: v.value.remote,
  remote_regions: v.value.remoteRegions,
  onsite: v.value.onsite,
  places: v.value.places,
  seniority: v.value.seniority,
  exclude_words: v.value.excludeWords,
  updated_at: new Date().toISOString(),
});

function failure(error: { message?: string; code?: string }, fallback: string) {
  const missing = isMissingSchema(error);
  return NextResponse.json({ error: missing ? MIGRATION_0019 : fallback, needsMigration: missing }, { status: missing ? 503 : 500 });
}

// POST /api/copilots { id?, name?, titles, remote, remoteRegions, onsite, places, seniority, excludeWords }
// Creates a Copilot, or updates yours when id is given.
export async function POST(req: NextRequest) {
  const { db, user } = await who();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const cleaned = cleanCopilotInput(body);
  if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 });
  const row = toRow(cleaned);

  if (typeof body.id === "string" && UUID.test(body.id)) {
    const { error } = await db.from("copilots").update(row).eq("id", body.id).eq("user_id", user.id);
    if (error) return failure(error, "Couldn't save that Copilot.");
    return NextResponse.json({ ok: true, id: body.id });
  }
  const { count, error: countError } = await db.from("copilots").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if (countError) return failure(countError, "Couldn't save that Copilot.");
  if ((count ?? 0) >= MAX_COPILOTS) return NextResponse.json({ error: `You can have ${MAX_COPILOTS} Copilots. Delete one first.` }, { status: 400 });
  const { data, error } = await db.from("copilots").insert({ ...row, user_id: user.id }).select("id").single();
  if (error) return failure(error, "Couldn't save that Copilot.");
  return NextResponse.json({ ok: true, id: data.id });
}

// PATCH /api/copilots { id, is_on }: switch a Copilot on or off.
export async function PATCH(req: NextRequest) {
  const { db, user } = await who();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.id !== "string" || !UUID.test(body.id) || typeof body.is_on !== "boolean") {
    return NextResponse.json({ error: "Missing Copilot." }, { status: 400 });
  }
  const { error } = await db.from("copilots").update({ is_on: body.is_on, updated_at: new Date().toISOString() }).eq("id", body.id).eq("user_id", user.id);
  if (error) return failure(error, "Couldn't change that.");
  return NextResponse.json({ ok: true, is_on: body.is_on });
}

// DELETE /api/copilots?id=...
export async function DELETE(req: NextRequest) {
  const { db, user } = await who();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Missing Copilot." }, { status: 400 });
  const { error } = await db.from("copilots").delete().eq("id", id).eq("user_id", user.id);
  if (error) return failure(error, "Couldn't delete that.");
  return NextResponse.json({ ok: true });
}

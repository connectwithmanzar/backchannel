import { NextRequest, NextResponse } from "next/server";
import { pickPreferenceFields, pickProfileFields } from "@/lib/profile-fields";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list: { name: string; value: string; options?: object }[]) =>
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );
}

export async function GET() {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [profileRes, prefsRes, blocklistRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("preferences").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("blocklist").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    profile: profileRes.data,
    preferences: prefsRes.data,
    blocklist: blocklistRes.data ?? [],
  });
}

export async function POST(request: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { type, ...payload } = body;

  if (type === "profile") {
    const { error } = await supabase.from("profiles").upsert(
      { ...pickProfileFields(payload), user_id: user.id, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (type === "preferences") {
    const { error } = await supabase.from("preferences").upsert(
      { ...pickPreferenceFields(payload), user_id: user.id },
      { onConflict: "user_id" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (type === "blocklist_add") {
    const { error } = await supabase.from("blocklist").insert({
      user_id: user.id,
      type: payload.blockType,
      value: payload.value,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (type === "blocklist_remove") {
    const { error } = await supabase.from("blocklist").delete().eq("id", payload.id).eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}

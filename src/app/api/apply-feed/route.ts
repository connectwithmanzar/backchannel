import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadFeed } from "@/lib/apply-feed-load";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  try {
    return NextResponse.json({ items: await loadFeed(db, user.id) });
  } catch {
    return NextResponse.json({ error: "Couldn't load the feed." }, { status: 500 });
  }
}

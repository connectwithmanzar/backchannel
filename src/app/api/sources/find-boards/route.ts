import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { isOwner } from "@/lib/owner";
import { discoverBoard } from "@/lib/collectors/ats";
import { runIngestion } from "@/lib/jobs/ingest";
import { SHARED_JOBS_TAG } from "@/lib/jobs/shared-cache";

export const runtime = "nodejs";
export const maxDuration = 120;
const BATCH = 12;

// POST /api/sources/find-boards looks for the public job boards of the next saved companies that have not been checked,
// and collects the sales roles of the ones found. Call it again until `left` is 0; it picks up where it stopped.
export async function POST() {
  const uc = await createClient();
  const { data: { user } } = await uc.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isOwner(user.email)) return NextResponse.json({ error: "Only the owner can change sources." }, { status: 403 });

  const svc = serviceClient();
  const { data: due, error } = await svc.from("companies").select("id, name, domain").eq("enabled", true).is("ats_slug", null).is("board_checked_at", null).order("created_at").limit(BATCH);
  if (error) return NextResponse.json({ error: /board_checked_at/.test(error.message) ? "Run database update 0015 first, then try again." : "Couldn't read the list." }, { status: 500 });

  const found: string[] = [];
  let withBoard = 0;
  const queue = [...(due ?? [])];
  async function worker() {
    for (let c = queue.shift(); c; c = queue.shift()) {
      const board = await discoverBoard(c.name, c.domain).catch(() => null);
      const patch: Record<string, string | null> = { board_checked_at: new Date().toISOString() };
      if (board) { patch.ats_type = board.ats; patch.ats_slug = board.slug; }
      const { error: e } = await svc.from("companies").update(patch).eq("id", c.id);
      if (e) await svc.from("companies").update({ board_checked_at: patch.board_checked_at }).eq("id", c.id);
      else if (board) { found.push(c.id); withBoard++; }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));

  let salesRoles = 0;
  if (found.length) {
    const run = await runIngestion({ companyIds: found, repair: false });
    salesRoles = run.sales_roles;
    revalidateTag(SHARED_JOBS_TAG, { expire: 0 });
  }
  const { count } = await svc.from("companies").select("id", { count: "exact", head: true }).eq("enabled", true).is("ats_slug", null).is("board_checked_at", null);
  return NextResponse.json({ ok: true, checked: due?.length ?? 0, withBoard, salesRoles, left: count ?? 0 });
}

import { NextRequest, NextResponse } from "next/server";
import { jobradarOwner } from "@/lib/jobradar-auth";
import { isAutoResult } from "@/lib/auto-apply";

export const runtime = "nodejs";
export const maxDuration = 30;

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

// POST /api/jobradar/apply-result { id, result, log, receipt? }
// What the robot browser did with one application. "submitted" is recorded exactly like you pressing "I submitted it".
export async function POST(req: NextRequest) {
  const auth = await jobradarOwner(req, 1500);
  if (auth instanceof NextResponse) return auth;
  const { svc, ownerId } = auth;

  const b = await req.json().catch(() => ({}));
  const id = typeof b.id === "string" ? b.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !isAutoResult(b.result)) return NextResponse.json({ error: "Missing application or result." }, { status: 400 });
  const log = clip(b.log, 2000);
  const now = new Date().toISOString();

  const { data: app } = await svc.from("applications").select("id, job_id, status").eq("id", id).eq("user_id", ownerId).maybeSingle();
  if (!app) return NextResponse.json({ error: "Application not found." }, { status: 404 });

  if (b.result === "submitted") {
    if (app.status === "submitted") return NextResponse.json({ ok: true, already: true });
    const { error } = await svc.from("applications").update({
      status: "submitted", stage: "applied", submitted_at: now, receipt: clip(b.receipt, 300) || "Sent by auto-apply", auto_status: "submitted", auto_log: log, auto_at: now, updated_at: now,
    }).eq("id", id).eq("user_id", ownerId);
    if (error) return NextResponse.json({ error: "Couldn't save the result." }, { status: 500 });
    await Promise.all([
      svc.from("funnel_events").insert({ user_id: ownerId, type: "applied", ref_id: id }),
      svc.from("job_scores").upsert({ user_id: ownerId, job_id: app.job_id, reaction: "applied" }, { onConflict: "user_id,job_id" }),
    ]);
    return NextResponse.json({ ok: true });
  }

  const { error } = await svc.from("applications").update({ auto_status: b.result, auto_log: log, auto_at: now, updated_at: now }).eq("id", id).eq("user_id", ownerId);
  if (error) return NextResponse.json({ error: "Couldn't save the result." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

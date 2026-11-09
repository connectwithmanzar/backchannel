import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { OFFER_CURRENCIES } from "@/lib/offers";

const STATUSES = ["considering", "accepted", "declined", "expired"];

function num(v: unknown): number | null {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export async function POST(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const now = new Date().toISOString();

  if (b.action === "add") {
    const company = text(b.company, 200);
    if (!company) return NextResponse.json({ error: "Enter the company name." }, { status: 400 });
    const currency = OFFER_CURRENCIES.includes(b.currency) ? b.currency : "USD";
    const [base, variable, bonus] = [num(b.base), num(b.variable), num(b.joining_bonus)];
    if ([base, variable, bonus].some((n) => Number.isNaN(n))) return NextResponse.json({ error: "Pay amounts must be positive numbers." }, { status: 400 });
    const { error } = await db.from("offers").insert({
      user_id: user.id, company, role_title: text(b.role_title, 200), location: text(b.location, 200), currency, base, variable, joining_bonus: bonus,
      equity_note: text(b.equity_note, 500), visa_note: text(b.visa_note, 500), notes: text(b.notes, 1000), deadline: /^\d{4}-\d{2}-\d{2}$/.test(b.deadline ?? "") ? b.deadline : null,
    });
    if (error) return NextResponse.json({ error: "Couldn't save the offer." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "status") {
    if (!STATUSES.includes(b.status)) return NextResponse.json({ error: "Unknown status." }, { status: 400 });
    const { error } = await db.from("offers").update({ status: b.status, updated_at: now }).eq("id", b.id).eq("user_id", user.id);
    return error ? NextResponse.json({ error: "Couldn't update." }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  if (b.action === "delete") {
    const { error } = await db.from("offers").delete().eq("id", b.id).eq("user_id", user.id);
    return error ? NextResponse.json({ error: "Couldn't delete." }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

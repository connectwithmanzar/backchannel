import { NextRequest, NextResponse } from "next/server";
import { jobradarOwner } from "@/lib/jobradar-auth";
import { isExcludedCompany } from "@/data/companies";
import { isBlocked } from "@/lib/outreach/engine";
import { canonicalUrl } from "@/lib/jobs/url";

export const runtime = "nodejs";

const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// POST /api/jobradar/referral { company, role_title, referrer_name, referrer_relation?, job_url? }
// Adds a "to ask" referral in Backchannel. Backchannel drafts the ask; you send it yourself.
export async function POST(req: NextRequest) {
  const auth = await jobradarOwner(req, 120);
  if (auth instanceof NextResponse) return auth;
  const { svc, ownerId } = auth;
  const b = await req.json().catch(() => ({}));
  const company = s(b.company, 200), who = s(b.referrer_name, 160);
  if (!company || !who) return NextResponse.json({ error: "Company and the person's name are required." }, { status: 400 });
  if (isExcludedCompany(company) || (await isBlocked(svc, ownerId, "", company, who))) {
    return NextResponse.json({ error: `${company} is on your excluded list.` }, { status: 400 });
  }
  let jobId: string | null = null;
  const url = s(b.job_url, 1000);
  if (/^https:\/\//i.test(url)) {
    const { data } = await svc.from("jobs").select("id").eq("url", canonicalUrl(url)).limit(1).maybeSingle();
    jobId = data?.id ?? null;
  }
  const { data: dup } = await svc.from("referrals").select("id").eq("user_id", ownerId).ilike("company_name", company).ilike("referrer_name", who).limit(1).maybeSingle();
  if (dup) return NextResponse.json({ ok: true, id: dup.id, existed: true });
  const { data, error } = await svc.from("referrals").insert({
    user_id: ownerId, company_name: company, referrer_name: who, role_title: s(b.role_title, 200) || null, job_id: jobId,
    referrer_relation: s(b.referrer_relation, 120) || "LinkedIn connection", channel: "linkedin",
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

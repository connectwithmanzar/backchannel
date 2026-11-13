import { NextRequest, NextResponse } from "next/server";
import { jobradarOwner } from "@/lib/jobradar-auth";
import { loadCandidatePersona, generateHumanAtsAnswer } from "@/lib/auto-apply/ats-answerer";

export const runtime = "nodejs";
export const maxDuration = 60;

const KINDS = ["text", "select", "radio", "checkbox"] as const;
type Kind = (typeof KINDS)[number];
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

// POST /api/jobradar/apply-answer { application_id, question, kind?, options? }
// Uses the Deep Candidate Persona & Story Bank to provide high-impact, human-written answers to any form question.
export async function POST(req: NextRequest) {
  const auth = await jobradarOwner(req, 1500);
  if (auth instanceof NextResponse) return auth;
  const { svc, ownerId } = auth;

  const b = await req.json().catch(() => ({}));
  const id = typeof b.application_id === "string" ? b.application_id : "";
  const question = clip(b.question, 600);
  const kind: Kind = (KINDS as readonly string[]).includes(b.kind) ? b.kind : "text";
  const options: string[] = Array.isArray(b.options) ? b.options.map((o: unknown) => clip(o, 200)).filter(Boolean).slice(0, 60) : [];
  if (!/^[0-9a-f-]{36}$/i.test(id) || !question) return NextResponse.json({ error: "Missing application or question." }, { status: 400 });

  const [{ data: app }, persona] = await Promise.all([
    svc.from("applications").select("id, jobs(title, company_name, description)").eq("id", id).eq("user_id", ownerId).maybeSingle(),
    loadCandidatePersona(svc, ownerId),
  ]);
  if (!app) return NextResponse.json({ error: "Application not found." }, { status: 404 });

  if (kind === "checkbox") {
    return NextResponse.json({ answer: "", needs_you: true, reason: `A checkbox question ("${question}") needs your decision.` });
  }

  const job = app.jobs as unknown as { title: string; company_name: string | null; description: string | null } | null;
  const jobContext = {
    title: job?.title || "Role",
    company: job?.company_name || "Company",
    description: job?.description || "",
  };

  const result = await generateHumanAtsAnswer(question, persona, jobContext, {
    kind,
    options,
  });

  return NextResponse.json({
    answer: result.answer,
    needs_you: result.needsYou,
    reason: result.reason,
    story_used: result.storyUsed,
  });
}

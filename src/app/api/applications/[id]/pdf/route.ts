import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { compileAtsResumePdf, type ContactInfo } from "@/lib/pdf/ats-resume";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }

  // 1. Fetch application, job info, profile info and saved contact preferences
  const [{ data: app }, { data: profile }, { data: prefs }] = await Promise.all([
    db
      .from("applications")
      .select("id, tailored_cv, job_id, jobs(title, company_name, companies(name))")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    db
      .from("profiles")
      .select("name, cv_text")
      .eq("user_id", user.id)
      .maybeSingle(),
    db
      .from("preferences")
      .select("standard_answers")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (!app) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const cvContent = app.tailored_cv?.trim() || profile?.cv_text?.trim();
  if (!cvContent) {
    return NextResponse.json({ error: "No CV content available to generate PDF." }, { status: 400 });
  }

  const saved = (prefs?.standard_answers ?? {}) as Record<string, string>;
  const contactFallback: ContactInfo = {
    name: profile?.name || user.user_metadata?.full_name || "Candidate",
    email: user.email,
    phone: saved.contact_phone,
    linkedin: saved.contact_linkedin,
    website: saved.contact_website,
    location: saved.contact_city,
  };

  try {
    const pdfBuffer = await compileAtsResumePdf(cvContent, contactFallback);

    const job = app.jobs as unknown as { title?: string; company_name?: string; companies?: { name?: string } } | null;
    const company = job?.companies?.name || job?.company_name || "Company";
    const cleanCompany = company.replace(/[^a-zA-Z0-9]/g, "_");
    const cleanCandidate = (contactFallback.name || "Resume").replace(/[^a-zA-Z0-9]/g, "_");
    const filename = `${cleanCandidate}_Resume_${cleanCompany}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    console.error("Failed to generate ATS PDF resume:", err);
    return NextResponse.json({ error: "Failed to compile ATS PDF resume." }, { status: 500 });
  }
}

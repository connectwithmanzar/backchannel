import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { authUrl, gmailConfigured } from "@/lib/outreach/gmail";

export async function GET(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (!gmailConfigured()) return NextResponse.redirect(new URL("/outreach?gmail=not_configured", req.url));
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authUrl(`${req.nextUrl.origin}/api/gmail/callback`, state));
  res.cookies.set("gmail_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}

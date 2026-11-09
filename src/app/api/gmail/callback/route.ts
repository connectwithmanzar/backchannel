import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { encryptSecret } from "@/lib/crypto";
import { exchangeCode } from "@/lib/outreach/gmail";

export async function GET(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const back = (q: string) => {
    const r = NextResponse.redirect(new URL(`/outreach?gmail=${q}`, req.url));
    r.cookies.delete("gmail_oauth_state");
    return r;
  };
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (req.nextUrl.searchParams.get("error")) return back("cancelled");
  if (!code || !state || state !== req.cookies.get("gmail_oauth_state")?.value) return back("failed");
  try {
    const { refreshToken, email } = await exchangeCode(code, `${req.nextUrl.origin}/api/gmail/callback`);
    const { error } = await serviceClient().from("gmail_accounts").upsert({ user_id: user.id, email, refresh_token: encryptSecret(refreshToken), connected_at: new Date().toISOString() });
    if (error) return back("failed");
    return back("connected");
  } catch {
    return back("failed");
  }
}

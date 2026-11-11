import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/supabase/service";
import { isCronAuthorized, ownerEmail } from "@/lib/owner";
import { rateLimitShared } from "@/lib/rate-limit";

/**
 * JobRadar (the owner's Mac app) calls /api/jobradar/* with Authorization: Bearer JOBRADAR_SECRET.
 * Returns the service client and the owner's user id, or a response to send back.
 */
export async function jobradarOwner(req: NextRequest, limitPerHour = 120): Promise<{ svc: SupabaseClient; ownerId: string } | NextResponse> {
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.JOBRADAR_SECRET)) {
    return NextResponse.json({ error: "Wrong or missing JobRadar key. Copy JOBRADAR_SECRET from Vercel into JobRadar." }, { status: 403 });
  }
  if (!(await rateLimitShared(`jobradar:${new URL(req.url).pathname}`, limitPerHour, 3600_000))) {
    return NextResponse.json({ error: "Too many requests from JobRadar this hour. Try again later." }, { status: 429 });
  }
  const svc = serviceClient();
  const owner = ownerEmail();
  const { data: { users } } = await svc.auth.admin.listUsers({ perPage: 1000 });
  const me = (users ?? []).find((u) => (u.email ?? "").toLowerCase() === owner);
  if (!me) return NextResponse.json({ error: "Sign in to Backchannel once with the owner email, then try again." }, { status: 409 });
  return { svc, ownerId: me.id };
}

/** A friendly message when a migration hasn't been run yet. */
export function missingTable(e: { message?: string; code?: string } | null): boolean {
  return !!e && (e.code === "42P01" || e.code === "42703" || /does not exist|could not find/i.test(e.message ?? ""));
}

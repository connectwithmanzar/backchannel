import { NextRequest, NextResponse } from "next/server";
import { WARM_PATHS, isWarmAuthorized } from "@/lib/warm";

export const runtime = "nodejs";
export const maxDuration = 30;

// GET /api/warm?key=...: ping this every 5 minutes from a free uptime monitor. It visits each page once, so Vercel keeps
// that page's server code loaded. The pages render with no signed-in user, so no personal data is read or returned.
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!isWarmAuthorized(key)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const origin = req.nextUrl.origin;
  const results = await Promise.all(WARM_PATHS.map(async (p) => {
    const started = Date.now();
    try {
      const res = await fetch(origin + p, { redirect: "manual", headers: { "x-warm-key": key ?? "" }, signal: AbortSignal.timeout(20_000) });
      return { path: p, status: res.status, ms: Date.now() - started };
    } catch {
      return { path: p, status: 0, ms: Date.now() - started };
    }
  }));
  return NextResponse.json({ ok: true, results });
}

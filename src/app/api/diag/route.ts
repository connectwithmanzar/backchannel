import https from "node:https";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

// TEMPORARY timing probe. Signed-in users only, returns timings and no data. Delete after use.
function probe(agent: https.Agent | undefined): Promise<Record<string, number>> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const t: Record<string, number> = {};
    const url = new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?select=user_id&limit=1`);
    const req = https.get(url, { agent, headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } }, (res) => {
      t.firstByte = Math.round(performance.now() - t0);
      res.resume();
      res.on("end", () => { t.total = Math.round(performance.now() - t0); resolve(t); });
    });
    req.on("socket", (s) => {
      s.on("lookup", (_e, addr) => { t.dns = Math.round(performance.now() - t0); t.addrFamily = String(addr).includes(":") ? 6 : 4; });
      s.on("connect", () => { t.tcp = Math.round(performance.now() - t0); });
      s.on("secureConnect", () => { t.tls = Math.round(performance.now() - t0); });
    });
    req.on("error", () => resolve({ error: 1 }));
  });
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const keep = new https.Agent({ keepAlive: true });
  return NextResponse.json({
    region: process.env.VERCEL_REGION ?? null,
    noAgent_1: await probe(undefined),
    noAgent_2: await probe(undefined),
    keepAlive_1: await probe(keep),
    keepAlive_2: await probe(keep),
    keepAlive_3: await probe(keep),
  });
}

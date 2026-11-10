const KEEP_PARAMS = ["gh_jid", "jobid", "job_id", "jk", "id", "req", "reqid", "requisitionid", "lever-source"];

/**
 * One job, one address: tracking parameters and fragments are dropped, and LinkedIn job links are reduced to
 * /jobs/view/<id>/, so opening the same job twice always matches the copy you already saved.
 */
export function canonicalUrl(raw: string): string {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return raw.trim(); }
  const host = u.hostname.toLowerCase().replace(/^(www|[a-z]{2})\./, "");
  const view = u.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d{6,})/);
  if (host === "linkedin.com" && view) return `https://www.linkedin.com/jobs/view/${view[1]}/`;
  const current = u.searchParams.get("currentJobId");
  if (host === "linkedin.com" && current) return `https://www.linkedin.com/jobs/view/${current}/`;
  const keep = new URLSearchParams();
  for (const [k, v] of u.searchParams) if (KEEP_PARAMS.includes(k.toLowerCase())) keep.append(k, v);
  const q = keep.toString();
  return `${u.protocol}//${u.hostname}${u.pathname.replace(/\/+$/, "") || "/"}${q ? `?${q}` : ""}`;
}

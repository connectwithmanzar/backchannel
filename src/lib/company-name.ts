import { COMPANY_SEEDS } from "@/data/companies";

// Company names are made from job-board addresses, so they arrive as "thomsonreuters" or "hpe". This puts them
// right for display only. The stored name is never changed, so searching and matching keep working.

const MANUAL: Record<string, string> = {
  thomsonreuters: "Thomson Reuters", motorolasolutions: "Motorola Solutions", sailpoint: "SailPoint", hpe: "HPE", hp: "HP", "3m": "3M",
  mongodb: "MongoDB", elevenlabs: "ElevenLabs", cloudflare: "Cloudflare", hubspot: "HubSpot", salesforce: "Salesforce", servicenow: "ServiceNow",
  paypal: "PayPal", linkedin: "LinkedIn", youtube: "YouTube", github: "GitHub", gitlab: "GitLab", pagerduty: "PagerDuty", sendgrid: "SendGrid",
  zoominfo: "ZoomInfo", bigcommerce: "BigCommerce", mailchimp: "Mailchimp", docusign: "DocuSign", crowdstrike: "CrowdStrike", palantir: "Palantir",
  freshworks: "Freshworks", zoho: "Zoho", browserstack: "BrowserStack", postman: "Postman", razorpay: "Razorpay", phonepe: "PhonePe",
  moengage: "MoEngage", clevertap: "CleverTap", webengage: "WebEngage", netcore: "Netcore", upgrad: "upGrad", physicswallah: "PhysicsWallah",
  tcs: "TCS", ibm: "IBM", sap: "SAP", aws: "AWS", ge: "GE", ey: "EY", kpmg: "KPMG", pwc: "PwC", hcl: "HCL", hcltech: "HCLTech", ntt: "NTT",
  hdfc: "HDFC", icici: "ICICI", sbi: "SBI", lti: "LTI", cdw: "CDW", nvidia: "NVIDIA", amd: "AMD", intel: "Intel", cisco: "Cisco", vmware: "VMware",
  tripactions: "Navan", wework: "WeWork", doordash: "DoorDash", airbnb: "Airbnb", openai: "OpenAI", datadog: "Datadog", snowflake: "Snowflake",
};

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const CANONICAL = new Map<string, string>([...COMPANY_SEEDS.map((s) => [key(s.name), s.name] as [string, string]), ...Object.entries(MANUAL)]);

/** Word endings that mark where a joined-up name splits, like "motorolasolutions". */
const ENDINGS = ["solutions", "technologies", "technology", "systems", "software", "networks", "security", "healthcare", "health", "global", "group", "labs", "digital", "payments", "pharma", "bank", "capital", "holdings", "analytics", "interactive", "industries"];

const cap = (w: string) => (w ? w[0].toUpperCase() + w.slice(1) : w);

export function formatCompanyName(raw: string | null | undefined): string {
  const name = (raw ?? "").trim();
  if (!name) return "";
  // Already written properly (capitals inside, or several words): leave it.
  if (/[A-Z]/.test(name.slice(1)) || (/\s/.test(name) && /[A-Z]/.test(name))) return name;
  const k = key(name);
  const known = CANONICAL.get(k);
  if (known) return known;
  if (/^\d+[a-z]{1,3}$/.test(k)) return k.toUpperCase();
  if (!/\s|[-_.]/.test(name)) {
    const end = ENDINGS.find((e) => k.endsWith(e) && k.length - e.length >= 3);
    if (end) return `${cap(k.slice(0, k.length - end.length))} ${cap(end)}`;
  }
  return name.split(/([\s_-]+)/).map((w) => (/^[\s_-]+$/.test(w) ? " " : cap(w))).join("").replace(/\s+/g, " ").trim();
}

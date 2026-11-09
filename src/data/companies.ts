// Editable seed list of companies to collect sales jobs from.
// Set enabled: false to skip a company without deleting it.
// Find the ATS slug from the company's careers URL:
//   Greenhouse → boards.greenhouse.io/{slug}
//   Lever      → jobs.lever.co/{slug}
//   Ashby      → jobs.ashbyhq.com/{slug}
//   SmartRecruiters → careers.smartrecruiters.com/{slug}

export type AtsType = "greenhouse" | "lever" | "ashby" | "smartrecruiters";

export interface CompanySeed {
  name: string;
  domain: string;
  country: string; // ISO-2 HQ country
  ats_type: AtsType;
  ats_slug: string;
  careers_url: string;
  enabled: boolean;
}

// Companies that must never be collected or shown (e.g. current employer).
// Matched case-insensitively against company name, domain, or ATS slug.
export const EXCLUDED_COMPANIES = ["taboola"];

export function isExcludedCompany(...values: (string | null | undefined)[]): boolean {
  return values.some((v) => {
    const l = (v ?? "").toLowerCase();
    return l !== "" && EXCLUDED_COMPANIES.some((x) => l.includes(x));
  });
}

export const COMPANY_SEEDS: CompanySeed[] = [
  // Starting list only. Wrong or moved boards are repaired automatically on the next run,
  // and you can add any company by name on the Sources page.
  { name: "HubSpot", domain: "hubspot.com", country: "US", ats_type: "greenhouse", ats_slug: "hubspot", careers_url: "https://boards.greenhouse.io/hubspot", enabled: true },
  { name: "Gong", domain: "gong.io", country: "US", ats_type: "greenhouse", ats_slug: "gong", careers_url: "https://boards.greenhouse.io/gong", enabled: true },
  { name: "Outreach", domain: "outreach.io", country: "US", ats_type: "greenhouse", ats_slug: "outreach", careers_url: "https://boards.greenhouse.io/outreach", enabled: true },
  { name: "Salesloft", domain: "salesloft.com", country: "US", ats_type: "greenhouse", ats_slug: "salesloft", careers_url: "https://boards.greenhouse.io/salesloft", enabled: true },
  { name: "Clari", domain: "clari.com", country: "US", ats_type: "greenhouse", ats_slug: "clari", careers_url: "https://boards.greenhouse.io/clari", enabled: true },
  { name: "Mixpanel", domain: "mixpanel.com", country: "US", ats_type: "greenhouse", ats_slug: "mixpanel", careers_url: "https://boards.greenhouse.io/mixpanel", enabled: true },
  { name: "Amplitude", domain: "amplitude.com", country: "US", ats_type: "greenhouse", ats_slug: "amplitude", careers_url: "https://boards.greenhouse.io/amplitude", enabled: true },
  { name: "Apollo.io", domain: "apollo.io", country: "US", ats_type: "greenhouse", ats_slug: "apolloio", careers_url: "https://boards.greenhouse.io/apolloio", enabled: true },
  { name: "ZoomInfo", domain: "zoominfo.com", country: "US", ats_type: "greenhouse", ats_slug: "zoominfo", careers_url: "https://boards.greenhouse.io/zoominfo", enabled: true },
  { name: "Seismic", domain: "seismic.com", country: "US", ats_type: "greenhouse", ats_slug: "seismic", careers_url: "https://boards.greenhouse.io/seismic", enabled: true },
  { name: "Highspot", domain: "highspot.com", country: "US", ats_type: "greenhouse", ats_slug: "highspot", careers_url: "https://boards.greenhouse.io/highspot", enabled: true },
  { name: "6sense", domain: "6sense.com", country: "US", ats_type: "greenhouse", ats_slug: "6sense", careers_url: "https://boards.greenhouse.io/6sense", enabled: true },
  { name: "Gainsight", domain: "gainsight.com", country: "US", ats_type: "greenhouse", ats_slug: "gainsight", careers_url: "https://boards.greenhouse.io/gainsight", enabled: true },
  { name: "Demandbase", domain: "demandbase.com", country: "US", ats_type: "greenhouse", ats_slug: "demandbase", careers_url: "https://boards.greenhouse.io/demandbase", enabled: true },
  { name: "Sprinklr", domain: "sprinklr.com", country: "US", ats_type: "greenhouse", ats_slug: "sprinklr", careers_url: "https://boards.greenhouse.io/sprinklr", enabled: true },
  { name: "Freshworks", domain: "freshworks.com", country: "IN", ats_type: "smartrecruiters", ats_slug: "freshworks", careers_url: "https://careers.smartrecruiters.com/freshworks", enabled: true },
  { name: "LeadSquared", domain: "leadsquared.com", country: "IN", ats_type: "greenhouse", ats_slug: "leadsquared", careers_url: "https://boards.greenhouse.io/leadsquared", enabled: true },
  { name: "Mindtickle", domain: "mindtickle.com", country: "IN", ats_type: "greenhouse", ats_slug: "mindtickle", careers_url: "https://boards.greenhouse.io/mindtickle", enabled: true },
  { name: "Chargebee", domain: "chargebee.com", country: "IN", ats_type: "greenhouse", ats_slug: "chargebee", careers_url: "https://boards.greenhouse.io/chargebee", enabled: true },
  { name: "Postman", domain: "postman.com", country: "IN", ats_type: "greenhouse", ats_slug: "postman", careers_url: "https://boards.greenhouse.io/postman", enabled: true },
  { name: "BrowserStack", domain: "browserstack.com", country: "IN", ats_type: "greenhouse", ats_slug: "browserstack", careers_url: "https://boards.greenhouse.io/browserstack", enabled: true },
  { name: "Lusha", domain: "lusha.com", country: "IL", ats_type: "greenhouse", ats_slug: "lusha", careers_url: "https://boards.greenhouse.io/lusha", enabled: true },
  { name: "UserGems", domain: "usergems.com", country: "US", ats_type: "greenhouse", ats_slug: "usergems", careers_url: "https://boards.greenhouse.io/usergems", enabled: true },
  { name: "Stripe", domain: "stripe.com", country: "US", ats_type: "greenhouse", ats_slug: "stripe", careers_url: "https://boards.greenhouse.io/stripe", enabled: true },
  { name: "Datadog", domain: "datadoghq.com", country: "US", ats_type: "greenhouse", ats_slug: "datadog", careers_url: "https://boards.greenhouse.io/datadog", enabled: true },
  { name: "Figma", domain: "figma.com", country: "US", ats_type: "greenhouse", ats_slug: "figma", careers_url: "https://boards.greenhouse.io/figma", enabled: true },
  { name: "MongoDB", domain: "mongodb.com", country: "US", ats_type: "greenhouse", ats_slug: "mongodb", careers_url: "https://boards.greenhouse.io/mongodb", enabled: true },
  { name: "Cloudflare", domain: "cloudflare.com", country: "US", ats_type: "greenhouse", ats_slug: "cloudflare", careers_url: "https://boards.greenhouse.io/cloudflare", enabled: true },
  { name: "Elastic", domain: "elastic.co", country: "US", ats_type: "greenhouse", ats_slug: "elastic", careers_url: "https://boards.greenhouse.io/elastic", enabled: true },
  { name: "Twilio", domain: "twilio.com", country: "US", ats_type: "greenhouse", ats_slug: "twilio", careers_url: "https://boards.greenhouse.io/twilio", enabled: true },
  { name: "Samsara", domain: "samsara.com", country: "US", ats_type: "greenhouse", ats_slug: "samsara", careers_url: "https://boards.greenhouse.io/samsara", enabled: true },
  { name: "Airtable", domain: "airtable.com", country: "US", ats_type: "greenhouse", ats_slug: "airtable", careers_url: "https://boards.greenhouse.io/airtable", enabled: true },
  { name: "Braze", domain: "braze.com", country: "US", ats_type: "greenhouse", ats_slug: "braze", careers_url: "https://boards.greenhouse.io/braze", enabled: true },
  { name: "Contentsquare", domain: "contentsquare.com", country: "FR", ats_type: "greenhouse", ats_slug: "contentsquare", careers_url: "https://boards.greenhouse.io/contentsquare", enabled: true },
  { name: "GitLab", domain: "gitlab.com", country: "US", ats_type: "greenhouse", ats_slug: "gitlab", careers_url: "https://boards.greenhouse.io/gitlab", enabled: true },
  { name: "Okta", domain: "okta.com", country: "US", ats_type: "greenhouse", ats_slug: "okta", careers_url: "https://boards.greenhouse.io/okta", enabled: true },
  { name: "Intercom", domain: "intercom.com", country: "IE", ats_type: "greenhouse", ats_slug: "intercom", careers_url: "https://boards.greenhouse.io/intercom", enabled: true },
  { name: "Personio", domain: "personio.com", country: "DE", ats_type: "greenhouse", ats_slug: "personio", careers_url: "https://boards.greenhouse.io/personio", enabled: true },
  { name: "Celonis", domain: "celonis.com", country: "DE", ats_type: "greenhouse", ats_slug: "celonis", careers_url: "https://boards.greenhouse.io/celonis", enabled: true },
  { name: "Mirakl", domain: "mirakl.com", country: "FR", ats_type: "greenhouse", ats_slug: "mirakl", careers_url: "https://boards.greenhouse.io/mirakl", enabled: true },
  { name: "Doctolib", domain: "doctolib.com", country: "FR", ats_type: "greenhouse", ats_slug: "doctolib", careers_url: "https://boards.greenhouse.io/doctolib", enabled: true },
  { name: "Lattice", domain: "lattice.com", country: "US", ats_type: "lever", ats_slug: "lattice", careers_url: "https://jobs.lever.co/lattice", enabled: true },
  { name: "Carta", domain: "carta.com", country: "US", ats_type: "lever", ats_slug: "carta", careers_url: "https://jobs.lever.co/carta", enabled: true },
  { name: "Front", domain: "front.com", country: "US", ats_type: "lever", ats_slug: "front", careers_url: "https://jobs.lever.co/front", enabled: true },
  { name: "Pipedrive", domain: "pipedrive.com", country: "EE", ats_type: "lever", ats_slug: "pipedrive", careers_url: "https://jobs.lever.co/pipedrive", enabled: true },
  { name: "Typeform", domain: "typeform.com", country: "ES", ats_type: "lever", ats_slug: "typeform", careers_url: "https://jobs.lever.co/typeform", enabled: true },
  { name: "Remote", domain: "remote.com", country: "IE", ats_type: "lever", ats_slug: "remote", careers_url: "https://jobs.lever.co/remote", enabled: true },
  { name: "Paddle", domain: "paddle.com", country: "GB", ats_type: "lever", ats_slug: "paddle", careers_url: "https://jobs.lever.co/paddle", enabled: true },
  { name: "Spendesk", domain: "spendesk.com", country: "FR", ats_type: "lever", ats_slug: "spendesk", careers_url: "https://jobs.lever.co/spendesk", enabled: true },
  { name: "Qonto", domain: "qonto.com", country: "FR", ats_type: "lever", ats_slug: "qonto", careers_url: "https://jobs.lever.co/qonto", enabled: true },
  { name: "Notion", domain: "notion.so", country: "US", ats_type: "ashby", ats_slug: "notion", careers_url: "https://jobs.ashbyhq.com/notion", enabled: true },
  { name: "Deel", domain: "deel.com", country: "US", ats_type: "ashby", ats_slug: "deel", careers_url: "https://jobs.ashbyhq.com/deel", enabled: true },
  { name: "OpenAI", domain: "openai.com", country: "US", ats_type: "ashby", ats_slug: "openai", careers_url: "https://jobs.ashbyhq.com/openai", enabled: true },
  { name: "Ramp", domain: "ramp.com", country: "US", ats_type: "ashby", ats_slug: "ramp", careers_url: "https://jobs.ashbyhq.com/ramp", enabled: true },
  { name: "Linear", domain: "linear.app", country: "US", ats_type: "ashby", ats_slug: "linear", careers_url: "https://jobs.ashbyhq.com/linear", enabled: true },
  { name: "Rippling", domain: "rippling.com", country: "US", ats_type: "ashby", ats_slug: "rippling", careers_url: "https://jobs.ashbyhq.com/rippling", enabled: true },
  { name: "Brex", domain: "brex.com", country: "US", ats_type: "ashby", ats_slug: "brex", careers_url: "https://jobs.ashbyhq.com/brex", enabled: true },
  { name: "Vanta", domain: "vanta.com", country: "US", ats_type: "ashby", ats_slug: "vanta", careers_url: "https://jobs.ashbyhq.com/vanta", enabled: true },
  { name: "Drata", domain: "drata.com", country: "US", ats_type: "ashby", ats_slug: "drata", careers_url: "https://jobs.ashbyhq.com/drata", enabled: true },
  { name: "Navan", domain: "navan.com", country: "US", ats_type: "ashby", ats_slug: "navan", careers_url: "https://jobs.ashbyhq.com/navan", enabled: true },
  { name: "Replit", domain: "replit.com", country: "US", ats_type: "ashby", ats_slug: "replit", careers_url: "https://jobs.ashbyhq.com/replit", enabled: true },
  { name: "Retool", domain: "retool.com", country: "US", ats_type: "ashby", ats_slug: "retool", careers_url: "https://jobs.ashbyhq.com/retool", enabled: true },
  { name: "Vercel", domain: "vercel.com", country: "US", ats_type: "ashby", ats_slug: "vercel", careers_url: "https://jobs.ashbyhq.com/vercel", enabled: true },
  { name: "dbt Labs", domain: "getdbt.com", country: "US", ats_type: "ashby", ats_slug: "dbtlabs", careers_url: "https://jobs.ashbyhq.com/dbtlabs", enabled: true },
  { name: "Clay", domain: "clay.com", country: "US", ats_type: "ashby", ats_slug: "claylabs", careers_url: "https://jobs.ashbyhq.com/claylabs", enabled: true },
  { name: "Attio", domain: "attio.com", country: "GB", ats_type: "ashby", ats_slug: "attio", careers_url: "https://jobs.ashbyhq.com/attio", enabled: true },
  { name: "ElevenLabs", domain: "elevenlabs.io", country: "US", ats_type: "ashby", ats_slug: "elevenlabs", careers_url: "https://jobs.ashbyhq.com/elevenlabs", enabled: true },
  { name: "Supabase", domain: "supabase.com", country: "US", ats_type: "ashby", ats_slug: "supabase", careers_url: "https://jobs.ashbyhq.com/supabase", enabled: true },
  { name: "Cursor", domain: "cursor.com", country: "US", ats_type: "ashby", ats_slug: "cursor", careers_url: "https://jobs.ashbyhq.com/cursor", enabled: true },
  { name: "Perplexity", domain: "perplexity.ai", country: "US", ats_type: "ashby", ats_slug: "perplexity", careers_url: "https://jobs.ashbyhq.com/perplexity", enabled: true },
  { name: "Harvey", domain: "harvey.ai", country: "US", ats_type: "ashby", ats_slug: "harvey", careers_url: "https://jobs.ashbyhq.com/harvey", enabled: true },
  { name: "Klarna", domain: "klarna.com", country: "SE", ats_type: "smartrecruiters", ats_slug: "Klarna", careers_url: "https://careers.smartrecruiters.com/Klarna", enabled: true },
  { name: "Visa", domain: "visa.com", country: "US", ats_type: "smartrecruiters", ats_slug: "Visa", careers_url: "https://careers.smartrecruiters.com/Visa", enabled: true },
];

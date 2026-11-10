// A starting list of sales-led B2B SaaS, security, data/AI and ad-tech companies that hire SDRs and BDRs.
// It is a suggestion only: nothing is added until you press the import button, and companies already
// watched or on your excluded list are skipped automatically.
export const SUGGESTED_COMPANIES: { name: string; domain: string; group: string }[] = [
  { name: "Salesloft", domain: "salesloft.com", group: "B2B SaaS" }, { name: "Apollo.io", domain: "apollo.io", group: "B2B SaaS" },
  { name: "ZoomInfo", domain: "zoominfo.com", group: "B2B SaaS" }, { name: "Clari", domain: "clari.com", group: "B2B SaaS" },
  { name: "Seismic", domain: "seismic.com", group: "B2B SaaS" }, { name: "6sense", domain: "6sense.com", group: "B2B SaaS" },
  { name: "Demandbase", domain: "demandbase.com", group: "B2B SaaS" }, { name: "Freshworks", domain: "freshworks.com", group: "B2B SaaS" },
  { name: "Postman", domain: "postman.com", group: "B2B SaaS" }, { name: "Chargebee", domain: "chargebee.com", group: "B2B SaaS" },
  { name: "Sprinklr", domain: "sprinklr.com", group: "B2B SaaS" }, { name: "Canva", domain: "canva.com", group: "B2B SaaS" },
  { name: "Okta", domain: "okta.com", group: "Security" }, { name: "CrowdStrike", domain: "crowdstrike.com", group: "Security" },
  { name: "SentinelOne", domain: "sentinelone.com", group: "Security" }, { name: "Snyk", domain: "snyk.io", group: "Security" },
  { name: "Wiz", domain: "wiz.io", group: "Security" }, { name: "Darktrace", domain: "darktrace.com", group: "Security" },
  { name: "Cloudflare", domain: "cloudflare.com", group: "Security" }, { name: "Datadog", domain: "datadoghq.com", group: "Data and AI" },
  { name: "Snowflake", domain: "snowflake.com", group: "Data and AI" }, { name: "Databricks", domain: "databricks.com", group: "Data and AI" },
  { name: "Fivetran", domain: "fivetran.com", group: "Data and AI" }, { name: "dbt Labs", domain: "getdbt.com", group: "Data and AI" },
  { name: "Confluent", domain: "confluent.io", group: "Data and AI" }, { name: "MongoDB", domain: "mongodb.com", group: "Data and AI" },
  { name: "Elastic", domain: "elastic.co", group: "Data and AI" }, { name: "Glean", domain: "glean.com", group: "Data and AI" },
  { name: "Writer", domain: "writer.com", group: "Data and AI" }, { name: "Cohere", domain: "cohere.com", group: "Data and AI" },
  { name: "Scale AI", domain: "scale.com", group: "Data and AI" }, { name: "Hugging Face", domain: "huggingface.co", group: "Data and AI" },
  { name: "The Trade Desk", domain: "thetradedesk.com", group: "Ad-tech and e-commerce" }, { name: "Criteo", domain: "criteo.com", group: "Ad-tech and e-commerce" },
  { name: "Outbrain", domain: "outbrain.com", group: "Ad-tech and e-commerce" }, { name: "Teads", domain: "teads.com", group: "Ad-tech and e-commerce" },
  { name: "Magnite", domain: "magnite.com", group: "Ad-tech and e-commerce" }, { name: "PubMatic", domain: "pubmatic.com", group: "Ad-tech and e-commerce" },
  { name: "AppsFlyer", domain: "appsflyer.com", group: "Ad-tech and e-commerce" }, { name: "Adjust", domain: "adjust.com", group: "Ad-tech and e-commerce" },
  { name: "Klaviyo", domain: "klaviyo.com", group: "Ad-tech and e-commerce" }, { name: "Attentive", domain: "attentive.com", group: "Ad-tech and e-commerce" },
  { name: "Braze", domain: "braze.com", group: "Ad-tech and e-commerce" }, { name: "Shopify", domain: "shopify.com", group: "Ad-tech and e-commerce" },
  { name: "BigCommerce", domain: "bigcommerce.com", group: "Ad-tech and e-commerce" }, { name: "MoEngage", domain: "moengage.com", group: "Ad-tech and e-commerce" },
  { name: "CleverTap", domain: "clevertap.com", group: "Ad-tech and e-commerce" }, { name: "Razorpay", domain: "razorpay.com", group: "Ad-tech and e-commerce" },
];

export const suggestedAsText = () => SUGGESTED_COMPANIES.map((c) => `${c.name}, ${c.domain}`).join("\n");

// The CV versions you keep, one per kind of role. Each is built from your master CV and reviewed by you.

export const CV_FAMILIES = [
  { id: "gtm", label: "GTM Specialist", focus: "GTM engineering: workflows, automation, enrichment, CRM and reporting, and the results they produced" },
  { id: "ae", label: "Associate AE", focus: "owning deals: discovery, closing, negotiation, pipeline and revenue results" },
  { id: "sdr", label: "SDR / BDR", focus: "outbound pipeline: meetings booked, sequences, volume, reply rates and quota results" },
] as const;

export type CvFamilyId = typeof CV_FAMILIES[number]["id"];

export const familyById = (id: string) => CV_FAMILIES.find((f) => f.id === id);

export type AtsType = "greenhouse" | "lever" | "ashby" | "smartrecruiters";

export interface SeedCompany {
  name: string;
  ats: AtsType;
  slug: string;
  country?: string;
}

/** A job as it comes out of an ATS feed, before cleaning. */
export interface RawJob {
  company: string;
  ats: AtsType;
  externalId: string;
  title: string;
  location: string;
  url: string;
  postedAt?: string;
  description?: string; // plain text
  compensationText?: string;
  remoteFlag?: boolean;
}

export type Market = "india" | "remote-in" | "emea" | "us" | "global";
export type RemoteType = "remote" | "hybrid" | "onsite" | "unknown";

/** A cleaned job, ready to store and score. */
export interface Job {
  id: string; // dedupe hash
  company: string;
  title: string;
  location: string;
  remoteType: RemoteType;
  market: Market;
  sourceType: "careers";
  board: string;
  url: string;
  postedAt?: string;
  lastCheckedAt: string;
  currency?: string;
  payMin?: number;
  payMax?: number;
  payBandStatus: "verified" | "unknown";
  visaSponsorship: "yes" | "no" | "unknown";
  roleFamily: RoleFamily;
  description: string;
  companyQuality?: number; // 0-100, see lib/companyQuality.ts
}

export type RoleFamily = "SDR/BDR" | "GTM Engineer" | "Account Executive" | "Sales leadership" | "Other sales";

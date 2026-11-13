// Turns application rows into the live feed: one entry per application, newest first, with the robot's latest steps.
import { detailOf, groupOf, type AppFacts, type AppGroup } from "@/lib/application-status";

export interface FeedRow extends AppFacts {
  id: string;
  title: string;
  company: string;
  updated_at: string | null;
  auto_at: string | null;
}

export interface FeedItem {
  id: string;
  title: string;
  company: string;
  group: AppGroup;
  /** True while the robot is queued or working on it. */
  active: boolean;
  headline: string;
  steps: string[];
  at: string | null;
}

const MAX_STEPS = 4;

export function toFeed(rows: FeedRow[], limit = 20): FeedItem[] {
  return rows
    .map((r): FeedItem => {
      const group = groupOf(r);
      const steps = (r.auto_log ?? "").split("\n").map((l) => l.trim()).filter(Boolean).slice(-MAX_STEPS).map((l) => l.slice(0, 160));
      return {
        id: r.id, title: r.title, company: r.company, group,
        active: group === "in_progress" && (r.auto_status === "queued" || r.auto_status === "running" || r.auto_status === "filled"),
        headline: detailOf(r), steps, at: r.auto_at ?? r.updated_at,
      };
    })
    .sort((a, b) => Date.parse(b.at ?? "") - Date.parse(a.at ?? "") || 0)
    .slice(0, limit);
}

/** How long to wait before asking again: quick while the robot is busy, slow when nothing moves. */
export function pollDelayMs(items: FeedItem[]): number {
  return items.some((i) => i.active) ? 5000 : 30000;
}

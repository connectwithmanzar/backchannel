// One place that says which pages belong to which section, so the menu, the section strip and the tests agree.
// The main menu is deliberately short: Copilots, Jobs, Companies, Saved jobs. Everything else sits under "More".

export type NavLink = { href: string; label: string };
export type Section = NavLink & { match: string[]; sub: NavLink[]; inMenu: boolean };

export const SECTIONS: Section[] = [
  { href: "/copilots", label: "Copilots", match: ["/copilots"], sub: [], inMenu: true },
  { href: "/roles", label: "Jobs", match: ["/roles", "/swipe"], sub: [{ href: "/roles", label: "List" }, { href: "/swipe", label: "Swipe" }, { href: "/swipe?view=grid", label: "Grid" }], inMenu: true },
  {
    href: "/companies", label: "Companies", match: ["/companies", "/sources"], inMenu: true,
    sub: [{ href: "/companies", label: "My companies" }, { href: "/sources", label: "Where roles come from" }],
  },
  { href: "/saved", label: "Saved jobs", match: ["/saved"], sub: [], inMenu: true },
  { href: "/today", label: "Today", match: ["/today"], sub: [], inMenu: false },
  {
    href: "/outreach", label: "People", match: ["/outreach", "/referrals"], inMenu: false,
    sub: [{ href: "/outreach", label: "Messages" }, { href: "/referrals", label: "Referrals" }],
  },
  {
    href: "/applications", label: "Applications", match: ["/applications", "/inbox", "/autopilot", "/pipeline", "/offers", "/pay", "/practice"], inMenu: false,
    sub: [
      { href: "/applications", label: "Tracker" }, { href: "/inbox", label: "Replies" }, { href: "/autopilot", label: "To apply" }, { href: "/pipeline", label: "Pipeline" },
      { href: "/offers", label: "Offers" }, { href: "/practice", label: "Practice" }, { href: "/pay", label: "Pay benchmark" },
    ],
  },
];

/** The tabs in the main menu. */
export const TABS: Section[] = SECTIONS.filter((s) => s.inMenu);

/** Under "More": the sections left out of the main menu, plus rarely used pages. Your profile is the avatar at the top right. */
export const MORE_LINKS: NavLink[] = [
  ...SECTIONS.filter((s) => !s.inMenu).map((s) => ({ href: s.href, label: s.label })),
  { href: "/side-income", label: "Side income" },
  { href: "/extension", label: "Chrome extension" },
];

export const isOn = (path: string, href: string): boolean => path === href || path.startsWith(`${href}/`);

export const tabIsActive = (path: string, tab: Section): boolean => tab.match.some((m) => isOn(path, m));

/** True when you are on a page that lives under "More" rather than a main tab. */
export const moreIsActive = (path: string): boolean =>
  SECTIONS.some((s) => !s.inMenu && tabIsActive(path, s)) || ["/side-income", "/extension"].some((h) => isOn(path, h));

/** The section strip under the main bar: the sub-pages of whichever section you are on (none for single-page sections). */
export const subLinksFor = (path: string): NavLink[] => SECTIONS.find((s) => tabIsActive(path, s))?.sub ?? [];

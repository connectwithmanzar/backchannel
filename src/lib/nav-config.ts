// One place that says which pages belong to which tab, so the menu, the section strip and the tests agree.

export type NavLink = { href: string; label: string };
export type Tab = NavLink & { match: string[]; sub: NavLink[] };

export const TABS: Tab[] = [
  { href: "/today", label: "Today", match: ["/today"], sub: [] },
  { href: "/roles", label: "Jobs", match: ["/roles"], sub: [] },
  {
    href: "/companies", label: "Companies", match: ["/companies", "/sources"],
    sub: [{ href: "/companies", label: "My companies" }, { href: "/sources", label: "Where roles come from" }],
  },
  {
    href: "/outreach", label: "People", match: ["/outreach", "/referrals"],
    sub: [{ href: "/outreach", label: "Messages" }, { href: "/referrals", label: "Referrals" }],
  },
  {
    href: "/autopilot", label: "Applications", match: ["/autopilot", "/pipeline", "/offers", "/pay"],
    sub: [
      { href: "/autopilot", label: "To apply" }, { href: "/pipeline", label: "Pipeline" },
      { href: "/offers", label: "Offers" }, { href: "/pay", label: "Pay benchmark" },
    ],
  },
];

// Rarely used pages. Your profile is the avatar at the top right, not a menu item.
export const MORE_LINKS: NavLink[] = [
  { href: "/side-income", label: "Side income" },
  { href: "/extension", label: "Chrome extension" },
];

export const isOn = (path: string, href: string): boolean => path === href || path.startsWith(`${href}/`);

export const tabIsActive = (path: string, tab: Tab): boolean => tab.match.some((m) => isOn(path, m));

/** The section strip under the main bar: the sub-pages of whichever tab you are on (none for single-page tabs). */
export const subLinksFor = (path: string): NavLink[] => TABS.find((t) => tabIsActive(path, t))?.sub ?? [];

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/roles", label: "Roles" },
  { href: "/companies", label: "Great companies" },
  { href: "/autopilot", label: "Autopilot" },
  { href: "/outreach", label: "Outreach" },
  { href: "/profile", label: "My profile" },
  { href: "/pay", label: "Pay benchmark" },
  { href: "/referrals", label: "Referrals" },
  { href: "/side-income", label: "Side income" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-2.5">
        <Link href="/roles" className="flex items-center gap-2 font-display text-xl font-extrabold">
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
            <rect x="1" y="1" width="24" height="24" rx="7" fill="var(--accent)" />
            <path d="M7 9h9M7 13h12M7 17h6" stroke="var(--accent-ink)" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          Backchannel
        </Link>
        <nav aria-label="Main" className="flex flex-1 flex-wrap gap-1">
          {LINKS.map((l) => {
            const on = path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={on ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${on ? "bg-accent-soft text-fg" : "text-muted hover:text-fg"}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

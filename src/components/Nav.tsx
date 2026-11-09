"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type NavLink = { href: string; label: string };
type Group = { id: string; label: string; links: NavLink[] };

const PRIMARY: NavLink[] = [
  { href: "/today", label: "Today" },
  { href: "/roles", label: "Roles" },
  { href: "/companies", label: "Companies" },
];

const GROUPS: Group[] = [
  { id: "pipeline", label: "Pipeline", links: [
    { href: "/autopilot", label: "Autopilot" }, { href: "/outreach", label: "Outreach" },
    { href: "/referrals", label: "Referrals" }, { href: "/offers", label: "Offers" },
  ] },
  { id: "more", label: "More", links: [
    { href: "/profile", label: "My profile" }, { href: "/pay", label: "Pay benchmark" },
    { href: "/side-income", label: "Side income" }, { href: "/sources", label: "Sources" },
  ] },
];

const isOn = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

export default function Nav({ email }: { email: string }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setOpen(null); }, [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    const onClick = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(null); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [open]);

  // Never show the private nav on the sign-in or auth screens.
  if (path.startsWith("/login") || path.startsWith("/auth")) return null;

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const groupActive = (g: Group) => g.links.some((l) => isOn(path, l.href));

  function Menu({ g, where }: { g: Group; where: "top" | "bottom" }) {
    return (
      <ul id={`menu-${where}-${g.id}`}
        className={where === "top"
          ? "absolute left-0 top-full z-30 mt-1 min-w-48 rounded-xl border border-line bg-surface p-1 shadow-lg"
          : "fixed inset-x-3 z-30 rounded-2xl border border-line bg-surface p-1 shadow-2xl"}
        style={where === "bottom" ? { bottom: "calc(env(safe-area-inset-bottom, 0px) + 68px)" } : undefined}>
        {g.links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} aria-current={isOn(path, l.href) ? "page" : undefined}
              className={`block rounded-lg px-3 py-2.5 text-sm font-medium md:py-2 ${isOn(path, l.href) ? "bg-accent-soft text-fg" : "text-muted hover:bg-sunk hover:text-fg"}`}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div ref={rootRef}>
      <header className="sticky top-0 z-20 border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <Link href="/today" className="flex items-center gap-2 font-display text-xl font-extrabold">
            <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
              <rect x="1" y="1" width="24" height="24" rx="7" fill="var(--accent)" />
              <path d="M7 9h9M7 13h12M7 17h6" stroke="var(--accent-ink)" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            Backchannel
          </Link>

          <nav aria-label="Main" className="ml-2 hidden flex-1 items-center gap-1 md:flex">
            {PRIMARY.map((l) => (
              <Link key={l.href} href={l.href} aria-current={isOn(path, l.href) ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${isOn(path, l.href) ? "bg-accent-soft text-fg" : "text-muted hover:text-fg"}`}>
                {l.label}
              </Link>
            ))}
            {GROUPS.map((g) => (
              <div key={g.id} className="relative">
                <button type="button" aria-expanded={open === `top-${g.id}`} aria-controls={`menu-top-${g.id}`}
                  onClick={() => setOpen(open === `top-${g.id}` ? null : `top-${g.id}`)}
                  className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium ${groupActive(g) ? "bg-accent-soft text-fg" : "text-muted hover:text-fg"}`}>
                  {g.label}
                  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                {open === `top-${g.id}` && <Menu g={g} where="top" />}
              </div>
            ))}
          </nav>

          {email && <span className="ml-auto hidden truncate text-sm text-muted md:block" title="Signed in as">{email}</span>}
          <button onClick={signOut} className="ml-auto rounded-full px-3 py-1.5 text-sm font-medium text-muted hover:text-fg md:ml-0">
            Sign out
          </button>
        </div>
      </header>

      <nav aria-label="Main (mobile)" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="mx-auto grid max-w-md grid-cols-5">
          {PRIMARY.map((l) => (
            <Link key={l.href} href={l.href} aria-current={isOn(path, l.href) ? "page" : undefined}
              className={`py-3.5 text-center text-xs font-semibold ${isOn(path, l.href) ? "text-accent" : "text-muted"}`}>
              {l.label}
            </Link>
          ))}
          {GROUPS.map((g) => (
            <button key={g.id} type="button" aria-expanded={open === `bottom-${g.id}`} aria-controls={`menu-bottom-${g.id}`}
              onClick={() => setOpen(open === `bottom-${g.id}` ? null : `bottom-${g.id}`)}
              className={`py-3.5 text-center text-xs font-semibold ${groupActive(g) || open === `bottom-${g.id}` ? "text-accent" : "text-muted"}`}>
              {g.label}
            </button>
          ))}
        </div>
        {GROUPS.map((g) => open === `bottom-${g.id}` && <Menu key={g.id} g={g} where="bottom" />)}
      </nav>
    </div>
  );
}

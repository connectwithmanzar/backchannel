"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TABS, MORE_LINKS, subLinksFor, isOn, tabIsActive, moreIsActive } from "@/lib/nav-config";

const ICON_PATHS: Record<string, ReactNode> = {
  "/copilots": <path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z" />,
  "/roles": <path d="M4 8h16v11H4zM9 8V5.5h6V8M4 13h16" />,
  "/companies": <path d="M5 20V5h9v15M14 10h5v10M8 9h3M8 13h3M8 17h3M3 20h18" />,
  "/saved": <path d="M7 4h10v16l-5-3.5L7 20z" />,
  more: <path d="M6 12h.01M12 12h.01M18 12h.01" strokeWidth="3" />,
};

function Icon({ name }: { name: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

const desktopTab = (active: boolean) =>
  `relative inline-flex items-center gap-2 whitespace-nowrap px-2.5 py-4 text-[15px] lg:px-3 font-medium transition-colors after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full ${
    active ? "text-fg after:bg-accent" : "text-muted after:bg-transparent hover:text-fg"
  }`;

const iconChip = (active: boolean) =>
  `flex h-8 w-8 items-center justify-center rounded-lg ${active ? "bg-accent-soft text-accent" : ""}`;

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

  const moreActive = moreIsActive(path);
  const onProfile = isOn(path, "/profile");
  const initial = (email.trim()[0] ?? "?").toUpperCase();
  const subLinks = subLinksFor(path);

  const avatar = (
    <Link href="/profile" aria-label="Your profile" aria-current={onProfile ? "page" : undefined}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${onProfile ? "bg-accent text-accent-ink" : "bg-accent-soft text-accent hover:opacity-90"}`}>
      {initial}
    </Link>
  );

  function MoreMenu({ where }: { where: "top" | "bottom" }) {
    return (
      <ul id={`menu-${where}-more`}
        className={where === "top"
          ? "absolute left-0 top-full z-30 mt-1 min-w-52 rounded-2xl border border-line bg-surface p-1.5 shadow-[0_8px_30px_rgba(81,101,184,0.18)]"
          : "fixed inset-x-3 z-30 rounded-2xl border border-line bg-surface p-1.5 shadow-2xl"}
        style={where === "bottom" ? { bottom: "calc(env(safe-area-inset-bottom, 0px) + 68px)" } : undefined}>
        {MORE_LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} aria-current={isOn(path, l.href) ? "page" : undefined}
              className={`block rounded-xl px-3 py-2.5 text-sm font-medium md:py-2 ${isOn(path, l.href) ? "bg-accent-soft font-semibold text-accent" : "text-muted hover:bg-sunk hover:text-fg"}`}>
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
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4">
          <Link href="/copilots" className="flex items-center gap-2 py-3 font-display text-xl font-extrabold text-accent">
            <svg width="28" height="28" viewBox="0 0 26 26" aria-hidden="true">
              <rect x="1" y="1" width="24" height="24" rx="8" fill="var(--accent)" />
              <path d="M7 9h9M7 13h12M7 17h6" stroke="var(--accent-ink)" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            Backchannel
          </Link>

          <nav aria-label="Main" className="ml-4 hidden flex-1 items-center gap-1 md:flex">
            {TABS.map((t) => {
              const active = tabIsActive(path, t);
              return (
                <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={desktopTab(active)}>
                  <span className={iconChip(active)}><Icon name={t.href} /></span>
                  {t.label}
                </Link>
              );
            })}
            <div className="relative">
              <button type="button" aria-expanded={open === "top-more"} aria-controls="menu-top-more"
                onClick={() => setOpen(open === "top-more" ? null : "top-more")}
                className={desktopTab(moreActive)}>
                <span className={iconChip(moreActive)}><Icon name="more" /></span>
                More
              </button>
              {open === "top-more" && <MoreMenu where="top" />}
            </div>
          </nav>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            {email && <span className="hidden max-w-48 truncate text-sm text-muted xl:block" title="Signed in as">{email}</span>}
            {avatar}
            <button onClick={signOut} className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium text-muted hover:text-fg">
              Sign out
            </button>
          </div>
        </div>

        {subLinks.length > 0 && (
          <nav aria-label="Section" className="border-t border-line bg-sunk">
            <div className="mx-auto flex max-w-6xl gap-1.5 overflow-x-auto px-4 py-2">
              {subLinks.map((l) => (
                <Link key={l.href} href={l.href} aria-current={isOn(path, l.href) ? "page" : undefined}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${isOn(path, l.href) ? "bg-accent-soft font-semibold text-accent" : "text-muted hover:bg-surface hover:text-fg"}`}>
                  {l.label}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </header>

      <nav aria-label="Main (mobile)" className={`fixed inset-x-0 bottom-0 ${open?.startsWith("bottom") ? "z-50" : "z-20"} rounded-t-2xl border-t border-line bg-surface shadow-[0_-4px_20px_rgba(81,101,184,0.1)] md:hidden`}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="mx-auto grid max-w-md grid-cols-5">
          {TABS.map((t) => {
            const active = tabIsActive(path, t);
            return (
              <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${active ? "text-accent" : "text-muted"}`}>
                <Icon name={t.href} />
                {t.label}
              </Link>
            );
          })}
          <button type="button" aria-expanded={open === "bottom-more"} aria-controls="menu-bottom-more"
            onClick={() => setOpen(open === "bottom-more" ? null : "bottom-more")}
            className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${moreActive || open === "bottom-more" ? "text-accent" : "text-muted"}`}>
            <Icon name="more" />
            More
          </button>
        </div>
        {open === "bottom-more" && <MoreMenu where="bottom" />}
      </nav>
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TABS, MORE_LINKS, subLinksFor, isOn, tabIsActive } from "@/lib/nav-config";

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

  const moreActive = MORE_LINKS.some((l) => isOn(path, l.href));
  const onProfile = isOn(path, "/profile");
  const initial = (email.trim()[0] ?? "?").toUpperCase();
  const subLinks = subLinksFor(path);

  const avatar = (
    <Link href="/profile" aria-label="Your profile" aria-current={onProfile ? "page" : undefined}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${onProfile ? "bg-accent text-accent-ink" : "bg-fg text-bg hover:opacity-90"}`}>
      {initial}
    </Link>
  );

  function MoreMenu({ where }: { where: "top" | "bottom" }) {
    return (
      <ul id={`menu-${where}-more`}
        className={where === "top"
          ? "absolute left-0 top-full z-30 mt-1 min-w-48 rounded-xl border border-line bg-surface p-1 shadow-lg"
          : "fixed inset-x-3 z-30 rounded-2xl border border-line bg-surface p-1 shadow-2xl"}
        style={where === "bottom" ? { bottom: "calc(env(safe-area-inset-bottom, 0px) + 68px)" } : undefined}>
        {MORE_LINKS.map((l) => (
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
          <Link href="/today" className="flex items-center gap-2 font-display text-xl font-bold">
            <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
              <rect x="1" y="1" width="24" height="24" rx="7" fill="var(--accent)" />
              <path d="M7 9h9M7 13h12M7 17h6" stroke="var(--accent-ink)" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            Backchannel
          </Link>

          <nav aria-label="Main" className="ml-2 hidden flex-1 items-center gap-1 md:flex">
            {TABS.map((t) => (
              <Link key={t.href} href={t.href} aria-current={tabIsActive(path, t) ? "page" : undefined}
                className={`rounded-xl px-3.5 py-2 text-sm font-medium ${tabIsActive(path, t) ? "bg-accent-soft font-semibold text-accent" : "text-muted hover:bg-sunk hover:text-fg"}`}>
                {t.label}
              </Link>
            ))}
            <div className="relative">
              <button type="button" aria-expanded={open === "top-more"} aria-controls="menu-top-more"
                onClick={() => setOpen(open === "top-more" ? null : "top-more")}
                className={`flex items-center gap-1 rounded-xl px-3.5 py-2 text-sm font-medium ${moreActive ? "bg-accent-soft font-semibold text-accent" : "text-muted hover:bg-sunk hover:text-fg"}`}>
                More
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              {open === "top-more" && <MoreMenu where="top" />}
            </div>
          </nav>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            {email && <span className="hidden max-w-48 truncate text-sm text-muted lg:block" title="Signed in as">{email}</span>}
            {avatar}
            <button onClick={signOut} className="rounded-full px-3 py-1.5 text-sm font-medium text-muted hover:text-fg">
              Sign out
            </button>
          </div>
        </div>

        {subLinks.length > 0 && (
          <nav aria-label="Section" className="border-t border-line bg-bg">
            <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-1.5">
              {subLinks.map((l) => (
                <Link key={l.href} href={l.href} aria-current={isOn(path, l.href) ? "page" : undefined}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ${isOn(path, l.href) ? "bg-fg font-semibold text-bg" : "text-muted hover:bg-sunk hover:text-fg"}`}>
                  {l.label}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </header>

      <nav aria-label="Main (mobile)" className={`fixed inset-x-0 bottom-0 ${open?.startsWith("bottom") ? "z-50" : "z-20"} border-t border-line bg-surface md:hidden`}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="mx-auto grid max-w-md grid-cols-6">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} aria-current={tabIsActive(path, t) ? "page" : undefined}
              className={`py-3.5 text-center text-[11px] font-semibold ${tabIsActive(path, t) ? "text-accent" : "text-muted"}`}>
              {t.label}
            </Link>
          ))}
          <button type="button" aria-expanded={open === "bottom-more"} aria-controls="menu-bottom-more"
            onClick={() => setOpen(open === "bottom-more" ? null : "bottom-more")}
            className={`py-3.5 text-center text-[11px] font-semibold ${moreActive || open === "bottom-more" ? "text-accent" : "text-muted"}`}>
            More
          </button>
        </div>
        {open === "bottom-more" && <MoreMenu where="bottom" />}
      </nav>
    </div>
  );
}

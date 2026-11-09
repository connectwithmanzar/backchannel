"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);

    if (authError) {
      setError(authError.message);
    } else {
      setSent(true);
    }
  }

  async function signInWith(provider: "google" | "linkedin_oidc") {
    setError("");
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (authError) setError(authError.message);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-sm">
        {/* Logo */}
        <div className="mb-8 flex items-center gap-2">
          <svg width="32" height="32" viewBox="0 0 26 26" aria-hidden="true">
            <rect x="1" y="1" width="24" height="24" rx="7" fill="var(--accent)" />
            <path d="M7 9h9M7 13h12M7 17h6" stroke="var(--accent-ink)" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          <span className="font-display text-2xl font-extrabold">Backchannel</span>
        </div>

        {sent ? (
          <div>
            <p className="mb-2 font-semibold text-good">Check your inbox</p>
            <p className="text-sm text-muted">
              We sent an email to <strong>{email}</strong>. The first time, it asks you to
              confirm your address; after that it&apos;s a sign-in link. Click it to open
              Backchannel. You can close this tab.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <p className="mb-4 text-sm text-muted">
                Enter your email and we&apos;ll send you a link — no password needed. The first
                email asks you to confirm your address; later visits get a sign-in link.
              </p>
              <label className="mb-1 block text-sm font-medium" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-line bg-sunk px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </div>

            {error && (
              <p className="rounded-lg border border-warn bg-warn-soft px-3 py-2 text-sm text-warn">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send sign-in link"}
            </button>
          </form>
        )}

        {!sent && (process.env.NEXT_PUBLIC_GOOGLE_LOGIN === "1" || process.env.NEXT_PUBLIC_LINKEDIN_LOGIN === "1") && (
          <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
            {process.env.NEXT_PUBLIC_GOOGLE_LOGIN === "1" && (
              <button type="button" onClick={() => signInWith("google")}
                className="w-full rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold transition hover:border-fg/40">
                Continue with Google
              </button>
            )}
            {process.env.NEXT_PUBLIC_LINKEDIN_LOGIN === "1" && (
              <button type="button" onClick={() => signInWith("linkedin_oidc")}
                className="w-full rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold transition hover:border-fg/40">
                Continue with LinkedIn
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import type { Metadata, Viewport } from "next";
import Nav from "@/components/Nav";
import ChatWidget from "@/components/ChatWidget";
import ExecutionHUD from "@/components/ExecutionHUD";
import KeyboardNavigation from "@/components/KeyboardNavigation";
import { getSessionUser } from "@/lib/supabase/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Backchannel",
  description:
    "It finds matching public roles and drafts a truthful CV plus a referral ask you send, and you apply yourself.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();

  return (
    <html lang="en">
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body className="font-sans text-[15px] leading-relaxed antialiased">
        {user && <Nav email={user.email ?? ""} />}
        <main className="mx-auto max-w-6xl px-4 pb-24 max-md:pb-44">{children}</main>
        {user && <ChatWidget />}
        {user && <ExecutionHUD />}
        {user && <KeyboardNavigation />}
      </body>
    </html>
  );
}

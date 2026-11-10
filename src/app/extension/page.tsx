import { Card, btnPrimary } from "@/components/ui";

export const metadata = { title: "Chrome extension · Backchannel" };

const STEPS: { title: string; body: string }[] = [
  { title: "Download and unzip", body: "Press the button below. Open the downloaded file so it becomes a folder called backchannel-extension." },
  { title: "Open Chrome's extensions page", body: "In Chrome, type chrome://extensions in the address bar and press Enter." },
  { title: "Turn on Developer mode", body: "Switch on Developer mode in the top right corner of that page." },
  { title: "Load the folder", body: "Press Load unpacked and choose the backchannel-extension folder. Backchannel now appears in the list." },
  { title: "Pin it", body: "Click the puzzle-piece icon next to the address bar and pin Backchannel so its button is always there." },
  { title: "Stay signed in", body: "Keep Backchannel signed in on this same Chrome. The extension uses that sign-in; it never asks for or stores a password." },
];

export default function ExtensionPage() {
  return (
    <section className="py-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">Chrome extension</h1>
        <p className="mt-1 max-w-[62ch] text-muted">Open any job on LinkedIn, Naukri, a careers page or a job board, press the Backchannel button, and see how well it fits you. Save it with one click.</p>
      </header>

      <div className="flex flex-wrap items-start gap-6">
        <Card className="min-w-0 flex-[999_1_480px] sm:p-6">
          <h2 className="mb-4 text-xl font-semibold">Install in about two minutes</h2>
          <ol className="flex flex-col gap-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent" aria-hidden="true">{i + 1}</span>
                <div><b>{s.title}</b><p className="text-sm text-muted">{s.body}</p></div>
              </li>
            ))}
          </ol>
          <a href="/backchannel-extension.zip" download className={`${btnPrimary} mt-6`}>Download the extension</a>
        </Card>

        <aside className="flex min-w-[280px] flex-[1_1_320px] flex-col gap-4">
          <Card>
            <h2 className="mb-2 text-[17px] font-semibold">What it does</h2>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
              <li>Scores the job on screen against your profile, with the reasons.</li>
              <li>Warns when a role does not look open to candidates in India.</li>
              <li>Saves it to your Matches, where you can tailor your CV.</li>
              <li>Opens the people-finder for that company.</li>
            </ul>
          </Card>
          <Card>
            <h2 className="mb-2 text-[17px] font-semibold">What it never does</h2>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
              <li>It reads a page only at the moment you press its button, and only that tab.</li>
              <li>It never signs in for you, clicks, applies or sends anything.</li>
              <li>It never stores your LinkedIn or Naukri login.</li>
              <li>Pages on sites like LinkedIn are read by your own browser as you look at them. Backchannel&apos;s servers never visit them.</li>
            </ul>
          </Card>
        </aside>
      </div>
    </section>
  );
}

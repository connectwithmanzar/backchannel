import { PageHeader } from "@/components/ui";
import { hasAIKey } from "@/lib/ai";
import PracticeClient from "./PracticeClient";

export const dynamic = "force-dynamic";

export default function PracticePage() {
  return (
    <section className="py-6">
      <PageHeader eyebrow="Applications · Practice" title="Practice your answers">
        Pick a question, answer it in your own words (type it, or dictate it where your browser allows), and get quick feedback. Salary, notice period and visa questions are not here on purpose: Backchannel never answers those for you, so rehearse them out loud yourself.
      </PageHeader>
      <PracticeClient aiReady={hasAIKey()} />
    </section>
  );
}

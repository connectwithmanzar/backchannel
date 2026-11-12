import { PageHeader } from "@/components/ui";
import CopilotForm from "../CopilotForm";

export default function NewCopilotPage() {
  return (
    <section className="py-6">
      <PageHeader eyebrow="Copilots" title="New Copilot">Set up the search once. You can change it any time.</PageHeader>
      <CopilotForm />
    </section>
  );
}

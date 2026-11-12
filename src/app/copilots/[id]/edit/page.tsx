import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { loadCopilot } from "@/lib/copilot-data";
import CopilotForm from "../../CopilotForm";

export const dynamic = "force-dynamic";

export default async function EditCopilotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [db, user] = await Promise.all([createClient(), getSessionUser()]);
  const copilot = user ? await loadCopilot(db, user.id, id) : null;
  if (!copilot) notFound();
  return (
    <section className="py-6">
      <PageHeader eyebrow="Copilots" title={`Edit ${copilot.name}`}>Change the search. Past matches are not affected.</PageHeader>
      <CopilotForm initial={copilot} />
    </section>
  );
}

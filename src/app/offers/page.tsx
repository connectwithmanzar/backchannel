import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { compareOffers, type OfferInput } from "@/lib/offers";
import OffersClient from "./OffersClient";

export const dynamic = "force-dynamic";

export default async function OffersPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const { data } = await db.from("offers").select("*").eq("user_id", user?.id ?? "").order("created_at", { ascending: false });
  return (
    <section className="py-6">
      <PageHeader eyebrow="Offers" title="Compare your offers side by side">
        Add each offer you receive. Yearly cash is converted to US dollars so offers in different currencies compare fairly. Equity and visa notes are shown as you wrote them, never estimated.
      </PageHeader>
      <OffersClient offers={compareOffers((data ?? []) as OfferInput[])} />
    </section>
  );
}

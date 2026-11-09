import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="text-2xl font-extrabold">Page not found</h1>
      <p className="mt-2 text-muted">That page doesn&apos;t exist, or it moved.</p>
      <Link href="/today" className="mt-5 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:opacity-90">Go to Today</Link>
    </div>
  );
}

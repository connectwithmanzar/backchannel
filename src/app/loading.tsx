export default function Loading() {
  return (
    <div className="py-10" role="status" aria-live="polite">
      <div className="h-4 w-28 animate-pulse rounded bg-sunk" />
      <div className="mt-3 h-9 w-2/3 max-w-md animate-pulse rounded bg-sunk" />
      <div className="mt-6 grid gap-3">
        <div className="h-24 animate-pulse rounded-card bg-sunk" />
        <div className="h-24 animate-pulse rounded-card bg-sunk" />
        <div className="h-24 animate-pulse rounded-card bg-sunk" />
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}

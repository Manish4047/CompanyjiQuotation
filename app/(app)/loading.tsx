/**
 * Generic shell skeleton shown while server components stream.
 * Per-page skeletons (dashboard metric cards, pipeline rows) can be added later
 * as nested loading.tsx files when we want richer feedback.
 */
export default function AppLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-3">
        <div className="h-3 w-32 animate-pulse rounded bg-neutral-200" />
        <div className="h-8 w-64 animate-pulse rounded bg-neutral-200" />
        <div className="h-4 w-96 animate-pulse rounded bg-neutral-100" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-lg border border-[#d9ded1] bg-white shadow-sm"
          />
        ))}
      </div>

      <div className="h-72 animate-pulse rounded-lg border border-[#d9ded1] bg-white shadow-sm" />
      <span className="sr-only">Loading page content…</span>
    </div>
  );
}

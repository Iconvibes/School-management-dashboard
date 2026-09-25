/**
 * DashboardSkeleton
 *
 * A wireframe placeholder shown for the split second a portal dashboard is
 * fetching its initial data. It mirrors the real layout — sidebar (hidden
 * below lg), sticky header bar, stat cards and content panels — so the swap
 * to the loaded page doesn't jump or flash. Purely decorative: no data, no
 * interactivity, `animate-pulse` grey blocks throughout.
 */
export default function DashboardSkeleton() {
  return (
    <main className="flex min-h-screen flex-1 bg-navy-50">
      {/* Sidebar placeholder — same width (w-64) and only visible on lg+,
          exactly like the real Sidebar. */}
      <div className="hidden w-64 shrink-0 flex-col gap-4 border-r border-navy-200/70 bg-navy-900 p-5 lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 animate-pulse rounded-lg bg-white/15" />
          <div className="h-4 w-24 animate-pulse rounded bg-white/15" />
        </div>
        <div className="mt-4 space-y-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="h-4 animate-pulse rounded bg-white/10"
              style={{ width: `${85 - (i % 3) * 12}%` }}
            />
          ))}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        {/* Sticky header placeholder */}
        <div className="flex h-16 items-center justify-between border-b border-navy-200/70 bg-white/80 px-5 backdrop-blur-lg">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-pulse rounded bg-navy-200 lg:hidden" />
            <div className="h-7 w-7 animate-pulse rounded-lg bg-navy-200" />
            <div className="space-y-1.5">
              <div className="h-3.5 w-40 animate-pulse rounded bg-navy-200" />
              <div className="h-3 w-28 animate-pulse rounded bg-navy-100" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden h-6 w-24 animate-pulse rounded-full bg-navy-100 sm:block" />
            <div className="h-9 w-9 animate-pulse rounded-full bg-navy-200" />
          </div>
        </div>

        {/* Content placeholder */}
        <div className="mx-auto max-w-7xl px-5 py-8">
          <div className="mb-6 h-8 w-56 animate-pulse rounded bg-navy-200" />

          {/* Stat cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-navy-100 bg-white p-5">
                <div className="h-3.5 w-24 animate-pulse rounded bg-navy-100" />
                <div className="mt-3 h-7 w-16 animate-pulse rounded bg-navy-200" />
                <div className="mt-2 h-3 w-32 animate-pulse rounded bg-navy-100" />
              </div>
            ))}
          </div>

          {/* Content panels */}
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-navy-100 bg-white p-5 lg:col-span-2">
              <div className="mb-4 h-4 w-40 animate-pulse rounded bg-navy-200" />
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-9 w-9 animate-pulse rounded-full bg-navy-100" />
                    <div className="flex-1">
                      <div className="h-3.5 w-3/4 animate-pulse rounded bg-navy-100" />
                      <div className="mt-1.5 h-3 w-1/2 animate-pulse rounded bg-navy-50" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-navy-100 bg-white p-5">
              <div className="mb-4 h-4 w-28 animate-pulse rounded bg-navy-200" />
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-3.5 animate-pulse rounded bg-navy-100"
                    style={{ width: `${90 - i * 15}%` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

/** Loading placeholder for the Today dashboard — shown until the first digest arrives. */
export function TodaySkeleton() {
  return (
    <div className="animate-pulse space-y-5" aria-hidden>
      <div className="flex flex-wrap gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[58px] w-40 rounded-xl bg-bg-secondary/60 border border-border-primary" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5 items-start">
        <div className="space-y-5">
          <div className="h-32 rounded-2xl bg-bg-secondary/40 border border-border-primary" />
          <div className="h-72 rounded-2xl bg-bg-secondary/40 border border-border-primary" />
        </div>
        <div className="space-y-5">
          <div className="h-56 rounded-2xl bg-bg-secondary/40 border border-border-primary" />
          <div className="h-40 rounded-2xl bg-bg-secondary/40 border border-border-primary" />
        </div>
      </div>
    </div>
  );
}

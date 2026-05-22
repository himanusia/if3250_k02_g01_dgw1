import { Skeleton } from "@/components/ui/skeleton";

export default function Loader() {
  return (
    <div className="h-full overflow-y-auto">
      <main className="container mx-auto space-y-6 px-4 py-6">
        <section className="bg-card ring-foreground/10 p-5 ring-1">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="w-full max-w-3xl space-y-3">
              <Skeleton className="h-3 w-44" />
              <Skeleton className="h-8 w-80 max-w-full" />
              <Skeleton className="h-4 w-full max-w-2xl" />
            </div>
            <Skeleton className="h-10 w-36" />
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <article key={index} className="bg-card ring-foreground/10 p-4 ring-1">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="mt-3 h-8 w-20" />
              <Skeleton className="mt-2 h-3 w-40 max-w-full" />
            </article>
          ))}
        </section>

        <section className="space-y-3">
          <Skeleton className="h-6 w-44" />
          {Array.from({ length: 3 }).map((_, index) => (
            <article key={index} className="bg-card ring-foreground/10 p-4 ring-1">
              <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-6 w-64 max-w-full" />
                    <Skeleton className="h-4 w-80 max-w-full" />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {Array.from({ length: 4 }).map((__, progressIndex) => (
                      <div key={progressIndex} className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <Skeleton className="h-4 w-20" />
                          <Skeleton className="h-4 w-10" />
                        </div>
                        <Skeleton className="h-2 w-full" />
                        <Skeleton className="h-3 w-28" />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3">
                  {Array.from({ length: 5 }).map((__, rowIndex) => (
                    <div key={rowIndex} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-b-0">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  ))}
                  <Skeleton className="h-10 w-full" />
                </div>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}

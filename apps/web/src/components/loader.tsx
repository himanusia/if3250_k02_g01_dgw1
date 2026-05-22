import { Skeleton } from "@/components/ui/skeleton";

export default function Loader() {
  return (
    <main className="digiTheme min-h-screen bg-[#FFF8F1] px-4 py-6 text-[#2b1418] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="border border-[#b43c39]/20 bg-white p-5 shadow-[0_16px_50px_rgba(152,46,65,0.08)]">
          <Skeleton className="mb-4 h-5 w-36 bg-[#b43c39]/15" />
          <Skeleton className="mb-3 h-9 w-full max-w-xl bg-[#b43c39]/10" />
          <Skeleton className="h-4 w-2/3 bg-[#b43c39]/10" />
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="border border-[#b43c39]/15 bg-white p-4 shadow-[0_10px_30px_rgba(152,46,65,0.06)]">
              <Skeleton className="mb-3 h-4 w-24 bg-[#b43c39]/15" />
              <Skeleton className="mb-4 h-8 w-32 bg-[#b43c39]/10" />
              <Skeleton className="h-3 w-full bg-[#b43c39]/10" />
            </div>
          ))}
        </section>

        <section className="border border-[#b43c39]/15 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-24 bg-[#b43c39]/10" />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

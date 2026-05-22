import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import type { CampaignRecord } from "@/lib/app-types";
import type { BrandSummary } from "@/lib/brand-summary";
import { getBrandSummaries } from "@/lib/brand-summary";

import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/brand")({
  component: RouteComponent,
});

function RouteComponent() {
  useEffect(() => {
    document.documentElement.classList.add("digiTheme");
    document.body.classList.add("digiTheme");

    return () => {
      document.documentElement.classList.remove("digiTheme");
      document.body.classList.remove("digiTheme");
    };
  }, []);

  const campaignsQuery = useQuery(orpc.campaign.list.queryOptions());
  const campaigns = (campaignsQuery.data as CampaignRecord[] | undefined) ?? [];
  const brandSummaries = useMemo(() => getBrandSummaries(campaigns), [campaigns]);

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-background via-[#fff6f8] to-background">
      <div className="container mx-auto grid max-w-4xl gap-5 px-4 py-6 lg:py-8">
        <section className="grid gap-2">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#B43C39]">Brand</p>
          <h1 className="font-goldman text-3xl font-bold uppercase tracking-wide text-[#2b1418] md:text-4xl">
            Daftar Brand
          </h1>
        </section>

        <section className="rounded-none border border-[#b43c39]/15 bg-white shadow-[8px_8px_0_rgba(152,46,65,0.12)]">
          {campaignsQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Memuat brand...</div>
          ) : brandSummaries.length ? (
            <div className="divide-y divide-[#b43c39]/10">
              {brandSummaries.map((brand) => (
                <BrandRow key={brand.name} brand={brand} />
              ))}
            </div>
          ) : (
            <div className="p-6">
              <h2 className="text-xl font-semibold text-[#2b1418]">Belum ada brand.</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Buat campaign pertama dan isi nama brand untuk menampilkannya di halaman ini.
              </p>
              <Link
                to="/campaigns"
                className="mt-5 inline-flex items-center justify-center rounded-none bg-[#B43C39] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#8f2e2c]"
              >
                Buat campaign
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function BrandRow({ brand }: { brand: BrandSummary }) {
  return (
    <Link
      to="/campaigns"
      className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-[#fff6f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B43C39]"
      aria-label={`Buka campaign untuk ${brand.name}`}
    >
      <span className="text-lg font-semibold text-[#2b1418]">{brand.name}</span>
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#B43C39]">Lihat</span>
    </Link>
  );
}

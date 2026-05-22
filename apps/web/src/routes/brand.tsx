import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import type { CampaignRecord } from "@/lib/app-types";
import type { BrandSummary } from "@/lib/brand-summary";
import { countUniquePlatforms, getBrandSummaries } from "@/lib/brand-summary";

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
  const totalCampaigns = brandSummaries.reduce((sum, brand) => sum + brand.campaigns.length, 0);
  const totalKols = brandSummaries.reduce((sum, brand) => sum + brand.totalKols, 0);
  const activeBrands = brandSummaries.filter((brand) => brand.activeCampaigns > 0).length;

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-background via-[#fff6f8] to-background">
      <div className="container mx-auto grid gap-6 px-4 py-6 lg:py-8">
        <section className="overflow-hidden rounded-none border border-[#b43c39]/15 bg-white shadow-[8px_8px_0_rgba(152,46,65,0.12)]">
          <div className="grid gap-6 p-6 lg:grid-cols-[1.1fr_0.9fr] lg:p-8">
            <div className="space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#B43C39]">
                Brand workspace
              </p>
              <div className="max-w-3xl space-y-3">
                <h1 className="font-goldman text-4xl font-bold uppercase tracking-wide text-[#2b1418] md:text-5xl">
                  Digi Wonder Brand
                </h1>
                <p className="text-base leading-7 text-muted-foreground md:text-lg">
                  Satu halaman untuk melihat brand, campaign yang berjalan, distribusi KOL, dan platform
                  yang sedang dipakai tanpa harus buka campaign satu per satu.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <StatCard label="Total brand" value={brandSummaries.length.toString()} />
              <StatCard label="Brand aktif" value={activeBrands.toString()} />
              <StatCard label="KOL assigned" value={totalKols.toString()} />
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Campaign tercatat" value={totalCampaigns.toString()} description="Dikelompokkan dari field brand campaign." />
          <MetricCard label="Rata-rata KOL/brand" value={brandSummaries.length ? Math.round(totalKols / brandSummaries.length).toString() : "0"} description="Estimasi kapasitas kolaborasi per brand." />
          <MetricCard label="Platform unik" value={countUniquePlatforms(brandSummaries).toString()} description="Channel yang muncul di campaign brand." />
        </section>

        <section className="grid gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-[#2b1418]">Daftar brand</h2>
              <p className="text-muted-foreground">Brand otomatis dirangkum dari campaign yang sudah dibuat.</p>
            </div>
            <Link
              to="/campaigns"
              className="inline-flex w-fit items-center justify-center rounded-none bg-[#7B204C] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#5f183a]"
            >
              Kelola campaign
            </Link>
          </div>

          {campaignsQuery.isLoading ? (
            <div className="rounded-none border border-dashed border-[#b43c39]/30 bg-white/70 p-8 text-center text-muted-foreground">
              Memuat brand...
            </div>
          ) : brandSummaries.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {brandSummaries.map((brand) => (
                <BrandCard key={brand.name} brand={brand} />
              ))}
            </div>
          ) : (
            <div className="rounded-none border border-dashed border-[#b43c39]/30 bg-white/80 p-8 text-center">
              <h3 className="text-xl font-semibold text-[#2b1418]">Belum ada brand.</h3>
              <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
                Buat campaign pertama dan isi nama brand, nanti halaman ini otomatis menampilkan ringkasan brand.
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-none bg-[#fff3d8] p-4 shadow-inner ring-1 ring-[#b43c39]/10">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7B204C]">{label}</p>
      <p className="mt-2 text-3xl font-bold text-[#2b1418]">{value}</p>
    </div>
  );
}

function MetricCard({ description, label, value }: { description: string; label: string; value: string }) {
  return (
    <div className="rounded-none border border-[#b43c39]/15 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#B43C39]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-[#2b1418]">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function BrandCard({ brand }: { brand: BrandSummary }) {
  const latestCampaigns = brand.campaigns.slice(0, 3);

  return (
    <article className="rounded-none border border-[#b43c39]/15 bg-white p-5 shadow-sm transition hover:shadow-[6px_6px_0_rgba(152,46,65,0.12)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#B43C39]">Brand</p>
          <h3 className="mt-1 text-2xl font-semibold text-[#2b1418]">{brand.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Update terakhir {formatDate(brand.latestUpdatedAt)}
          </p>
        </div>
        <div className="rounded-none bg-[#7B204C]/10 px-4 py-3 text-right">
          <p className="text-2xl font-bold text-[#7B204C]">{brand.campaigns.length}</p>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#7B204C]">Campaign</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <MiniStat label="Aktif" value={brand.activeCampaigns.toString()} />
        <MiniStat label="KOL" value={brand.totalKols.toString()} />
        <MiniStat label="Platform" value={brand.platforms.length.toString()} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {brand.platforms.length ? (
          brand.platforms.map((platform) => (
            <span key={platform} className="rounded-none bg-[#fff3d8] px-3 py-1 text-xs font-semibold text-[#7B204C]">
              {platform}
            </span>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">Belum ada content platform.</span>
        )}
      </div>

      <div className="mt-5 space-y-2">
        {latestCampaigns.map((campaign) => (
          <Link
            key={campaign.id}
            to="/campaigns"
            className="block rounded-none border border-border/70 px-4 py-3 transition hover:border-[#B43C39]/40 hover:bg-[#fff6f8]"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-[#2b1418]">{campaign.name}</p>
              <span className="rounded-none bg-muted px-2.5 py-1 text-xs capitalize text-muted-foreground">
                {campaign.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {(campaign.kols ?? []).length} KOL
            </p>
          </Link>
        ))}
      </div>
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-none bg-muted/70 p-3">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold text-[#2b1418]">{value}</p>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import type { CampaignRecord } from "@/lib/app-types";
import type { BrandSummary } from "@/lib/brand-summary";
import { getBrandSummaries } from "@/lib/brand-summary";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/utils/orpc";

const BRAND_PAGE_SIZE = 10;

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

  const [query, setQuery] = useState("");
  const [brandPage, setBrandPage] = useState(1);
  const [selectedBrandName, setSelectedBrandName] = useState<string | null>(null);
  const campaignsQuery = useQuery(orpc.campaign.list.queryOptions());
  const campaigns = (campaignsQuery.data as CampaignRecord[] | undefined) ?? [];
  const brandSummaries = useMemo(() => getBrandSummaries(campaigns), [campaigns]);
  const filteredBrands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return brandSummaries;
    }

    return brandSummaries.filter((brand) => brand.name.toLowerCase().includes(normalizedQuery));
  }, [brandSummaries, query]);
  const selectedBrand = useMemo(() => {
    if (!selectedBrandName) {
      return filteredBrands[0] ?? brandSummaries[0];
    }

    return brandSummaries.find((brand) => brand.name === selectedBrandName) ?? filteredBrands[0] ?? null;
  }, [brandSummaries, filteredBrands, selectedBrandName]);
  const totalBrandPages = Math.max(1, Math.ceil(filteredBrands.length / BRAND_PAGE_SIZE));
  const paginatedBrands = useMemo(
    () => filteredBrands.slice((brandPage - 1) * BRAND_PAGE_SIZE, brandPage * BRAND_PAGE_SIZE),
    [brandPage, filteredBrands],
  );

  useEffect(() => {
    if (selectedBrandName && !brandSummaries.some((brand) => brand.name === selectedBrandName)) {
      setSelectedBrandName(null);
    }
  }, [brandSummaries, selectedBrandName]);

  useEffect(() => {
    setBrandPage(1);
  }, [query]);

  useEffect(() => {
    if (brandPage > totalBrandPages) {
      setBrandPage(totalBrandPages);
    }
  }, [brandPage, totalBrandPages]);

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-background via-[#fff6f8] to-background">
      <div className="container mx-auto grid max-w-6xl gap-5 px-4 py-6 lg:py-8">
        <section className="grid gap-2">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#B43C39]">Brand</p>
          <h1 className="font-goldman text-3xl font-bold uppercase tracking-wide text-[#2b1418] md:text-4xl">
            Daftar Brand
          </h1>
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
          <div className="rounded-none border border-[#b43c39]/15 bg-white shadow-[8px_8px_0_rgba(152,46,65,0.12)]">
            <div className="border-b border-[#b43c39]/10 p-4">
              <Label className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7B204C]" htmlFor="brand-search">
                Cari brand
              </Label>
              <Input
                id="brand-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ketik nama brand..."
                className="mt-2 h-11 border-[#b43c39]/20 bg-white focus-visible:border-[#B43C39] focus-visible:ring-[#B43C39]/15"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {campaignsQuery.isLoading ? <Skeleton className="h-3 w-32" /> : `${filteredBrands.length} dari ${brandSummaries.length} brand`}
              </p>
            </div>

            {campaignsQuery.isLoading ? (
              <BrandListSkeleton />
            ) : filteredBrands.length ? (
              <div className="divide-y divide-[#b43c39]/10">
                {paginatedBrands.map((brand) => (
                  <BrandRow
                    key={brand.name}
                    brand={brand}
                    isSelected={brand.name === selectedBrand?.name}
                    onSelect={() => setSelectedBrandName(brand.name)}
                  />
                ))}
                <PaginationControls
                  page={brandPage}
                  pageSize={BRAND_PAGE_SIZE}
                  totalItems={filteredBrands.length}
                  totalPages={totalBrandPages}
                  onPageChange={setBrandPage}
                />
              </div>
            ) : brandSummaries.length ? (
              <div className="p-6">
                <h2 className="text-xl font-semibold text-[#2b1418]">Brand tidak ditemukan.</h2>
                <p className="mt-2 text-sm text-muted-foreground">Coba kata kunci lain.</p>
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
          </div>

          {campaignsQuery.isLoading ? <BrandDetailSkeleton /> : <BrandDetail brand={selectedBrand} />}
        </section>
      </div>
    </div>
  );
}

function BrandListSkeleton() {
  return (
    <div className="divide-y divide-[#b43c39]/10">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex items-center justify-between gap-4 px-5 py-4">
          <span className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-28" />
          </span>
          <Skeleton className="h-3 w-14" />
        </div>
      ))}
    </div>
  );
}

function BrandRow({ brand, isSelected, onSelect }: { brand: BrandSummary; isSelected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      className={`flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B43C39] ${
        isSelected ? "bg-[#fff3d8]" : "hover:bg-[#fff6f8]"
      }`}
      aria-pressed={isSelected}
      onClick={onSelect}
    >
      <span>
        <span className="block text-lg font-semibold text-[#2b1418]">{brand.name}</span>
        <span className="mt-1 block text-xs font-medium text-muted-foreground">
          {brand.campaigns.length} campaign · {brand.activeCampaigns} aktif
        </span>
      </span>
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#B43C39]">Detail</span>
    </button>
  );
}

function BrandDetailSkeleton() {
  return (
    <aside className="rounded-none border border-[#b43c39]/15 bg-white p-5 shadow-[8px_8px_0_rgba(152,46,65,0.10)] lg:sticky lg:top-6 lg:self-start">
      <div className="border-b border-[#b43c39]/10 pb-4">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-2 h-7 w-48" />
        <Skeleton className="mt-2 h-4 w-36" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-none bg-[#fff6f8] p-3 ring-1 ring-[#b43c39]/10">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-6 w-10" />
          </div>
        ))}
      </div>
      <div className="mt-5 space-y-2">
        <Skeleton className="h-3 w-20" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-16" />
        </div>
      </div>
      <div className="mt-5 space-y-2">
        <Skeleton className="h-3 w-32" />
        <div className="border border-border/70">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="border-b border-border px-3 py-3 last:border-b-0">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-6 w-16" />
              </div>
              <Skeleton className="mt-2 h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function BrandDetail({ brand }: { brand: BrandSummary | null }) {
  if (!brand) {
    return (
      <aside className="rounded-none border border-dashed border-[#b43c39]/25 bg-white/70 p-6 text-sm text-muted-foreground">
        Pilih brand untuk melihat detail.
      </aside>
    );
  }

  const latestCampaigns = brand.campaigns.slice(0, 5);

  return (
    <aside className="rounded-none border border-[#b43c39]/15 bg-white p-5 shadow-[8px_8px_0_rgba(152,46,65,0.10)] lg:sticky lg:top-6 lg:self-start">
      <div className="border-b border-[#b43c39]/10 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#B43C39]">Detail brand</p>
        <h2 className="mt-1 text-2xl font-semibold text-[#2b1418]">{brand.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Update terakhir {formatDate(brand.latestUpdatedAt)}</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <DetailStat label="Campaign" value={brand.campaigns.length.toString()} />
        <DetailStat label="Aktif" value={brand.activeCampaigns.toString()} />
      </div>

      <div className="mt-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7B204C]">Campaign brand</p>
        <div className="mt-2 divide-y divide-border border border-border/70">
          {latestCampaigns.map((campaign) => (
            <div key={campaign.id} className="px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-[#2b1418]">{campaign.name}</p>
                <span className="bg-muted px-2 py-1 text-xs text-muted-foreground">{formatCampaignStatus(campaign.status)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Update {formatDate(campaign.updatedAt)}</p>
            </div>
          ))}
        </div>
        {brand.campaigns.length > latestCampaigns.length ? (
          <p className="mt-2 text-xs text-muted-foreground">+{brand.campaigns.length - latestCampaigns.length} campaign lain</p>
        ) : null}
      </div>
    </aside>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-none bg-[#fff6f8] p-3 ring-1 ring-[#b43c39]/10">
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold text-[#2b1418]">{value}</p>
    </div>
  );
}

function PaginationControls({
  onPageChange,
  page,
  pageSize,
  totalItems,
  totalPages,
}: {
  onPageChange: (page: number) => void;
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}) {
  const start = totalItems ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-col gap-3 px-5 py-4 text-sm text-[#2b1418] sm:flex-row sm:items-center sm:justify-between">
      <span className="text-xs text-muted-foreground">
        {start}-{end} dari {totalItems}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="border border-[#982E41]/25 px-3 py-1 text-xs font-semibold text-[#982E41] disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          Sebelumnya
        </button>
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#982E41]">
          {page}/{totalPages}
        </span>
        <button
          type="button"
          className="border border-[#982E41]/25 px-3 py-1 text-xs font-semibold text-[#982E41] disabled:opacity-40"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        >
          Berikutnya
        </button>
      </div>
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

function formatCampaignStatus(status: CampaignRecord["status"]) {
  if (status === "active") return "Berjalan";
  if (status === "completed" || status === "archived") return "Selesai";
  return "Belum mulai";
}

import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type { CampaignRecord, KolRecord, SocialPlatform } from "@/lib/app-types";
import { formatCurrencyIdr } from "@/lib/kol-utils";
import { arrayFromQueryData } from "@/lib/query-data";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/compare-kols")({
  component: RouteComponent,
});

const KOL_PAGE_SIZE = 6;

type GroupedPlatformAccount = KolRecord["accounts"][number] & {
  actualPostRate: number | null;
  displayName: string;
  estimatedPostRate: number | null;
};

function parseKeywordSegments(keywords: string | null | undefined): string[] {
  const raw = keywords?.trim();
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((keyword) => keyword.trim().replace(/^#+/, ""))
    .filter(Boolean);
}

function RouteComponent() {
  const [search, setSearch] = useState("");
  const [keywordFilter, setKeywordFilter] = useState("all");
  const [kolPage, setKolPage] = useState(1);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [selectedKolIds, setSelectedKolIds] = useState<number[]>([]);

  useEffect(() => {
    document.documentElement.classList.add("digiTheme");
    document.body.classList.add("digiTheme");

    return () => {
      document.documentElement.classList.remove("digiTheme");
      document.body.classList.remove("digiTheme");
    };
  }, []);

  const kolQuery = useQuery(orpc.kol.list.queryOptions());
  const campaignQuery = useQuery(orpc.campaign.list.queryOptions());
  const kols = arrayFromQueryData<KolRecord>(kolQuery.data);
  const campaigns = arrayFromQueryData<CampaignRecord>(campaignQuery.data);
  const keywordOptions = useMemo(() => {
    return Array.from(new Set(kols.flatMap((kol) => parseKeywordSegments(kol.keywords))))
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
  }, [kols]);
  const addKol = useMutation({
    mutationFn: (input: { campaignId: number; kolId: number }) => client.campaign.addKolToCampaign(input),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal menambahkan KOL ke campaign");
    },
  });

  const filteredKols = useMemo(() => {
    return (
      kols.filter((kol) => {
        const matchesSearch =
          !search ||
          `${kol.displayName} ${kol.accounts.map((account) => account.handle).join(" ")}`
            .toLowerCase()
            .includes(search.toLowerCase());
        const matchesKeyword =
          keywordFilter === "all" || parseKeywordSegments(kol.keywords).some(
            (keyword) => keyword.toLowerCase() === keywordFilter.toLowerCase(),
          );

        return matchesSearch && matchesKeyword;
      })
    );
  }, [keywordFilter, kols, search]);

  const selectedKols = kols.filter((kol) => selectedKolIds.includes(kol.id));
  const totalKolPages = Math.max(1, Math.ceil(filteredKols.length / KOL_PAGE_SIZE));
  const paginatedKols = filteredKols.slice((kolPage - 1) * KOL_PAGE_SIZE, kolPage * KOL_PAGE_SIZE);

  useEffect(() => {
    setKolPage(1);
  }, [keywordFilter, search]);

  useEffect(() => {
    if (kolPage > totalKolPages) {
      setKolPage(totalKolPages);
    }
  }, [kolPage, totalKolPages]);

  const groupedByPlatform = useMemo<Record<SocialPlatform, GroupedPlatformAccount[]>>(() => {
    const map: Record<SocialPlatform, GroupedPlatformAccount[]> = {
      instagram: [],
      tiktok: [],
    };

    selectedKols.forEach((kol) => {
      kol.accounts.forEach((account) => {
        const platform = account.platform;

        map[platform].push({
          ...account,
          actualPostRate: kol.actualRateCard?.post.suggested ?? null,
          displayName: kol.displayName,
          estimatedPostRate: kol.estimatedRateCard?.post.suggested ?? null,
        });
      });
    });

    return map;
  }, [selectedKols]);
  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="container mx-auto grid w-full max-w-[1500px] gap-5 overflow-x-hidden px-4 py-6 lg:grid-cols-[380px_minmax(0,1fr)] lg:py-8">
      <section className="min-w-0 max-w-full overflow-hidden space-y-4 rounded-none border border-[#b43c39]/15 bg-white p-5 shadow-[8px_8px_0_rgba(152,46,65,0.10)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#7B204C]">Compare KOL</p>
          <h1 className="font-goldman text-3xl font-bold uppercase tracking-wide text-[#2b1418] md:text-4xl">Bandingkan kandidat KOL</h1>
        </div>

        <div className="grid gap-3">
          <FilterInput label="Cari nama / handle" value={search} onChange={setSearch} />
          <Label className="grid gap-2">
            <span>Keyword</span>
            <SearchableSelect
              className="w-full"
              value={keywordFilter}
              onValueChange={setKeywordFilter}
              options={[{ label: "Semua keyword", value: "all" }, ...keywordOptions.map((keyword) => ({ label: keyword, value: keyword }))]}
              placeholder="Pilih keyword"
              searchPlaceholder="Cari keyword"
            />
          </Label>
        </div>

        <div className="flex items-center justify-between gap-3 border border-[#b43c39]/15 bg-[#fff6f8] px-3 py-2 text-sm text-[#2b1418]">
          <span>{filteredKols.length.toLocaleString("id-ID")} kandidat</span>
          <span>{selectedKolIds.length.toLocaleString("id-ID")} dipilih</span>
        </div>

        <div className="grid max-h-[31rem] gap-3 overflow-auto border border-[#b43c39]/15 bg-[#fff6f8] p-3">
          {kolQuery.isLoading ? (
            <CompareKolPickerSkeleton />
          ) : paginatedKols.map((kol) => {
            const selected = selectedKolIds.includes(kol.id);

            return (
              <Button
                key={kol.id}
                type="button"
                variant={selected ? "default" : "outline"}
                className={`h-full min-h-[8.5rem] w-full items-start justify-start border p-3 text-left transition-colors ${selected ? "border-[#B43C39] bg-[#fff3d8] text-[#2b1418] hover:bg-[#ffeabd]" : "border-[#b43c39]/15 bg-white text-[#2b1418] hover:bg-[#fff6f8]"}`}
                onClick={() => {
                  setSelectedKolIds((current) =>
                    current.includes(kol.id)
                      ? current.filter((id) => id !== kol.id)
                      : [...current, kol.id],
                  );
                }}
              >
                <span className="block w-full">
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block font-medium text-[#2b1418]">{kol.displayName}</span>
                      <span className="block break-words text-sm text-muted-foreground">
                        {kol.accounts.map((account) => `@${account.handle}`).join(" • ")}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">{kol.accounts.length} akun</span>
                  </span>
                  <span className="mt-2 grid gap-1 text-sm text-muted-foreground md:grid-cols-2">
                    <span>Keywords: {kol.keywords || "-"}</span>
                    <span>Followers: {kol.totalFollowers.toLocaleString()}</span>
                  </span>
                </span>
              </Button>
            );
          })}

          {!kolQuery.isLoading && !filteredKols.length && (
            <p className="text-sm text-muted-foreground">Tidak ada akun yang cocok dengan filter.</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-none border-[#b43c39]/20"
            disabled={kolPage <= 1}
            onClick={() => setKolPage((page) => Math.max(1, page - 1))}
          >
            Sebelumnya
          </Button>
          <span className="text-sm text-muted-foreground">
            {kolPage} / {totalKolPages}
          </span>
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-none border-[#b43c39]/20"
            disabled={kolPage >= totalKolPages}
            onClick={() => setKolPage((page) => Math.min(totalKolPages, page + 1))}
          >
            Berikutnya
          </Button>
        </div>
      </section>

      <section className="min-w-0 max-w-full overflow-hidden space-y-4 rounded-none border border-[#b43c39]/15 bg-white p-5 shadow-[8px_8px_0_rgba(152,46,65,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="font-goldman text-2xl font-bold uppercase tracking-wide text-[#2b1418]">Hasil perbandingan</h2>
          </div>

          <div className="grid gap-2">
            <span className="text-sm text-[#2b1418]">Tambahkan akun terpilih ke campaign</span>
            <div className="flex min-w-0 flex-wrap gap-2">
              <SearchableSelect
                className="h-8 min-w-64 flex-1 border-[#b43c39]/20 bg-white text-[#2b1418] focus-visible:border-[#B43C39] focus-visible:ring-[#B43C39]/15"
                value={selectedCampaignId}
                onValueChange={setSelectedCampaignId}
                options={[
                  { label: "Pilih campaign", value: "" },
                  ...campaigns.map((campaign) => ({
                    label: campaign.name,
                    value: String(campaign.id),
                    keywords: [campaign.brand, campaign.keywords, campaign.objective],
                  })),
                ]}
                placeholder="Pilih campaign"
                searchPlaceholder="Cari campaign"
              />
              <Button
                className="h-8 rounded-none border border-[#B43C39] bg-[#B43C39] px-4 text-[13px] font-medium text-white hover:bg-[#8f2e2c]"
                disabled={!selectedCampaignId || !selectedKolIds.length || addKol.isPending}
                onClick={async () => {
                  try {
                    await Promise.all(
                      selectedKolIds.map((kolId) =>
                        addKol.mutateAsync({
                          campaignId: Number(selectedCampaignId),
                          kolId,
                        }),
                      ),
                    );
                    toast.success("KOL terpilih berhasil ditambahkan ke campaign");
                    campaignQuery.refetch();
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Gagal menambahkan KOL ke campaign");
                  }
                }}
              >
                Tambahkan
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <h2 className="mb-2 text-lg font-semibold capitalize text-[#2b1418]">
            Overall
          </h2>
          {kolQuery.isLoading ? <CompareTableSkeleton /> : <div className="border border-[#b43c39]/15"><Table className="min-w-[1180px] text-sm">
            <TableHeader className="bg-[#fff3d8] text-[#2b1418]">
              <TableRow>
                <TableHead className="w-[220px]">
                  Name
                </TableHead>
                <TableHead className="w-[220px]">
                  Handles
                </TableHead>
                <TableHead>
                  Tier
                </TableHead>
                <TableHead className="w-[180px]">
                  Keywords
                </TableHead>
                <TableHead className="text-right">
                  Followers
                </TableHead>
                <TableHead className="text-right">
                  Avg Likes
                </TableHead>
                <TableHead className="text-right">
                  Avg Views
                </TableHead>
                <TableHead className="text-right">
                  ER
                </TableHead>
                <TableHead className="text-right">
                  Est. Post
                </TableHead>
                <TableHead className="text-right">
                  Est. Reels
                </TableHead>
                <TableHead className="text-right">
                  Est. Story
                </TableHead>
                <TableHead className="text-right">
                  Actual Post
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody className="text-[#2b1418]">
              {selectedKols.map((kol) => (
                <TableRow key={kol.id} className="hover:bg-[#fff6f8]">
                  <TableCell className="font-medium">
                    {kol.displayName}
                  </TableCell>

                  <TableCell className="whitespace-normal text-muted-foreground">
                    {kol.accounts.map((account) => `@${account.handle}`).join(" • ") || "-"}
                  </TableCell>

                  <TableCell className="capitalize">
                    {kol.followerTier}
                  </TableCell>

                  <TableCell className="whitespace-normal text-muted-foreground">
                    {kol.keywords || "-"}
                  </TableCell>

                  <TableCell className="text-right">
                    {kol.totalFollowers.toLocaleString()}
                  </TableCell>

                  <TableCell className="text-right">
                    {kol.averageLikes.toLocaleString()}
                  </TableCell>

                  <TableCell className="text-right">
                    {kol.averageViews.toLocaleString()}
                  </TableCell>

                  <TableCell className="text-right">
                    {kol.engagementRate || "-"}
                  </TableCell>

                  <TableCell className="text-right">
                    {formatCurrencyIdr(kol.estimatedRateCard?.post.suggested)}
                  </TableCell>

                  <TableCell className="text-right">
                    {formatCurrencyIdr(kol.estimatedRateCard?.reel.suggested)}
                  </TableCell>

                  <TableCell className="text-right">
                    {formatCurrencyIdr(kol.estimatedRateCard?.story.suggested)}
                  </TableCell>

                  <TableCell className="text-right">
                    {formatCurrencyIdr(kol.actualRateCard?.post.suggested)}
                  </TableCell>
                </TableRow>
              ))}
              {!selectedKols.length && (
                <TableRow>
                  <TableCell colSpan={11} className="h-20 text-center text-muted-foreground">
                    Pilih KOL untuk melihat perbandingan.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table></div>}
        </div>

        {(Object.entries(groupedByPlatform) as Array<[SocialPlatform, GroupedPlatformAccount[]]>).map(([platform, accounts]) => (
        <div key={platform} className="mb-6">
          <h2 className="mb-2 text-lg font-semibold capitalize text-[#2b1418]">
            {platform}
          </h2>

          <div className="overflow-x-auto border border-[#b43c39]/15">
            <Table className="min-w-[1060px] text-sm">
              <TableHeader className="bg-[#fff3d8] text-[#2b1418]">
                <TableRow>
                  <TableHead className="w-[200px]">
                    Name
                  </TableHead>
                  <TableHead className="w-[180px]">
                    Handle
                  </TableHead>
                  <TableHead className="text-right">
                    Followers
                  </TableHead>
                  <TableHead className="text-right">
                    Avg Likes
                  </TableHead>
                  <TableHead className="text-right">
                    Avg Views
                  </TableHead>
                  <TableHead className="text-right">
                    ER
                  </TableHead>
                  <TableHead className="text-right">
                    Est. Post
                  </TableHead>
                  <TableHead className="text-right">
                    Actual Post
                  </TableHead>
                  <TableHead>
                    Sync
                  </TableHead>
                  <TableHead>
                    Last Sync
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody className="text-[#2b1418]">
                {accounts.map((acc) => (
                  <TableRow key={acc.id} className="hover:bg-[#fff6f8]">
                    <TableCell className="font-medium">
                      {acc.displayName}
                    </TableCell>

                    <TableCell>
                      @{acc.handle}
                    </TableCell>

                    <TableCell className="text-right">
                      {acc.followers.toLocaleString()}
                    </TableCell>

                    <TableCell className="text-right">
                      {acc.averageLikes.toLocaleString()}
                    </TableCell>

                    <TableCell className="text-right">
                      {acc.averageViews.toLocaleString()}
                    </TableCell>

                    <TableCell className="text-right">
                      {acc.engagementRate || "-"}
                    </TableCell>

                    <TableCell className="text-right">
                      {formatCurrencyIdr(acc.estimatedPostRate)}
                    </TableCell>

                    <TableCell className="text-right">
                      {formatCurrencyIdr(acc.actualPostRate)}
                    </TableCell>

                    <TableCell className="capitalize">
                      {acc.syncStatus}
                    </TableCell>

                    <TableCell>
                      {acc.lastSyncedAt ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(acc.lastSyncedAt)) : "-"}
                    </TableCell>
                  </TableRow>
                ))}
                {!accounts.length && (
                  <TableRow>
                    <TableCell colSpan={10} className="h-16 text-center text-muted-foreground">
                      Belum ada akun {platform} yang dipilih.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
      </section>
      </div>
    </div>
  );
}

function FilterInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <Label className="grid gap-2">
      <span>{label}</span>
      <Input
        className="border-[#b43c39]/20 bg-white text-[#2b1418] placeholder:text-[#A16A75] focus-visible:border-[#B43C39] focus-visible:ring-[#B43C39]/15"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Label>
  );
}


function CompareKolPickerSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="border border-[#b43c39]/15 bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
            <Skeleton className="h-4 w-14" />
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      ))}
    </>
  );
}

function CompareTableSkeleton() {
  return (
    <div className="border border-[#b43c39]/15 bg-white p-3">
      <div className="grid gap-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="grid grid-cols-5 gap-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type { CampaignRecord, KolRecord, SocialPlatform } from "@/lib/app-types";
import { formatCurrencyIdr } from "@/lib/kol-utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/compare-kols")({
  component: RouteComponent,
});

type GroupedPlatformAccount = KolRecord["accounts"][number] & {
  actualPostRate: number | null;
  displayName: string;
  estimatedPostRate: number | null;
};

function RouteComponent() {
  const [search, setSearch] = useState("");
  const [keywordFilter, setKeywordFilter] = useState("");
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
  const kols = (kolQuery.data as KolRecord[] | undefined) ?? [];
  const campaigns = (campaignQuery.data as CampaignRecord[] | undefined) ?? [];
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
          !keywordFilter || kol.keywords.toLowerCase().includes(keywordFilter.toLowerCase());

        return matchesSearch && matchesKeyword;
      })
    );
  }, [keywordFilter, kols, search]);

  const selectedKols = filteredKols.filter((kol) => selectedKolIds.includes(kol.id));

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
      <div className="container mx-auto grid w-full max-w-6xl gap-5 overflow-x-hidden px-4 py-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:py-8">
      <section className="min-w-0 max-w-full overflow-hidden space-y-4 rounded-none border border-[#b43c39]/15 bg-white p-5 shadow-[8px_8px_0_rgba(152,46,65,0.10)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#7B204C]">Compare KOL</p>
          <h1 className="font-goldman text-3xl font-bold uppercase tracking-wide text-[#2b1418] md:text-4xl">Bandingkan kandidat KOL</h1>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <FilterInput label="Cari nama / handle" value={search} onChange={setSearch} />
          <FilterInput label="Keyword" value={keywordFilter} onChange={setKeywordFilter} />
        </div>

        <div className="max-h-128 space-y-2 overflow-auto border border-[#b43c39]/15 bg-[#fff6f8] p-3">
          {kolQuery.isLoading ? (
            <CompareKolPickerSkeleton />
          ) : filteredKols.map((kol) => {
            const selected = selectedKolIds.includes(kol.id);

            return (
              <Button
                key={kol.id}
                type="button"
                variant={selected ? "default" : "outline"}
                className={`h-auto w-full justify-start border p-3 text-left transition-colors ${selected ? "border-[#B43C39] bg-[#fff3d8] text-[#2b1418] hover:bg-[#ffeabd]" : "border-[#b43c39]/15 bg-white text-[#2b1418] hover:bg-[#fff6f8]"}`}
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
                    <span>
                      <span className="block font-medium text-[#2b1418]">{kol.displayName}</span>
                      <span className="block text-sm text-muted-foreground">
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
      </section>

      <section className="min-w-0 max-w-full overflow-hidden space-y-4 rounded-none border border-[#b43c39]/15 bg-white p-5 shadow-[8px_8px_0_rgba(152,46,65,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="font-goldman text-2xl font-bold uppercase tracking-wide text-[#2b1418]">Hasil perbandingan</h2>
          </div>

          <div className="grid gap-2">
            <span className="text-sm text-[#2b1418]">Tambahkan akun terpilih ke campaign</span>
            <div className="flex min-w-0 flex-wrap gap-2">
              <Select
                className="min-w-0 flex-1 border-[#b43c39]/20 bg-white text-[#2b1418] focus-visible:border-[#B43C39] focus-visible:ring-[#B43C39]/15"
                value={selectedCampaignId}
                onChange={(event) => setSelectedCampaignId(event.target.value)}
              >
                <option value="">Pilih campaign</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </Select>
              <Button
                className="rounded-none border border-[#B43C39] bg-[#B43C39] px-4 text-[13px] font-medium text-white hover:bg-[#8f2e2c]"
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
          {kolQuery.isLoading ? <CompareTableSkeleton /> : <Table className="min-w-[760px] table-fixed border border-[#b43c39]/15 text-sm">
            <TableHeader className="bg-[#fff3d8] text-[#2b1418]">
              <TableRow>
                <TableHead>
                  Name
                </TableHead>
                <TableHead>
                  Followers
                </TableHead>
                <TableHead>
                  Avg Likes
                </TableHead>
                <TableHead>
                  Avg Views
                </TableHead>
                <TableHead>
                  ER
                </TableHead>
                <TableHead>
                  Est. Post
                </TableHead>
                <TableHead>
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

                  <TableCell>
                    {kol.totalFollowers.toLocaleString()}
                  </TableCell>

                  <TableCell>
                    {kol.averageLikes.toLocaleString()}
                  </TableCell>

                  <TableCell>
                    {kol.averageViews.toLocaleString()}
                  </TableCell>

                  <TableCell>
                    {kol.engagementRate || "-"}
                  </TableCell>

                  <TableCell>
                    {formatCurrencyIdr(kol.estimatedRateCard?.post.suggested)}
                  </TableCell>

                  <TableCell>
                    {formatCurrencyIdr(kol.actualRateCard?.post.suggested)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>}
        </div>

        {(Object.entries(groupedByPlatform) as Array<[SocialPlatform, GroupedPlatformAccount[]]>).map(([platform, accounts]) => (
        <div key={platform} className="mb-6">
          <h2 className="mb-2 text-lg font-semibold capitalize text-[#2b1418]">
            {platform}
          </h2>

          <div className="overflow-x-auto">
            <Table className="min-w-[860px] table-fixed border border-[#b43c39]/15 text-sm">
              <TableHeader className="bg-[#fff3d8] text-[#2b1418]">
                <TableRow>
                  <TableHead>
                    Name
                  </TableHead>
                  <TableHead>
                    Handle
                  </TableHead>
                  <TableHead>
                    Followers
                  </TableHead>
                  <TableHead>
                    Avg Likes
                  </TableHead>
                  <TableHead>
                    Avg Views
                  </TableHead>
                  <TableHead>
                    ER
                  </TableHead>
                  <TableHead>
                    Est. Post
                  </TableHead>
                  <TableHead>
                    Actual Post
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

                    <TableCell>
                      {acc.followers.toLocaleString()}
                    </TableCell>

                    <TableCell>
                      {acc.averageLikes.toLocaleString()}
                    </TableCell>

                    <TableCell>
                      {acc.averageViews.toLocaleString()}
                    </TableCell>

                    <TableCell>
                      {acc.engagementRate || "-"}
                    </TableCell>

                    <TableCell>
                      {formatCurrencyIdr(acc.estimatedPostRate)}
                    </TableCell>

                    <TableCell>
                      {formatCurrencyIdr(acc.actualPostRate)}
                    </TableCell>
                  </TableRow>
                ))}
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
    <Label className="grid gap-2 text-sm text-[#2b1418]">
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

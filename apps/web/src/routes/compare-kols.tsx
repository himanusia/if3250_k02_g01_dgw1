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
    <div className="h-full overflow-y-auto bg-[#FFF8F9]">
      <div className="mx-auto grid w-full max-w-[1700px] gap-6 px-[10px] py-6 md:px-[14px] [font-family:var(--font-poppins)] xl:grid-cols-[0.9fr_1.1fr]">
      <section className="space-y-4 border-[1.6px] border-[#982E41]/60 bg-white p-4 shadow-[0_18px_45px_rgba(152,46,65,0.08)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#7B204C]">Compare KOL</p>
          <h1 className="text-2xl font-semibold text-[#2B1418]">Bandingkan kandidat KOL</h1>
          <p className="text-[#6D3A44]">
            Cari berdasarkan nama, handle, bidang, atau keyword, lalu pilih beberapa KOL untuk
            dibandingkan.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <FilterInput label="Cari nama / handle" value={search} onChange={setSearch} />
          <FilterInput label="Keyword" value={keywordFilter} onChange={setKeywordFilter} />
        </div>

        <div className="max-h-128 space-y-2 overflow-auto border border-[#982E41]/35 bg-[#FFF8F9] p-3">
          {filteredKols.map((kol) => {
            const selected = selectedKolIds.includes(kol.id);

            return (
              <button
                key={kol.id}
                type="button"
                className={`w-full border p-3 text-left transition-colors ${selected ? "border-[#982E41] bg-[#F8EAED]" : "border-[#982E41]/25 bg-white hover:bg-[#F8EAED]/60"}`}
                onClick={() => {
                  setSelectedKolIds((current) =>
                    current.includes(kol.id)
                      ? current.filter((id) => id !== kol.id)
                      : [...current, kol.id],
                  );
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-[#2B1418]">{kol.displayName}</p>
                    <p className="text-sm text-[#6D3A44]">
                      {kol.accounts.map((account) => `@${account.handle}`).join(" • ")}
                    </p>
                  </div>
                  <span className="text-xs text-[#6D3A44]">{kol.accounts.length} akun</span>
                </div>
                <div className="mt-2 grid gap-1 text-sm text-[#6D3A44] md:grid-cols-2">
                  <p>Keywords: {kol.keywords || "-"}</p>
                  <p>Followers: {kol.totalFollowers.toLocaleString()}</p>
                </div>
              </button>
            );
          })}

          {!filteredKols.length && (
            <p className="text-sm text-[#6D3A44]">Tidak ada akun yang cocok dengan filter.</p>
          )}
        </div>
      </section>

      <section className="space-y-4 border-[1.6px] border-[#982E41]/60 bg-white p-4 shadow-[0_18px_45px_rgba(152,46,65,0.08)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[#2B1418]">Hasil perbandingan</h2>
            <p className="text-[#6D3A44]">
              Pilih beberapa akun untuk melihat metriknya side by side.
            </p>
          </div>

          <div className="grid gap-2">
            <span className="text-sm text-[#2B1418]">Tambahkan akun terpilih ke campaign</span>
            <div className="flex gap-2">
              <Select
                className="border-[#982E41]/70 bg-white text-[#2B1418] focus-visible:border-[#982E41] focus-visible:ring-[#982E41]/30"
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
                className="rounded-none border border-[#982E41] bg-[#F3D7DE] px-4 text-[13px] font-medium text-[#7A2233] hover:bg-[#982E41] hover:text-white"
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
          <h2 className="mb-2 text-lg font-semibold capitalize text-[#2B1418]">
            Overall
          </h2>
          <table className="w-full border border-[#982E41]/35 text-sm">
            <thead className="bg-[#F8EAED] text-[#2B1418]">
              <tr>
                <th className="border border-[#982E41]/35 px-3 py-2 text-left">
                  Name
                </th>
                <th className="border border-[#982E41]/35 px-3 py-2 text-left">
                  Followers
                </th>
                <th className="border border-[#982E41]/35 px-3 py-2 text-left">
                  Avg Likes
                </th>
                <th className="border border-[#982E41]/35 px-3 py-2 text-left">
                  Avg Views
                </th>
                <th className="border border-[#982E41]/35 px-3 py-2 text-left">
                  ER
                </th>
                <th className="border border-[#982E41]/35 px-3 py-2 text-left">
                  Est. Post
                </th>
                <th className="border border-[#982E41]/35 px-3 py-2 text-left">
                  Actual Post
                </th>
              </tr>
            </thead>

            <tbody className="text-[#2B1418]">
              {selectedKols.map((kol) => (
                <tr key={kol.id} className="hover:bg-[#FFF8F9]">
                  <td className="border border-[#982E41]/35 px-3 py-2 font-medium">
                    {kol.displayName}
                  </td>

                  <td className="border border-[#982E41]/35 px-3 py-2">
                    {kol.totalFollowers.toLocaleString()}
                  </td>

                  <td className="border border-[#982E41]/35 px-3 py-2">
                    {kol.averageLikes.toLocaleString()}
                  </td>

                  <td className="border border-[#982E41]/35 px-3 py-2">
                    {kol.averageViews.toLocaleString()}
                  </td>

                  <td className="border border-[#982E41]/35 px-3 py-2">
                    {kol.engagementRate || "-"}
                  </td>

                  <td className="border border-[#982E41]/35 px-3 py-2">
                    {formatCurrencyIdr(kol.estimatedRateCard?.post.suggested)}
                  </td>

                  <td className="border border-[#982E41]/35 px-3 py-2">
                    {formatCurrencyIdr(kol.actualRateCard?.post.suggested)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(Object.entries(groupedByPlatform) as Array<[SocialPlatform, GroupedPlatformAccount[]]>).map(([platform, accounts]) => (
        <div key={platform} className="mb-6">
          <h2 className="mb-2 text-lg font-semibold capitalize text-[#2B1418]">
            {platform}
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full border border-[#982E41]/35 text-sm">
              <thead className="bg-[#F8EAED] text-[#2B1418]">
                <tr>
                  <th className="border border-[#982E41]/35 px-3 py-2 text-left">
                    Name
                  </th>
                  <th className="border border-[#982E41]/35 px-3 py-2 text-left">
                    Handle
                  </th>
                  <th className="border border-[#982E41]/35 px-3 py-2 text-left">
                    Followers
                  </th>
                  <th className="border border-[#982E41]/35 px-3 py-2 text-left">
                    Avg Likes
                  </th>
                  <th className="border border-[#982E41]/35 px-3 py-2 text-left">
                    Avg Views
                  </th>
                  <th className="border border-[#982E41]/35 px-3 py-2 text-left">
                    ER
                  </th>
                  <th className="border border-[#982E41]/35 px-3 py-2 text-left">
                    Est. Post
                  </th>
                  <th className="border border-[#982E41]/35 px-3 py-2 text-left">
                    Actual Post
                  </th>
                </tr>
              </thead>

              <tbody className="text-[#2B1418]">
                {accounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-[#FFF8F9]">
                    <td className="border border-[#982E41]/35 px-3 py-2 font-medium">
                      {acc.displayName}
                    </td>

                    <td className="border border-[#982E41]/35 px-3 py-2">
                      @{acc.handle}
                    </td>

                    <td className="border border-[#982E41]/35 px-3 py-2">
                      {acc.followers.toLocaleString()}
                    </td>

                    <td className="border border-[#982E41]/35 px-3 py-2">
                      {acc.averageLikes.toLocaleString()}
                    </td>

                    <td className="border border-[#982E41]/35 px-3 py-2">
                      {acc.averageViews.toLocaleString()}
                    </td>

                    <td className="border border-[#982E41]/35 px-3 py-2">
                      {acc.engagementRate || "-"}
                    </td>

                    <td className="border border-[#982E41]/35 px-3 py-2">
                      {formatCurrencyIdr(acc.estimatedPostRate)}
                    </td>

                    <td className="border border-[#982E41]/35 px-3 py-2">
                      {formatCurrencyIdr(acc.actualPostRate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
    <Label className="grid gap-2 text-sm text-[#2B1418]">
      <span>{label}</span>
      <Input
        className="border-[#982E41]/70 bg-white text-[#2B1418] placeholder:text-[#A16A75] focus-visible:border-[#982E41] focus-visible:ring-[#982E41]/30"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Label>
  );
}

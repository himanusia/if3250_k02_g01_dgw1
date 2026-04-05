import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import type { CampaignRecord, KolRecord } from "@/lib/app-types";

import { Button } from "@/components/ui/button";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/compare-kols")({
  component: RouteComponent,
});

function RouteComponent() {
  const [search, setSearch] = useState("");
  const [keywordFilter, setKeywordFilter] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [selectedKolIds, setSelectedKolIds] = useState<number[]>([]);

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

  const groupedByPlatform = useMemo(() => {
    const map = {};
    selectedKols.forEach((kol) => {
      kol.accounts.forEach((account) => {
        const platform = account.platform;

        if (!map[platform]) {
          map[platform] = [];
        }

        map[platform].push({
          kolId: kol.id,
          displayName: kol.displayName,
          ...account,
        });
      });
    });

    return map;
  }, [selectedKols]);
  return (
    <div className="container mx-auto grid gap-6 px-4 py-6 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="bg-card ring-foreground/10 space-y-4 p-4 ring-1">
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">Compare KOL</p>
          <h1 className="text-2xl font-semibold">Bandingkan kandidat KOL</h1>
          <p className="text-muted-foreground">
            Cari berdasarkan nama, handle, bidang, atau keyword, lalu pilih beberapa KOL untuk
            dibandingkan.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <FilterInput label="Cari nama / handle" value={search} onChange={setSearch} />
          <FilterInput label="Keyword" value={keywordFilter} onChange={setKeywordFilter} />
        </div>

        <div className="border-border max-h-128 space-y-2 overflow-auto border p-3">
          {filteredKols.map((kol) => {
            const selected = selectedKolIds.includes(kol.id);

            return (
              <button
                key={kol.id}
                type="button"
                className={`border-border w-full border p-3 text-left transition-colors ${selected ? "bg-muted" : "hover:bg-muted/40"}`}
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
                    <p className="font-medium">{kol.displayName}</p>
                    <p className="text-muted-foreground text-sm">
                      {kol.accounts.map((account) => `@${account.handle}`).join(" • ")}
                    </p>
                  </div>
                  <span className="text-muted-foreground text-xs">{kol.accounts.length} akun</span>
                </div>
                <div className="text-muted-foreground mt-2 grid gap-1 text-sm md:grid-cols-2">
                  <p>Keywords: {kol.keywords || "-"}</p>
                  <p>Followers: {kol.totalFollowers.toLocaleString()}</p>
                </div>
              </button>
            );
          })}

          {!filteredKols.length && (
            <p className="text-muted-foreground text-sm">Tidak ada akun yang cocok dengan filter.</p>
          )}
        </div>
      </section>

      <section className="bg-card ring-foreground/10 space-y-4 p-4 ring-1">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Hasil perbandingan</h2>
            <p className="text-muted-foreground">
              Pilih beberapa akun untuk melihat metriknya side by side.
            </p>
          </div>

          <div className="grid gap-2">
            <span className="text-sm">Tambahkan akun terpilih ke campaign</span>
            <div className="flex gap-2">
              <select
                className="border-border bg-background min-h-10 border px-3"
                value={selectedCampaignId}
                onChange={(event) => setSelectedCampaignId(event.target.value)}
              >
                <option value="">Pilih campaign</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
              <Button
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

        {/* TODO: kalau fix, rapiin jadi komponen */}
        <div className="overflow-x-auto">
          <h2 className="mb-2 text-lg font-semibold capitalize text-gray-200">
            Overall
          </h2>
          <table className="w-full border border-gray-700 text-sm">
            <thead className="bg-gray-900 text-gray-300">
              <tr>
                <th className="border border-gray-700 px-3 py-2 text-left">
                  Name
                </th>
                <th className="border border-gray-700 px-3 py-2 text-left">
                  Followers
                </th>
                <th className="border border-gray-700 px-3 py-2 text-left">
                  Avg Likes
                </th>
                <th className="border border-gray-700 px-3 py-2 text-left">
                  Avg Views
                </th>
                <th className="border border-gray-700 px-3 py-2 text-left">
                  ER
                </th>
              </tr>
            </thead>

            <tbody className="text-gray-200">
              {selectedKols.map((kol) => (
                <tr key={kol.id} className="hover:bg-gray-800">
                  <td className="border border-gray-700 px-3 py-2 font-medium">
                    {kol.displayName}
                  </td>

                  <td className="border border-gray-700 px-3 py-2">
                    {kol.totalFollowers.toLocaleString()}
                  </td>

                  <td className="border border-gray-700 px-3 py-2">
                    {kol.averageLikes.toLocaleString()}
                  </td>

                  <td className="border border-gray-700 px-3 py-2">
                    {kol.averageViews.toLocaleString()}
                  </td>

                  <td className="border border-gray-700 px-3 py-2">
                    {kol.engagementRate || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {Object.entries(groupedByPlatform).map(([platform, accounts]) => (
        <div key={platform} className="mb-6">
          <h2 className="mb-2 text-lg font-semibold capitalize text-gray-200">
            {platform}
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full border border-gray-700 text-sm">
              <thead className="bg-gray-900 text-gray-300">
                <tr>
                  <th className="border border-gray-700 px-3 py-2 text-left">
                    Name
                  </th>
                  <th className="border border-gray-700 px-3 py-2 text-left">
                    Handle
                  </th>
                  <th className="border border-gray-700 px-3 py-2 text-left">
                    Followers
                  </th>
                  <th className="border border-gray-700 px-3 py-2 text-left">
                    Avg Likes
                  </th>
                  <th className="border border-gray-700 px-3 py-2 text-left">
                    Avg Views
                  </th>
                  <th className="border border-gray-700 px-3 py-2 text-left">
                    ER
                  </th>
                </tr>
              </thead>

              <tbody className="text-gray-200">
                {accounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-gray-800">
                    <td className="border border-gray-700 px-3 py-2 font-medium">
                      {acc.displayName}
                    </td>

                    <td className="border border-gray-700 px-3 py-2">
                      @{acc.handle}
                    </td>

                    <td className="border border-gray-700 px-3 py-2">
                      {acc.followers.toLocaleString()}
                    </td>

                    <td className="border border-gray-700 px-3 py-2">
                      {acc.averageLikes.toLocaleString()}
                    </td>

                    <td className="border border-gray-700 px-3 py-2">
                      {acc.averageViews.toLocaleString()}
                    </td>

                    <td className="border border-gray-700 px-3 py-2">
                      {acc.engagementRate || "-"}
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
    <label className="grid gap-2 text-sm">
      <span>{label}</span>
      <input
        className="border-border bg-background min-h-10 border px-3"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

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
  const [fieldFilter, setFieldFilter] = useState("");
  const [keywordFilter, setKeywordFilter] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [selectedKolIds, setSelectedKolIds] = useState<number[]>([]);

  const kolQuery = useQuery(orpc.kol.list.queryOptions());
  const campaignQuery = useQuery(orpc.campaign.list.queryOptions());
  const kols = (kolQuery.data as KolRecord[] | undefined) ?? [];
  const campaigns = (campaignQuery.data as CampaignRecord[] | undefined) ?? [];
  const addKol = useMutation({
    mutationFn: (input: { campaignId: number; kolId: number }) => client.campaign.addKolToCampaign(input),
  });

  const filteredKols = useMemo(() => {
    return (
      kols.filter((kol) => {
        const matchesSearch =
          !search ||
          `${kol.displayName} ${kol.accounts.map((account) => account.handle).join(" ")}`
            .toLowerCase()
            .includes(search.toLowerCase());
        const matchesField =
          !fieldFilter || kol.fieldOfExpertise.toLowerCase().includes(fieldFilter.toLowerCase());
        const matchesKeyword =
          !keywordFilter || kol.keywords.toLowerCase().includes(keywordFilter.toLowerCase());

        return matchesSearch && matchesField && matchesKeyword;
      })
    );
  }, [fieldFilter, keywordFilter, kols, search]);

  const selectedKols = filteredKols.filter((kol) => selectedKolIds.includes(kol.id));

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
          <FilterInput label="Bidang" value={fieldFilter} onChange={setFieldFilter} />
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
                  <p>Bidang: {kol.fieldOfExpertise}</p>
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
                }}
              >
                Tambahkan
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {selectedKols.map((kol) => (
            <article key={kol.id} className="border-border space-y-3 border p-3">
              <div>
                <p className="font-medium">{kol.displayName}</p>
                <p className="text-muted-foreground text-sm">
                  {kol.accounts.map((account) => `${account.platform}: @${account.handle}`).join(" • ")}
                </p>
              </div>
              <div className="text-muted-foreground grid gap-1 text-sm">
                <p>Bidang: {kol.fieldOfExpertise}</p>
                <p>Tier: {kol.followerTier}</p>
                <p>Followers: {kol.totalFollowers.toLocaleString()}</p>
                <p>Likes rata-rata: {kol.averageLikes.toLocaleString()}</p>
                <p>Views rata-rata: {kol.averageViews.toLocaleString()}</p>
                <p>ER: {kol.engagementRate || "-"}</p>
              </div>
              {kol.keywords && <p className="text-muted-foreground text-sm">Keywords: {kol.keywords}</p>}
              <div className="flex flex-wrap gap-2">
                {kol.accounts.map((account) => (
                  <span key={account.id} className="border-border text-muted-foreground border px-2 py-1 text-xs">
                    {account.platform} • {account.followers.toLocaleString()} followers
                  </span>
                ))}
              </div>
            </article>
          ))}

          {!selectedKols.length && (
            <p className="text-muted-foreground text-sm">
              Pilih minimal satu akun dari panel kiri untuk mulai membandingkan.
            </p>
          )}
        </div>
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

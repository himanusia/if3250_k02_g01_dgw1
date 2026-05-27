import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Info, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { RateCardFormulaSettings, WhitelistEntry, WhitelistRole } from "@/lib/app-types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { requireAdminWhitelist } from "@/lib/auth-guard";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/settings")({
  beforeLoad: async ({ location }) => {
    const isLocalUiCheck = import.meta.env.DEV
      && new URLSearchParams(location.search).get("uiCheckBypass") === "1"
      && (typeof window === "undefined" || ["localhost", "127.0.0.1"].includes(window.location.hostname));

    if (isLocalUiCheck) return;

    await requireAdminWhitelist();
  },
  component: RouteComponent,
});

function formatTimeUntilDetailed(ms: number) {
  if (ms <= 0) return "next sync now";

  const totalMinutes = Math.floor(ms / 60000);

  if (totalMinutes < 1) {
    return "next sync in: < 1 minute";
  }

  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days} day${days > 1 ? "s" : ""}`);
  }

  if (hours > 0) {
    parts.push(`${hours} hour${hours > 1 ? "s" : ""}`);
  }

  if (minutes > 0 && days === 0) {
    // only show minutes if < 1 day to avoid clutter
    parts.push(`${minutes} minute${minutes > 1 ? "s" : ""}`);
  }

  return `next sync in: ${parts.join(" ")}`;
}

function toMinutes(value: number, unit: "minute" | "hour" | "day") {
  switch (unit) {
    case "minute":
      return value;
    case "hour":
      return value * 60;
    case "day":
      return value * 1440;
  }
}

function fromMinutes(minutes: number) {
  if (minutes % 1440 === 0) {
    return { value: minutes / 1440, unit: "day" as const };
  }

  if (minutes % 60 === 0) {
    return { value: minutes / 60, unit: "hour" as const };
  }

  return { value: minutes, unit: "minute" as const };
}

const DEFAULT_RATE_FORM: RateCardFormulaSettings = {
  campaignHistoryBonus: 0.03,
  engagementRateIdr: 700,
  followerRateIdr: 35,
  instagramMultiplier: 1,
  macroTierMultiplier: 1.1,
  maxCampaignHistoryBonus: 0.15,
  maxMultiPlatformBonus: 0.1,
  megaTierMultiplier: 1.25,
  microTierMultiplier: 1,
  minimumRateIdr: 50000,
  multiPlatformBonus: 0.05,
  nanoTierMultiplier: 0.9,
  rangeSpread: 0.2,
  reelMultiplier: 1.6,
  storyMultiplier: 0.35,
  tiktokMultiplier: 0.85,
  viewCpmIdr: 50000,
};

function parseNumberInput(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function RouteComponent() {
  useEffect(() => {
    document.documentElement.classList.add("digiTheme");
    document.body.classList.add("digiTheme");

    return () => {
      document.documentElement.classList.remove("digiTheme");
      document.body.classList.remove("digiTheme");
    };
  }, []);

  const syncSettingsQuery = useQuery(
    orpc.whitelist.getSyncSettings.queryOptions()
  );
  const rateFormulaQuery = useQuery(orpc.whitelist.getRateCardFormulaSettings.queryOptions());

  const syncSettings = syncSettingsQuery.data;
  const [syncForm, setSyncForm] = useState({
    intervalValue: 1,
    intervalUnit: "day" as "minute" | "hour" | "day",
    enabled: true,
  });
  const [rateForm, setRateForm] = useState<RateCardFormulaSettings>(DEFAULT_RATE_FORM);

  useEffect(() => {
    if (!syncSettings) return;

    const converted = fromMinutes(syncSettings.intervalMinutes);

    setSyncForm({
      intervalValue: converted.value,
      intervalUnit: converted.unit,
      enabled: syncSettings.enabled,
    });
  }, [syncSettings]);

  useEffect(() => {
    if (rateFormulaQuery.data) {
      setRateForm(rateFormulaQuery.data as RateCardFormulaSettings);
    }
  }, [rateFormulaQuery.data]);

  const intervalMinutes = toMinutes(syncForm.intervalValue, syncForm.intervalUnit);

  const enabled = syncForm.enabled;

  const now = Date.now();
  const intervalMs = intervalMinutes * 60 * 1000;

  const nextTick =
    Math.ceil(now / intervalMs) * intervalMs;

  const msUntilNext = nextTick - now;

  const nextSyncLabel = enabled ? formatTimeUntilDetailed(msUntilNext) : "";

  const updateSyncSettings = useMutation({
    mutationFn: (input: { intervalMinutes: number; enabled: boolean }) =>
      client.whitelist.updateSyncSettings(input),
    onSuccess: () => {
      toast.success("Pengaturan sync diperbarui");
      syncSettingsQuery.refetch();
    },
  });
  const updateRateFormula = useMutation({
    mutationFn: (input: RateCardFormulaSettings) => client.whitelist.updateRateCardFormulaSettings(input),
    onSuccess: () => {
      toast.success("Rumus estimasi rate diperbarui");
      rateFormulaQuery.refetch();
    },
  });
  const resetRateFormula = useMutation({
    mutationFn: () => client.whitelist.resetRateCardFormulaSettings(),
    onSuccess: (settings) => {
      toast.success("Rumus estimasi rate dikembalikan ke default");
      setRateForm(settings as RateCardFormulaSettings);
      rateFormulaQuery.refetch();
    },
  });

  function submitSyncSettings() {
    updateSyncSettings.mutate({
      intervalMinutes: toMinutes(
        syncForm.intervalValue,
        syncForm.intervalUnit
      ),
      enabled: syncForm.enabled,
    });
  }

  function updateRateField(key: keyof RateCardFormulaSettings, value: string) {
    setRateForm((current) => ({
      ...current,
      [key]: parseNumberInput(value),
    }));
  }

  const [form, setForm] = useState({
    email: "",
    note: "",
    role: "user" as WhitelistRole,
  });

  const whitelistEntriesQuery = useQuery(orpc.whitelist.list.queryOptions());
  const whitelistEntries = (whitelistEntriesQuery.data as WhitelistEntry[] | undefined) ?? [];
  const createEntry = useMutation({
    mutationFn: (input: { email: string; note: string; role: WhitelistRole }) => client.whitelist.create(input),
    onSuccess: () => {
      toast.success("Akses berhasil diperbarui");
      whitelistEntriesQuery.refetch();
      setForm({ email: "", note: "", role: "user" });
    },
  });
  const deleteEntry = useMutation({
    mutationFn: (input: { id: number }) => client.whitelist.delete(input),
    onSuccess: () => {
      toast.success("Akses email berhasil dihapus");
      whitelistEntriesQuery.refetch();
    },
  });

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="container mx-auto grid max-w-6xl gap-5 px-4 py-6 lg:py-8">
      <section className="w-full space-y-4 rounded-none border border-[#b43c39]/15 bg-white p-5 shadow-[8px_8px_0_rgba(152,46,65,0.10)]">
        <div>
          <h1 className="font-goldman text-3xl font-bold uppercase tracking-wide text-[#2b1418] md:text-4xl">Settings</h1>
        </div>

        {syncSettingsQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <div className="grid gap-3 sm:grid-cols-[140px_180px_auto]">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-10 w-28 self-end" />
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 border border-[#b43c39]/15 bg-[#fff6f8] px-3 py-2 text-sm text-[#2b1418]">
              <span className="font-medium">Sync</span>
              <Switch
                checked={syncForm.enabled}
                onCheckedChange={(checked) =>
                  setSyncForm((prev) => ({
                    ...prev,
                    enabled: checked,
                  }))
                }
              />
            </div>

            {enabled && (
              <div className="grid gap-3 sm:grid-cols-[140px_180px_auto] sm:items-end">
            <Label className="grid gap-2 text-sm">
              <span>Durasi</span>
              <Input
                className="border-[#b43c39]/20 bg-white text-[#2b1418] focus-visible:border-[#B43C39] focus-visible:ring-[#B43C39]/15"
                type="number"
                min={1}
                value={syncForm.intervalValue}
                onChange={(e) =>
                  setSyncForm((prev) => ({
                    ...prev,
                    intervalValue: Number(e.target.value),
                  }))
                }
              />
            </Label>

            <Label className="grid gap-2 text-sm">
              <span>Unit</span>
              <Select
                className="border-[#b43c39]/20 bg-white text-[#2b1418] focus-visible:border-[#B43C39] focus-visible:ring-[#B43C39]/15"
                value={syncForm.intervalUnit}
                onChange={(e) =>
                  setSyncForm((prev) => ({
                    ...prev,
                    intervalUnit: e.target.value as "minute" | "hour" | "day",
                  }))
                }
              >
                <option value="minute">Menit</option>
                <option value="hour">Jam</option>
                <option value="day">Hari</option>
              </Select>
            </Label>

            <Button
              onClick={submitSyncSettings}
              disabled={updateSyncSettings.isPending}
              className="rounded-none border border-[#B43C39] bg-[#B43C39] px-4 text-[13px] font-medium text-white hover:bg-[#8f2e2c]"
            >
              {updateSyncSettings.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
              </div>
            )}

            {enabled && <p className="text-sm text-muted-foreground">{nextSyncLabel}</p>}
          </>
        )}
      </section>

      <section className="w-full space-y-4 rounded-none border border-[#b43c39]/15 bg-white p-5 shadow-[8px_8px_0_rgba(152,46,65,0.10)]">
        <div>
          <h2 className="font-goldman text-2xl font-bold uppercase tracking-wide text-[#2b1418]">Rate Formula</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Estimasi deterministik: followers, engagement rate, average views, platform, tier, multi-platform, dan history campaign.
          </p>
        </div>

        {rateFormulaQuery.isLoading ? (
          <div className="grid gap-3 md:grid-cols-3">
            {Array.from({ length: 9 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <RateField label="Minimum rate (IDR)" description="Floor harga supaya nano KOL tidak jatuh ke angka terlalu kecil." value={rateForm.minimumRateIdr} onChange={(value) => updateRateField("minimumRateIdr", value)} />
              <RateField label="IDR per follower" description="Komponen nilai audience: total followers dikali angka ini." value={rateForm.followerRateIdr} onChange={(value) => updateRateField("followerRateIdr", value)} />
              <RateField label="IDR per engagement" description="Komponen interaksi: followers dikali engagement rate dikali angka ini." value={rateForm.engagementRateIdr} onChange={(value) => updateRateField("engagementRateIdr", value)} />
              <RateField label="View CPM (IDR)" description="Komponen video: average views per 1.000 views dikali CPM." value={rateForm.viewCpmIdr} onChange={(value) => updateRateField("viewCpmIdr", value)} />
              <RateField label="Instagram multiplier" description="Pengali khusus platform Instagram." step="0.01" value={rateForm.instagramMultiplier} onChange={(value) => updateRateField("instagramMultiplier", value)} />
              <RateField label="TikTok multiplier" description="Pengali khusus platform TikTok." step="0.01" value={rateForm.tiktokMultiplier} onChange={(value) => updateRateField("tiktokMultiplier", value)} />
              <RateField label="Nano tier multiplier" description="Pengali untuk KOL < 10.000 followers." step="0.01" value={rateForm.nanoTierMultiplier} onChange={(value) => updateRateField("nanoTierMultiplier", value)} />
              <RateField label="Micro tier multiplier" description="Pengali untuk 10.000 sampai 99.999 followers." step="0.01" value={rateForm.microTierMultiplier} onChange={(value) => updateRateField("microTierMultiplier", value)} />
              <RateField label="Macro tier multiplier" description="Pengali untuk 100.000 sampai 999.999 followers." step="0.01" value={rateForm.macroTierMultiplier} onChange={(value) => updateRateField("macroTierMultiplier", value)} />
              <RateField label="Mega tier multiplier" description="Pengali untuk 1.000.000+ followers." step="0.01" value={rateForm.megaTierMultiplier} onChange={(value) => updateRateField("megaTierMultiplier", value)} />
              <RateField label="Story multiplier" description="Story rate = post rate dikali angka ini." step="0.01" value={rateForm.storyMultiplier} onChange={(value) => updateRateField("storyMultiplier", value)} />
              <RateField label="Reel multiplier" description="Reels rate = post rate dikali angka ini." step="0.01" value={rateForm.reelMultiplier} onChange={(value) => updateRateField("reelMultiplier", value)} />
              <RateField label="Range spread" description="Jarak min dan max dari suggested rate." step="0.01" value={rateForm.rangeSpread} onChange={(value) => updateRateField("rangeSpread", value)} />
              <RateField label="Campaign history bonus" description="Bonus per history campaign tersimpan." step="0.01" value={rateForm.campaignHistoryBonus} onChange={(value) => updateRateField("campaignHistoryBonus", value)} />
              <RateField label="Max history bonus" description="Batas maksimum bonus history campaign." step="0.01" value={rateForm.maxCampaignHistoryBonus} onChange={(value) => updateRateField("maxCampaignHistoryBonus", value)} />
              <RateField label="Multi-platform bonus" description="Bonus per platform sosial tambahan." step="0.01" value={rateForm.multiPlatformBonus} onChange={(value) => updateRateField("multiPlatformBonus", value)} />
              <RateField label="Max multi-platform bonus" description="Batas maksimum bonus multi-platform." step="0.01" value={rateForm.maxMultiPlatformBonus} onChange={(value) => updateRateField("maxMultiPlatformBonus", value)} />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => updateRateFormula.mutate(rateForm)}
                disabled={updateRateFormula.isPending}
                className="rounded-none border border-[#B43C39] bg-[#B43C39] px-4 text-[13px] font-medium text-white hover:bg-[#8f2e2c]"
              >
                {updateRateFormula.isPending ? "Menyimpan..." : "Simpan rumus"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => resetRateFormula.mutate()}
                disabled={resetRateFormula.isPending}
                className="rounded-none border border-[#B43C39] bg-white px-4 text-[13px] font-medium text-[#B43C39] hover:bg-[#fff3d8] hover:text-[#8f2e2c]"
              >
                {resetRateFormula.isPending ? "Reset..." : "Reset default"}
              </Button>
            </div>
          </>
        )}
      </section>

      <section className="w-full space-y-4 rounded-none border border-[#b43c39]/15 bg-white p-5 shadow-[8px_8px_0_rgba(152,46,65,0.10)]">
        <div>
          <h2 className="font-goldman text-2xl font-bold uppercase tracking-wide text-[#2b1418]">Whitelist</h2>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            createEntry.mutate(form);
          }}
        >
          <Label className="grid gap-2 text-sm">
            <span>Email</span>
            <Input
              className="border-[#b43c39]/20 bg-white text-[#2b1418] placeholder:text-[#A16A75] focus-visible:border-[#B43C39] focus-visible:ring-[#B43C39]/15"
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="nama@domain.com"
              required
            />
          </Label>

          <Label className="grid gap-2 text-sm">
            <span>Role</span>
            <Select
              className="border-[#b43c39]/20 bg-white text-[#2b1418] focus-visible:border-[#B43C39] focus-visible:ring-[#B43C39]/15"
              value={form.role}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  role: event.target.value as WhitelistRole,
                }))
              }
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </Select>
          </Label>

          <Label className="grid gap-2 text-sm">
            <span>Catatan</span>
            <Textarea
              className="border-[#b43c39]/20 bg-white text-[#2b1418] placeholder:text-[#A16A75] focus-visible:border-[#B43C39] focus-visible:ring-[#B43C39]/15"
              value={form.note}
              onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
              placeholder="Contoh: tim brand, boleh mengelola campaign"
            />
          </Label>

          <Button type="submit" disabled={createEntry.isPending} className="rounded-none border border-[#B43C39] bg-[#B43C39] px-4 text-[13px] font-medium text-white hover:bg-[#8f2e2c]">
            {createEntry.isPending ? "Menyimpan..." : "Simpan akses"}
          </Button>
        </form>
      </section>

      <section className="w-full space-y-4 rounded-none border border-[#b43c39]/15 bg-white p-5 shadow-[8px_8px_0_rgba(152,46,65,0.10)]">
        <div>
          <h2 className="font-goldman text-2xl font-bold uppercase tracking-wide text-[#2b1418]">Daftar email yang diizinkan</h2>
        </div>

        <div className="space-y-3">
          {whitelistEntriesQuery.isLoading ? (
            <AccessListSkeleton />
          ) : whitelistEntries.map((entry) => (
            <div key={entry.id} className="flex items-start justify-between gap-4 border border-[#b43c39]/15 bg-[#fff6f8] p-3">
              <div className="space-y-1">
                <p className="font-medium text-[#2b1418]">{entry.email}</p>
                <p className="text-sm text-muted-foreground">Role: {entry.role}</p>
                {entry.note && <p className="text-sm text-muted-foreground">{entry.note}</p>}
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="rounded-none border-red-700 bg-red-600 px-2 text-white hover:bg-red-700"
                onClick={() => deleteEntry.mutate({ id: entry.id })}
                disabled={deleteEntry.isPending}
                aria-label={`Hapus ${entry.email}`}
                title="Hapus"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}

          {!whitelistEntriesQuery.isLoading && !whitelistEntries.length && (
            <p className="text-sm text-muted-foreground">Belum ada email yang diberi akses.</p>
          )}
        </div>
      </section>
      </div>
    </div>
  );
}


function AccessListSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex items-start justify-between gap-4 border border-[#b43c39]/15 bg-[#fff6f8] p-3">
          <div className="space-y-2">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </>
  );
}

function RateField({
  description,
  label,
  onChange,
  step = "1",
  value,
}: {
  description?: string;
  label: string;
  onChange: (value: string) => void;
  step?: string;
  value: number;
}) {
  return (
    <Label className="grid gap-2 text-sm">
      <span className="inline-flex items-center gap-1">
        {label}
        {description && (
          <span title={description} aria-label={description}>
            <Info className="size-3.5 text-[#982E41]" />
          </span>
        )}
      </span>
      <Input
        className="border-[#b43c39]/20 bg-white text-[#2b1418] focus-visible:border-[#B43C39] focus-visible:ring-[#B43C39]/15"
        min={0}
        step={step}
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Label>
  );
}

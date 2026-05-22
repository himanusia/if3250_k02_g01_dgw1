import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { WhitelistEntry, WhitelistRole } from "@/lib/app-types";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { requireAdminWhitelist } from "@/lib/auth-guard";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/whitelist")({
  beforeLoad: async () => {
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

function RouteComponent() {
  const syncSettingsQuery = useQuery(
    orpc.whitelist.getSyncSettings.queryOptions()
  );

  const syncSettings = syncSettingsQuery.data;
  const [syncForm, setSyncForm] = useState({
    intervalValue: 30,
    intervalUnit: "minute" as "minute" | "hour" | "day",
    enabled: true,
  });

  useEffect(() => {
    if (!syncSettings) return;

    const converted = fromMinutes(syncSettings.intervalMinutes);

    setSyncForm({
      intervalValue: converted.value,
      intervalUnit: converted.unit,
      enabled: syncSettings.enabled,
    });
  }, [syncSettings]);

  const intervalMinutes = toMinutes(syncForm.intervalValue, syncForm.intervalUnit);

  const enabled = syncForm.enabled;

  const now = Date.now();
  const intervalMs = intervalMinutes * 60 * 1000;

  const nextTick =
    Math.ceil(now / intervalMs) * intervalMs;

  const msUntilNext = nextTick - now;

  const nextSyncLabel = enabled
    ? formatTimeUntilDetailed(msUntilNext)
    : "global sync disabled";

  const updateSyncSettings = useMutation({
    mutationFn: (input: { intervalMinutes: number; enabled: boolean }) =>
      client.whitelist.updateSyncSettings(input),
    onSuccess: () => {
      toast.success("Pengaturan sync diperbarui");
      syncSettingsQuery.refetch();
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
      toast.success("Whitelist berhasil diperbarui");
      whitelistEntriesQuery.refetch();
      setForm({ email: "", note: "", role: "user" });
    },
  });
  const deleteEntry = useMutation({
    mutationFn: (input: { id: number }) => client.whitelist.delete(input),
    onSuccess: () => {
      toast.success("Email berhasil dihapus dari whitelist");
      whitelistEntriesQuery.refetch();
    },
  });

  return (
    <div className="h-full overflow-y-auto bg-[#FFF8F9]">
      <div className="container mx-auto grid gap-6 px-4 py-6 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="space-y-4 border-[1.6px] border-[#982E41]/60 bg-white p-4 shadow-[0_18px_45px_rgba(152,46,65,0.08)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#7B204C]">
            Administrator only
          </p>
          <h1 className="text-2xl font-semibold text-[#2B1418]">Kelola whitelist email</h1>
          <p className="text-[#6D3A44]">
            Administrator bisa menentukan email mana yang boleh login, sekaligus role user-nya.
          </p>
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
              value={form.note}
              onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
              placeholder="Contoh: tim brand, boleh mengelola campaign"
            />
          </Label>

          <Button type="submit" disabled={createEntry.isPending} className="bg-[#982E41] text-white hover:bg-[#7B204C]">
            {createEntry.isPending ? "Menyimpan..." : "Simpan whitelist"}
          </Button>
        </form>
      </section>

      <section className="space-y-4 border-[1.6px] border-[#982E41]/60 bg-white p-4 shadow-[0_18px_45px_rgba(152,46,65,0.08)]">
        <div>
          <h2 className="text-xl font-semibold text-[#2B1418]">Daftar email yang diizinkan</h2>
        </div>

        <div className="space-y-3">
          {whitelistEntries.map((entry) => (
            <div key={entry.id} className="flex items-start justify-between gap-4 border border-[#982E41]/35 bg-[#FFF8F9] p-3">
              <div className="space-y-1">
                <p className="font-medium text-[#2B1418]">{entry.email}</p>
                <p className="text-sm text-[#6D3A44]">Role: {entry.role}</p>
                {entry.note && <p className="text-sm text-[#6D3A44]">{entry.note}</p>}
              </div>
              <Button
                variant="destructive"
                size="icon"
                onClick={() => deleteEntry.mutate({ id: entry.id })}
                disabled={deleteEntry.isPending}
                aria-label={`Delete ${entry.email}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}

          {!whitelistEntries.length && (
            <p className="text-sm text-[#6D3A44]">Belum ada email di whitelist database.</p>
          )}
        </div>
      </section>
      <section className="space-y-4 border-[1.6px] border-[#982E41]/60 bg-white p-4 shadow-[0_18px_45px_rgba(152,46,65,0.08)]">
        <div>
          <h2 className="text-xl font-semibold text-[#2B1418]">Global Sync Settings</h2>
          <p className="text-sm text-[#6D3A44]">
            Atur seberapa sering semua KOL akan disinkronkan.
          </p>
          <p className="text-sm text-[#6D3A44]">
            {nextSyncLabel}
          </p>
        </div>

        <Label className="flex items-center gap-2 text-sm text-[#2B1418]">
          <Checkbox
            checked={syncForm.enabled}
            onCheckedChange={(checked) =>
              setSyncForm((prev) => ({
                ...prev,
                enabled: checked === true,
              }))
            }
          />
          Enable global sync
        </Label>

        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            value={syncForm.intervalValue}
            disabled={!enabled}
            onChange={(e) =>
              setSyncForm((prev) => ({
                ...prev,
                intervalValue: Number(e.target.value),
              }))
            }
            className="w-28"
          />

          <Select
            value={syncForm.intervalUnit}
            disabled={!enabled}
            onChange={(e) =>
              setSyncForm((prev) => ({
                ...prev,
                intervalUnit: e.target.value as "minute" | "hour" | "day",
              }))
            }
          >
            <option value="minute">Minute(s)</option>
            <option value="hour">Hour(s)</option>
            <option value="day">Day(s)</option>
          </Select>
        </div>

        <Button
          onClick={submitSyncSettings}
          disabled={updateSyncSettings.isPending}
          className="bg-[#982E41] text-white hover:bg-[#7B204C]"
        >
          {updateSyncSettings.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </section>
      </div>
    </div>
  );
}

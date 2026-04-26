import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { AccessEntry, AccessRole } from "@/lib/app-types";

import { Button } from "@/components/ui/button";
import { requireAdminAccess } from "@/lib/auth-guard";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/access")({
  beforeLoad: async () => {
    await requireAdminAccess();
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
    orpc.access.getSyncSettings.queryOptions()
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

  const intervalMinutes =
    syncSettings?.intervalMinutes ??
    toMinutes(syncForm.intervalValue, syncForm.intervalUnit);

  const enabled = syncSettings?.enabled ?? syncForm.enabled;

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
      client.access.updateSyncSettings(input),
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
    role: "user" as AccessRole,
  });

  const accessEntriesQuery = useQuery(orpc.access.list.queryOptions());
  const accessEntries = (accessEntriesQuery.data as AccessEntry[] | undefined) ?? [];
  const createEntry = useMutation({
    mutationFn: (input: { email: string; note: string; role: AccessRole }) => client.access.create(input),
    onSuccess: () => {
      toast.success("Whitelist berhasil diperbarui");
      accessEntriesQuery.refetch();
      setForm({ email: "", note: "", role: "user" });
    },
  });
  const deleteEntry = useMutation({
    mutationFn: (input: { id: number }) => client.access.delete(input),
    onSuccess: () => {
      toast.success("Email berhasil dihapus dari whitelist");
      accessEntriesQuery.refetch();
    },
  });

  return (
    <div className="container mx-auto grid gap-6 px-4 py-6 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="bg-card ring-foreground/10 space-y-4 p-4 ring-1">
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
            Administrator only
          </p>
          <h1 className="text-2xl font-semibold">Kelola whitelist email</h1>
          <p className="text-muted-foreground">
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
          <label className="grid gap-2 text-sm">
            <span>Email</span>
            <input
              className="border-border bg-background min-h-10 border px-3"
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="nama@domain.com"
              required
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span>Role</span>
            <select
              className="border-border bg-background min-h-10 border px-3"
              value={form.role}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  role: event.target.value as AccessRole,
                }))
              }
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          <label className="grid gap-2 text-sm">
            <span>Catatan</span>
            <textarea
              className="border-border bg-background min-h-28 border px-3 py-2"
              value={form.note}
              onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
              placeholder="Contoh: tim brand, boleh mengelola campaign"
            />
          </label>

          <Button type="submit" disabled={createEntry.isPending}>
            {createEntry.isPending ? "Menyimpan..." : "Simpan whitelist"}
          </Button>
        </form>
      </section>

      <section className="bg-card ring-foreground/10 space-y-4 p-4 ring-1">
        <div>
          <h2 className="text-xl font-semibold">Daftar email yang diizinkan</h2>
        </div>

        <div className="space-y-3">
          {accessEntries.map((entry) => (
            <div key={entry.id} className="border-border flex items-start justify-between gap-4 border p-3">
              <div className="space-y-1">
                <p className="font-medium">{entry.email}</p>
                <p className="text-muted-foreground text-sm">Role: {entry.role}</p>
                {entry.note && <p className="text-muted-foreground text-sm">{entry.note}</p>}
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

          {!accessEntries.length && (
            <p className="text-muted-foreground text-sm">Belum ada email di whitelist database.</p>
          )}
        </div>
      </section>
      <section className="bg-card ring-foreground/10 space-y-4 p-4 ring-1">
        <div>
          <h2 className="text-xl font-semibold">Global Sync Settings</h2>
          <p className="text-muted-foreground text-sm">
            Atur seberapa sering semua KOL akan disinkronkan.
          </p>
          <p className="text-muted-foreground text-sm">
            {nextSyncLabel}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={syncForm.intervalValue}
            onChange={(e) =>
              setSyncForm((prev) => ({
                ...prev,
                intervalValue: Number(e.target.value),
              }))
            }
            className="w-24"
          />

          <select
            value={syncForm.intervalUnit}
            onChange={(e) =>
              setSyncForm((prev) => ({
                ...prev,
                intervalUnit: e.target.value as "minute" | "hour" | "day",
              }))
            }
            className="
              border-border bg-background text-foreground
              focus-visible:border-ring focus-visible:ring-ring/50
              min-h-10 rounded-none border px-3 text-sm outline-none
            "
          >
            <option value="minute">Minute(s)</option>
            <option value="hour">Hour(s)</option>
            <option value="day">Day(s)</option>
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={syncForm.enabled}
            onChange={(e) =>
              setSyncForm((prev) => ({
                ...prev,
                enabled: e.target.checked,
              }))
            }
            className="accent-foreground"
          />
          Enable global sync
        </label>

        <Button
          onClick={submitSyncSettings}
          disabled={updateSyncSettings.isPending}
        >
          {updateSyncSettings.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </section>
    </div>
  );
}

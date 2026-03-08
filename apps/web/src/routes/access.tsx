import { useMutation, useQuery } from "@tanstack/react-query";
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

function RouteComponent() {
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
    </div>
  );
}

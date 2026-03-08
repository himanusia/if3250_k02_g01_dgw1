import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PencilLine, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { KolRecord, SocialPlatform } from "@/lib/app-types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { client, orpc } from "@/utils/orpc";

type KolAccountFormState = {
  handle: string;
  platform: SocialPlatform;
  profileUrl: string;
};

type KolFormState = {
  bio: string;
  accounts: KolAccountFormState[];
  displayName: string;
  fieldOfExpertise: string;
  keywords: string;
};

function getDefaultAccount(platform: SocialPlatform = "instagram"): KolAccountFormState {
  return {
    handle: "",
    platform,
    profileUrl: "",
  };
}

function getDefaultForm(): KolFormState {
  return {
    bio: "",
    accounts: [getDefaultAccount("instagram")],
    displayName: "",
    fieldOfExpertise: "",
    keywords: "",
  };
}

export const Route = createFileRoute("/kols")({
  component: RouteComponent,
});

function RouteComponent() {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState<KolFormState>(getDefaultForm());
  const kolQuery = useQuery(orpc.kol.list.queryOptions());
  const kols = (kolQuery.data as KolRecord[] | undefined) ?? [];

  const createKol = useMutation({
    mutationFn: (input: KolFormState) => client.kol.create(input),
    onSuccess: () => {
      toast.success("KOL berhasil ditambahkan ke database");
      kolQuery.refetch();
      resetForm();
    },
  });

  const updateKol = useMutation({
    mutationFn: (input: KolFormState & { id: number }) => client.kol.update(input),
    onSuccess: () => {
      toast.success("KOL berhasil diperbarui");
      kolQuery.refetch();
      resetForm();
    },
  });

  function resetForm() {
    setEditingId(null);
    setIsDialogOpen(false);
    setForm(getDefaultForm());
  }

  function openCreateDialog() {
    setEditingId(null);
    setForm(getDefaultForm());
    setIsDialogOpen(true);
  }

  function editKol(kol: KolRecord) {
    setEditingId(kol.id);
    setForm({
      bio: kol.bio ?? "",
      accounts: kol.accounts.map((account) => ({
        handle: account.handle,
        platform: account.platform,
        profileUrl: account.profileUrl ?? "",
      })),
      displayName: kol.displayName,
      fieldOfExpertise: kol.fieldOfExpertise,
      keywords: kol.keywords,
    });
    setIsDialogOpen(true);
  }

  function submit() {
    if (editingId) {
      updateKol.mutate({ id: editingId, ...form });
      return;
    }

    createKol.mutate(form);
  }

  return (
    <>
      <div className="container mx-auto space-y-6 px-4 py-6">
        <section className="bg-card ring-foreground/10 space-y-4 p-4 ring-1">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">KOL</p>
              <h1 className="text-2xl font-semibold">Daftar KOL</h1>
              <p className="text-muted-foreground">
                Halaman ini berisi list KOL. Tambah dan edit dilakukan lewat dialog.
              </p>
            </div>
            <Button type="button" onClick={openCreateDialog}>
              <Plus className="mr-2 size-4" />
              Tambah KOL
            </Button>
          </div>

          <div className="space-y-3">
            {kols.map((kol) => (
              <div key={kol.id} className="border-border space-y-2 border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{kol.displayName}</p>
                    <p className="text-muted-foreground text-sm">{kol.accounts.length} akun terhubung</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-muted-foreground text-sm">{kol.syncStatus}</p>
                    <Button variant="outline" size="sm" onClick={() => editKol(kol)}>
                      <PencilLine className="mr-1 size-4" />
                      Edit
                    </Button>
                  </div>
                </div>
                <div className="text-muted-foreground grid gap-1 text-sm md:grid-cols-2">
                  <p>Bidang: {kol.fieldOfExpertise}</p>
                  <p>Tier: {kol.followerTier}</p>
                  <p>Followers: {kol.totalFollowers.toLocaleString()}</p>
                  <p>ER: {kol.engagementRate || "-"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {kol.accounts.map((account) => (
                    <span key={account.id} className="border-border text-muted-foreground border px-2 py-1 text-xs">
                      {account.platform} • @{account.handle}
                    </span>
                  ))}
                </div>
                {kol.keywords && <p className="text-muted-foreground text-sm">Keywords: {kol.keywords}</p>}
              </div>
            ))}

            {!kols.length && (
              <p className="text-muted-foreground text-sm">Belum ada KOL yang tersimpan.</p>
            )}
          </div>
        </section>
      </div>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            resetForm();
            return;
          }

          setIsDialogOpen(true);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto p-0">
          <DialogHeader>
            <div className="border-border border-b px-4 py-4 sm:px-6">
              <DialogTitle>{editingId ? "Edit KOL" : "Tambah KOL"}</DialogTitle>
              <DialogDescription>
                Satu KOL bisa punya beberapa akun, misalnya Instagram dan TikTok sekaligus.
              </DialogDescription>
            </div>
          </DialogHeader>

          <form
            className="grid gap-5 overflow-x-hidden px-4 pb-4 sm:px-6 sm:pb-6"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="grid gap-5 md:grid-cols-2">
              <FormInput
                label="Display name"
                value={form.displayName}
                onChange={(value) => setForm((current) => ({ ...current, displayName: value }))}
              />
              <FormInput
                label="Bidang"
                value={form.fieldOfExpertise}
                onChange={(value) => setForm((current) => ({ ...current, fieldOfExpertise: value }))}
                placeholder="Pet care, beauty, gaming"
              />
              <FormInput
                label="Keyword / tags"
                value={form.keywords}
                onChange={(value) => setForm((current) => ({ ...current, keywords: value }))}
                placeholder="Pisahkan dengan koma"
              />
            </div>

            <FormTextarea
              label="Bio / deskripsi singkat"
              value={form.bio}
              onChange={(value) => setForm((current) => ({ ...current, bio: value }))}
            />

            <div className="grid gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-base font-medium">Akun platform</h2>
                  <p className="text-muted-foreground text-sm">Tambahkan semua akun milik KOL ini.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setForm((current) => ({
                      ...current,
                      accounts: [...current.accounts, getDefaultAccount("tiktok")],
                    }));
                  }}
                >
                  <Plus className="mr-2 size-4" />
                  Tambah akun
                </Button>
              </div>

              {form.accounts.map((account, index) => (
                <div
                  key={`${account.platform}-${index}`}
                  className="border-border grid min-w-0 gap-4 border p-3 md:grid-cols-2 xl:grid-cols-[0.8fr_1fr_1.2fr_auto]"
                >
                  <Label className="grid gap-2">
                    <span>Platform</span>
                    <select
                      className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 min-h-10 w-full min-w-0 rounded-none border px-3 text-xs outline-none focus-visible:ring-1"
                      value={account.platform}
                      onChange={(event) => {
                        const platform = event.target.value as SocialPlatform;
                        setForm((current) => ({
                          ...current,
                          accounts: current.accounts.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, platform } : item,
                          ),
                        }));
                      }}
                    >
                      <option value="instagram">Instagram</option>
                      <option value="tiktok">TikTok</option>
                      <option value="shopee">Shopee</option>
                    </select>
                  </Label>

                  <FormInput
                    label="Handle"
                    value={account.handle}
                    onChange={(value) => {
                      setForm((current) => ({
                        ...current,
                        accounts: current.accounts.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, handle: value } : item,
                        ),
                      }));
                    }}
                  />

                  <FormInput
                    label="Profile URL"
                    placeholder="Opsional"
                    value={account.profileUrl}
                    onChange={(value) => {
                      setForm((current) => ({
                        ...current,
                        accounts: current.accounts.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, profileUrl: value } : item,
                        ),
                      }));
                    }}
                  />

                  <div className="flex items-end xl:col-start-4">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={form.accounts.length === 1}
                      onClick={() => {
                        setForm((current) => ({
                          ...current,
                          accounts: current.accounts.filter((_, itemIndex) => itemIndex !== index),
                        }));
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter className="border-border border-t pt-4">
              {editingId && (
                <Button type="button" variant="outline" onClick={resetForm}>
                  Batal edit
                </Button>
              )}
              <Button type="submit" disabled={createKol.isPending || updateKol.isPending}>
                {editingId
                  ? updateKol.isPending
                    ? "Menyimpan perubahan..."
                    : "Update KOL"
                  : createKol.isPending
                    ? "Menyimpan..."
                    : "Simpan KOL"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FormInput({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <Label className="grid min-w-0 gap-2">
      <span>{label}</span>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={!placeholder}
      />
    </Label>
  );
}

function FormTextarea({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <Label className="grid gap-2">
      <span>{label}</span>
      <textarea
        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 min-h-24 w-full min-w-0 rounded-none border px-3 py-2 text-xs outline-none focus-visible:ring-1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </Label>
  );
}

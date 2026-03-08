import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PencilLine, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { CampaignRecord, KolRecord } from "@/lib/app-types";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { client, orpc } from "@/utils/orpc";

type CampaignFormState = {
  brand: string;
  description: string;
  keywords: string;
  name: string;
  objective: string;
  periodEnd: string;
  periodStart: string;
  postBriefs: string;
  selectedKolIds: number[];
  status: CampaignRecord["status"];
  targetFollowerTier: string;
  targetKolCount: number;
};

function getDefaultForm(): CampaignFormState {
  return {
    brand: "",
    description: "",
    keywords: "",
    name: "",
    objective: "",
    periodEnd: "",
    periodStart: "",
    postBriefs: "",
    selectedKolIds: [],
    status: "draft",
    targetFollowerTier: "micro",
    targetKolCount: 0,
  };
}

export const Route = createFileRoute("/campaigns")({
  component: RouteComponent,
});

function RouteComponent() {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState<CampaignFormState>(getDefaultForm());
  const campaignsQuery = useQuery(orpc.campaign.list.queryOptions());
  const kolsQuery = useQuery(orpc.kol.list.queryOptions());
  const campaigns = (campaignsQuery.data as CampaignRecord[] | undefined) ?? [];
  const kols = (kolsQuery.data as KolRecord[] | undefined) ?? [];

  const createCampaign = useMutation({
    mutationFn: (input: CampaignFormState) => client.campaign.create(input),
    onSuccess: () => {
      toast.success("Campaign berhasil dibuat");
      campaignsQuery.refetch();
      resetForm();
    },
  });

  const updateCampaign = useMutation({
    mutationFn: (input: CampaignFormState & { id: number }) => client.campaign.update(input),
    onSuccess: () => {
      toast.success("Campaign berhasil diperbarui");
      campaignsQuery.refetch();
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

  function editCampaign(campaign: CampaignRecord) {
    setEditingId(campaign.id);
    setForm({
      brand: campaign.brand,
      description: campaign.description,
      keywords: campaign.keywords,
      name: campaign.name,
      objective: campaign.objective,
      periodEnd: campaign.periodEnd,
      periodStart: campaign.periodStart,
      postBriefs: campaign.postBriefs,
      selectedKolIds: campaign.kols.map((kol) => kol.id),
      status: campaign.status,
      targetFollowerTier: campaign.targetFollowerTier,
      targetKolCount: campaign.targetKolCount,
    });
    setIsDialogOpen(true);
  }

  function submit() {
    if (editingId) {
      updateCampaign.mutate({ id: editingId, ...form });
      return;
    }

    createCampaign.mutate(form);
  }

  return (
    <>
      <div className="container mx-auto space-y-6 px-4 py-6">
        <section className="bg-card ring-foreground/10 space-y-4 p-4 ring-1">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">Campaigns</p>
              <h1 className="text-2xl font-semibold">Daftar campaign</h1>
              <p className="text-muted-foreground">
                Halaman ini berisi list campaign. Tambah dan edit dilakukan lewat dialog.
              </p>
            </div>
            <Button type="button" onClick={openCreateDialog}>
              <Plus className="mr-2 size-4" />
              Tambah campaign
            </Button>
          </div>

          <div className="space-y-3">
            {campaigns.map((campaign) => (
              <article key={campaign.id} className="border-border space-y-3 border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{campaign.name}</p>
                    <p className="text-muted-foreground text-sm">{campaign.brand}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => editCampaign(campaign)}>
                    <PencilLine className="mr-1 size-4" />
                    Edit
                  </Button>
                </div>
                <p className="text-muted-foreground text-sm">{campaign.description}</p>
                <div className="text-muted-foreground grid gap-1 text-sm md:grid-cols-2">
                  <p>Periode: {campaign.periodStart} → {campaign.periodEnd}</p>
                  <p>Status: {campaign.status}</p>
                  <p>Target KOL: {campaign.targetKolCount}</p>
                  <p>Follower tier: {campaign.targetFollowerTier || "-"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {campaign.kols.map((kol) => (
                    <span key={kol.id} className="border-border text-muted-foreground border px-2 py-1 text-xs">
                      {kol.displayName}
                      {kol.handles.length ? ` • ${kol.handles.join(" / ")}` : ""}
                    </span>
                  ))}
                  {!campaign.kols.length && (
                    <span className="text-muted-foreground text-xs">Belum ada KOL yang dipilih.</span>
                  )}
                </div>
              </article>
            ))}

            {!campaigns.length && (
              <p className="text-muted-foreground text-sm">Belum ada campaign yang dibuat.</p>
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
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit campaign" : "Tambah campaign"}</DialogTitle>
            <DialogDescription>
              Isi brief dan pilih KOL yang masuk shortlist.
            </DialogDescription>
          </DialogHeader>

          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <FormInput
                label="Nama campaign"
                value={form.name}
                onChange={(value) => setForm((current) => ({ ...current, name: value }))}
              />
              <FormInput
                label="Brand"
                value={form.brand}
                onChange={(value) => setForm((current) => ({ ...current, brand: value }))}
              />
              <DateInput
                label="Periode mulai"
                value={form.periodStart}
                onChange={(value) => setForm((current) => ({ ...current, periodStart: value }))}
              />
              <DateInput
                label="Periode selesai"
                value={form.periodEnd}
                onChange={(value) => setForm((current) => ({ ...current, periodEnd: value }))}
              />
              <FormInput
                label="Target follower tier"
                value={form.targetFollowerTier}
                onChange={(value) => setForm((current) => ({ ...current, targetFollowerTier: value }))}
                placeholder="micro, nano, macro"
              />
              <NumberInput
                label="Jumlah KOL"
                value={form.targetKolCount}
                onChange={(value) => setForm((current) => ({ ...current, targetKolCount: value }))}
              />
              <label className="grid gap-2 text-sm md:col-span-2">
                <span>Status</span>
                <select
                  className="border-border bg-background min-h-10 border px-3"
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as CampaignFormState["status"],
                    }))
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
            </div>

            <FormTextarea
              label="Deskripsi"
              value={form.description}
              onChange={(value) => setForm((current) => ({ ...current, description: value }))}
            />
            <FormTextarea
              label="Objektif"
              value={form.objective}
              onChange={(value) => setForm((current) => ({ ...current, objective: value }))}
              placeholder="Contoh: jumlah likes, reach, atau sales"
            />
            <FormTextarea
              label="Tags / keyword"
              value={form.keywords}
              onChange={(value) => setForm((current) => ({ ...current, keywords: value }))}
              placeholder="Pisahkan dengan koma"
            />
            <FormTextarea
              label="Post brief campaign"
              value={form.postBriefs}
              onChange={(value) => setForm((current) => ({ ...current, postBriefs: value }))}
              placeholder="Satu brief per baris"
            />

            <div className="grid gap-2 text-sm">
              <span>Pilih KOL untuk campaign ini</span>
              <div className="border-border grid max-h-64 gap-2 overflow-auto border p-3">
                {kols.map((kol) => {
                  const checked = form.selectedKolIds.includes(kol.id);

                  return (
                    <label key={kol.id} className="flex items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          setForm((current) => ({
                            ...current,
                            selectedKolIds: event.target.checked
                              ? [...current.selectedKolIds, kol.id]
                              : current.selectedKolIds.filter((id) => id !== kol.id),
                          }));
                        }}
                      />
                      <span>
                        <strong>{kol.displayName}</strong>
                        <span className="block">
                          {kol.accounts
                            .map((account) => `${account.platform}: @${account.handle}`)
                            .join(" • ")}
                        </span>
                        <span className="text-muted-foreground block">{kol.fieldOfExpertise}</span>
                      </span>
                    </label>
                  );
                })}

                {!kols.length && (
                  <p className="text-muted-foreground">Belum ada KOL. Tambah dulu di halaman KOL.</p>
                )}
              </div>
            </div>

            <DialogFooter>
              {editingId && (
                <Button type="button" variant="outline" onClick={resetForm}>
                  Batal edit
                </Button>
              )}
              <Button type="submit" disabled={createCampaign.isPending || updateCampaign.isPending}>
                {editingId
                  ? updateCampaign.isPending
                    ? "Menyimpan perubahan..."
                    : "Update campaign"
                  : createCampaign.isPending
                    ? "Membuat campaign..."
                    : "Buat campaign"}
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
    <label className="grid gap-2 text-sm">
      <span>{label}</span>
      <input
        className="border-border bg-background min-h-10 border px-3"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={!placeholder}
      />
    </label>
  );
}

function DateInput({
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
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </label>
  );
}

function NumberInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span>{label}</span>
      <input
        className="border-border bg-background min-h-10 border px-3"
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
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
    <label className="grid gap-2 text-sm">
      <span>{label}</span>
      <textarea
        className="border-border bg-background min-h-24 border px-3 py-2"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

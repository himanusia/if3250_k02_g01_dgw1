import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PencilLine } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { orpc } from "@/utils/orpc";

type CampaignRecord = {
  brand: string;
  createdAt: string;
  description: string;
  id: number;
  keywords: string;
  kolCategory: string;
  kolTargetCount: number;
  kols: Array<{ displayName: string; id: number; username: string }>;
  name: string;
  objective: string;
  periodEnd: string;
  periodStart: string;
  postBriefs: string;
  status: "draft" | "active" | "completed" | "archived";
  updatedAt: string;
};

type CampaignFormState = {
  brand: string;
  description: string;
  keywords: string;
  kolCategory: string;
  kolTargetCount: number;
  name: string;
  objective: string;
  periodEnd: string;
  periodStart: string;
  postBriefs: string;
  selectedKolIds: number[];
  status: CampaignRecord["status"];
};

function getDefaultForm(): CampaignFormState {
  return {
    brand: "",
    description: "",
    keywords: "",
    kolCategory: "micro",
    kolTargetCount: 0,
    name: "",
    objective: "",
    periodEnd: "",
    periodStart: "",
    postBriefs: "",
    selectedKolIds: [],
    status: "draft",
  };
}

export const Route = createFileRoute("/campaigns")({
  component: RouteComponent,
});

function RouteComponent() {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CampaignFormState>(getDefaultForm());
  const campaigns = useQuery(orpc.campaign.list.queryOptions());
  const kols = useQuery(orpc.kol.list.queryOptions());

  const createCampaign = useMutation(
    orpc.campaign.create.mutationOptions({
      onSuccess: () => {
        toast.success("Campaign berhasil dibuat");
        campaigns.refetch();
        resetForm();
      },
    }),
  );
  const updateCampaign = useMutation(
    orpc.campaign.update.mutationOptions({
      onSuccess: () => {
        toast.success("Campaign berhasil diperbarui");
        campaigns.refetch();
        resetForm();
      },
    }),
  );

  const resetForm = () => {
    setEditingId(null);
    setForm(getDefaultForm());
  };

  const submit = () => {
    if (editingId) {
      updateCampaign.mutate({ id: editingId, ...form });
      return;
    }

    createCampaign.mutate(form);
  };

  const editCampaign = (campaign: CampaignRecord) => {
    setEditingId(campaign.id);
    setForm({
      brand: campaign.brand,
      description: campaign.description,
      keywords: campaign.keywords,
      kolCategory: campaign.kolCategory,
      kolTargetCount: campaign.kolTargetCount,
      name: campaign.name,
      objective: campaign.objective,
      periodEnd: campaign.periodEnd,
      periodStart: campaign.periodStart,
      postBriefs: campaign.postBriefs,
      selectedKolIds: campaign.kols.map((kol) => kol.id),
      status: campaign.status,
    });
  };

  return (
    <div className="container mx-auto grid gap-6 px-4 py-6 xl:grid-cols-[1fr_0.95fr]">
      <section className="bg-card ring-foreground/10 space-y-4 p-4 ring-1">
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">Campaign planner</p>
          <h1 className="text-2xl font-semibold">Buat / edit campaign</h1>
          <p className="text-muted-foreground">
            Isi nama, deskripsi, periode, brand, objektif, keyword, target KOL, lalu pilih akun yang
            masuk shortlist.
          </p>
        </div>

        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FormInput label="Nama campaign" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
            <FormInput label="Brand" value={form.brand} onChange={(value) => setForm((current) => ({ ...current, brand: value }))} />
            <label className="grid gap-2 text-sm">
              <span>Periode mulai</span>
              <input
                className="border-border bg-background min-h-10 border px-3"
                type="date"
                value={form.periodStart}
                onChange={(event) => setForm((current) => ({ ...current, periodStart: event.target.value }))}
                required
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Periode selesai</span>
              <input
                className="border-border bg-background min-h-10 border px-3"
                type="date"
                value={form.periodEnd}
                onChange={(event) => setForm((current) => ({ ...current, periodEnd: event.target.value }))}
                required
              />
            </label>
            <FormInput label="Target kategori KOL" value={form.kolCategory} onChange={(value) => setForm((current) => ({ ...current, kolCategory: value }))} placeholder="micro, nano, dll" />
            <label className="grid gap-2 text-sm">
              <span>Jumlah KOL</span>
              <input
                className="border-border bg-background min-h-10 border px-3"
                type="number"
                min={0}
                value={form.kolTargetCount}
                onChange={(event) => setForm((current) => ({ ...current, kolTargetCount: Number(event.target.value) }))}
              />
            </label>
            <label className="grid gap-2 text-sm md:col-span-2">
              <span>Status</span>
              <select
                className="border-border bg-background min-h-10 border px-3"
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as CampaignFormState["status"] }))}
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>

          <FormTextarea label="Deskripsi" value={form.description} onChange={(value) => setForm((current) => ({ ...current, description: value }))} />
          <FormTextarea label="Objektif" value={form.objective} onChange={(value) => setForm((current) => ({ ...current, objective: value }))} placeholder="Contoh: jumlah likes, reach, atau sales" />
          <FormTextarea label="Tags / keyword" value={form.keywords} onChange={(value) => setForm((current) => ({ ...current, keywords: value }))} placeholder="Pisahkan dengan koma" />
          <FormTextarea label="Post brief campaign" value={form.postBriefs} onChange={(value) => setForm((current) => ({ ...current, postBriefs: value }))} placeholder="Satu brief per baris" />

          <div className="grid gap-2 text-sm">
            <span>Pilih KOL untuk campaign ini</span>
            <div className="border-border grid max-h-64 gap-2 overflow-auto border p-3">
              {kols.data?.map((kol) => {
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
                      <strong>{kol.displayName}</strong> @{kol.username}
                      <span className="text-muted-foreground block">{kol.fieldOfExpertise}</span>
                    </span>
                  </label>
                );
              })}

              {!kols.data?.length && (
                <p className="text-muted-foreground">Belum ada akun KOL. Tambah dulu di halaman KOL DB.</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={createCampaign.isPending || updateCampaign.isPending}>
              {editingId
                ? updateCampaign.isPending
                  ? "Menyimpan perubahan..."
                  : "Update campaign"
                : createCampaign.isPending
                  ? "Membuat campaign..."
                  : "Buat campaign"}
            </Button>
            {editingId && (
              <Button type="button" variant="outline" onClick={resetForm}>
                Batal edit
              </Button>
            )}
          </div>
        </form>
      </section>

      <section className="bg-card ring-foreground/10 space-y-4 p-4 ring-1">
        <div>
          <h2 className="text-xl font-semibold">Daftar campaign</h2>
          <p className="text-muted-foreground">
            Klik edit untuk mengubah brief atau shortlist KOL yang sudah dipilih.
          </p>
        </div>

        <div className="space-y-3">
          {campaigns.data?.map((campaign) => (
            <article key={campaign.id} className="border-border space-y-3 border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{campaign.name}</p>
                  <p className="text-muted-foreground text-sm">{campaign.brand}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => editCampaign(campaign as CampaignRecord)}>
                  <PencilLine className="mr-1 size-4" />
                  Edit
                </Button>
              </div>
              <p className="text-muted-foreground text-sm">{campaign.description}</p>
              <div className="text-muted-foreground grid gap-1 text-sm md:grid-cols-2">
                <p>Periode: {campaign.periodStart} → {campaign.periodEnd}</p>
                <p>Status: {campaign.status}</p>
                <p>Target KOL: {campaign.kolTargetCount}</p>
                <p>Kategori target: {campaign.kolCategory || "-"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {campaign.kols.map((kol) => (
                  <span key={kol.id} className="border-border text-muted-foreground border px-2 py-1 text-xs">
                    {kol.displayName}
                  </span>
                ))}
                {!campaign.kols.length && (
                  <span className="text-muted-foreground text-xs">Belum ada KOL yang dipilih.</span>
                )}
              </div>
            </article>
          ))}

          {!campaigns.data?.length && (
            <p className="text-muted-foreground text-sm">Belum ada campaign yang dibuat.</p>
          )}
        </div>
      </section>
    </div>
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

import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import type { KolRecord } from "@/lib/app-types";

import { Button } from "@/components/ui/button";
import { client, orpc } from "@/utils/orpc";

type KolFormState = {
  analyticsNotes: string;
  averageLikes: number;
  averageViews: number;
  bio: string;
  campaignHistory: string;
  category: string;
  displayName: string;
  engagementRate: string;
  estimatedRateCard: number;
  fieldOfExpertise: string;
  followers: number;
  keywords: string;
  platformLinks: string;
  primaryPlatform: "tiktok" | "instagram" | "youtube" | "shopee" | "other";
  salesNotes: string;
  username: string;
};

function getDefaultForm(): KolFormState {
  return {
    analyticsNotes: "",
    averageLikes: 0,
    averageViews: 0,
    bio: "",
    campaignHistory: "",
    category: "micro",
    displayName: "",
    engagementRate: "",
    estimatedRateCard: 0,
    fieldOfExpertise: "",
    followers: 0,
    keywords: "",
    platformLinks: "",
    primaryPlatform: "instagram",
    salesNotes: "",
    username: "",
  };
}

export const Route = createFileRoute("/kols")({
  component: RouteComponent,
});

function RouteComponent() {
  const [form, setForm] = useState<KolFormState>(getDefaultForm());
  const kolQuery = useQuery(orpc.kol.list.queryOptions());
  const kols = (kolQuery.data as KolRecord[] | undefined) ?? [];
  const createKol = useMutation({
    mutationFn: (input: KolFormState) => client.kol.create(input),
    onSuccess: () => {
      toast.success("KOL berhasil ditambahkan ke database");
      kolQuery.refetch();
      setForm(getDefaultForm());
    },
  });

  return (
    <div className="container mx-auto grid gap-6 px-4 py-6 lg:grid-cols-[0.95fr_1.05fr]">
      <section className="bg-card ring-foreground/10 space-y-4 p-4 ring-1">
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">KOL database</p>
          <h1 className="text-2xl font-semibold">Masukkan akun KOL ke database</h1>
          <p className="text-muted-foreground">
            Simpan link platform, keywords, followers, metrik engagement, sampai catatan sales dan
            campaign history.
          </p>
        </div>

        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            createKol.mutate(form);
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FormInput label="Display name" value={form.displayName} onChange={(value) => setForm((current) => ({ ...current, displayName: value }))} />
            <FormInput label="Username" value={form.username} onChange={(value) => setForm((current) => ({ ...current, username: value }))} />
            <FormInput label="Bidang" value={form.fieldOfExpertise} onChange={(value) => setForm((current) => ({ ...current, fieldOfExpertise: value }))} placeholder="Pet care, beauty, gaming" />
            <FormInput label="Kategori KOL" value={form.category} onChange={(value) => setForm((current) => ({ ...current, category: value }))} placeholder="Nano, micro, macro" />
            <label className="grid gap-2 text-sm">
              <span>Platform utama</span>
              <select
                className="border-border bg-background min-h-10 border px-3"
                value={form.primaryPlatform}
                onChange={(event) => setForm((current) => ({ ...current, primaryPlatform: event.target.value as KolFormState["primaryPlatform"] }))}
              >
                <option value="instagram">Instagram</option>
                <option value="tiktok">TikTok</option>
                <option value="youtube">YouTube</option>
                <option value="shopee">Shopee</option>
                <option value="other">Other</option>
              </select>
            </label>
            <FormInput label="Engagement rate" value={form.engagementRate} onChange={(value) => setForm((current) => ({ ...current, engagementRate: value }))} placeholder="Contoh: 4.7%" />
            <FormNumberInput label="Followers" value={form.followers} onChange={(value) => setForm((current) => ({ ...current, followers: value }))} />
            <FormNumberInput label="Average likes" value={form.averageLikes} onChange={(value) => setForm((current) => ({ ...current, averageLikes: value }))} />
            <FormNumberInput label="Average views" value={form.averageViews} onChange={(value) => setForm((current) => ({ ...current, averageViews: value }))} />
            <FormNumberInput label="Estimasi rate card" value={form.estimatedRateCard} onChange={(value) => setForm((current) => ({ ...current, estimatedRateCard: value }))} />
          </div>

          <FormTextarea label="Bio / deskripsi singkat" value={form.bio} onChange={(value) => setForm((current) => ({ ...current, bio: value }))} />
          <FormTextarea label="Link platform" value={form.platformLinks} onChange={(value) => setForm((current) => ({ ...current, platformLinks: value }))} placeholder="Satu baris per link/platform" />
          <FormTextarea label="Keyword / tags" value={form.keywords} onChange={(value) => setForm((current) => ({ ...current, keywords: value }))} placeholder="Pisahkan dengan koma" />
          <FormTextarea label="Analytics notes" value={form.analyticsNotes} onChange={(value) => setForm((current) => ({ ...current, analyticsNotes: value }))} />
          <FormTextarea label="Sales notes" value={form.salesNotes} onChange={(value) => setForm((current) => ({ ...current, salesNotes: value }))} />
          <FormTextarea label="Campaign history" value={form.campaignHistory} onChange={(value) => setForm((current) => ({ ...current, campaignHistory: value }))} />

          <Button type="submit" disabled={createKol.isPending}>
            {createKol.isPending ? "Menyimpan..." : "Simpan akun KOL"}
          </Button>
        </form>
      </section>

      <section className="bg-card ring-foreground/10 space-y-4 p-4 ring-1">
        <div>
          <h2 className="text-xl font-semibold">Akun yang sudah tersimpan</h2>
          <p className="text-muted-foreground">Data ini bisa dipakai lagi di halaman compare dan campaign.</p>
        </div>

        <div className="space-y-3">
          {kols.map((kol) => (
            <div key={kol.id} className="border-border space-y-2 border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{kol.displayName}</p>
                  <p className="text-muted-foreground text-sm">@{kol.username}</p>
                </div>
                <p className="text-muted-foreground text-sm">{kol.primaryPlatform}</p>
              </div>
              <div className="text-muted-foreground grid gap-1 text-sm md:grid-cols-2">
                <p>Bidang: {kol.fieldOfExpertise}</p>
                <p>Kategori: {kol.category}</p>
                <p>Followers: {kol.followers.toLocaleString()}</p>
                <p>ER: {kol.engagementRate || "-"}</p>
              </div>
              {kol.keywords && <p className="text-muted-foreground text-sm">Keywords: {kol.keywords}</p>}
            </div>
          ))}

          {!kols.length && (
            <p className="text-muted-foreground text-sm">Belum ada akun KOL di database.</p>
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

function FormNumberInput({
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

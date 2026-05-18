import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, ExternalLink, PencilLine, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";

import type { CampaignContentRecord, CampaignDetailRecord, CampaignRecord, KolRecord } from "@/lib/app-types";
import { formatDateTime, formatNumber } from "@/lib/kol-utils";

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

type ContentFormRow = {
  contentUrl: string;
  id: string;
  kolId: number | "";
};

function createEmptyContentRow(): ContentFormRow {
  const randomId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    contentUrl: "",
    id: randomId,
    kolId: "",
  };
}

function getDefaultContentRows() {
  return [createEmptyContentRow()];
}

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
  const [detailCampaignId, setDetailCampaignId] = useState<number | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [addContentCampaignId, setAddContentCampaignId] = useState<number | null>(null);
  const [isAddContentDialogOpen, setIsAddContentDialogOpen] = useState(false);
  const [syncingContentId, setSyncingContentId] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [campaignSearch, setCampaignSearch] = useState("");
  const [debouncedCampaignSearch, setDebouncedCampaignSearch] = useState("");
  const [form, setForm] = useState<CampaignFormState>(getDefaultForm());
  const [contentRows, setContentRows] = useState<ContentFormRow[]>(getDefaultContentRows());
  const [kolSearch, setKolSearch] = useState("");
  const [selectedKeywordFilter, setSelectedKeywordFilter] = useState<string[]>([]);
  const campaignsQuery = useQuery(orpc.campaign.list.queryOptions());
  const kolsQuery = useQuery(orpc.kol.list.queryOptions());
  const detailCampaignQuery = useQuery({
    ...orpc.campaign.getById.queryOptions({ input: { id: detailCampaignId ?? 0 } }),
    enabled: isDetailDialogOpen && detailCampaignId !== null,
  });
  const campaigns = (campaignsQuery.data as CampaignRecord[] | undefined) ?? [];
  const kols = (kolsQuery.data as KolRecord[] | undefined) ?? [];
  const detailCampaignData = (detailCampaignQuery.data as CampaignDetailRecord | null | undefined) ?? null;
  const campaignReportUrl = detailCampaignId !== null ? `/api/rpc/campaign-report?campaignId=${detailCampaignId}` : "";

  const addContentCampaign = useMemo(() => {
    if (addContentCampaignId === null) {
      return null;
    }

    if (detailCampaignData?.id === addContentCampaignId) {
      return detailCampaignData;
    }

    return campaigns.find((campaign) => campaign.id === addContentCampaignId) ?? null;
  }, [addContentCampaignId, campaigns, detailCampaignData]);

  const detailCampaignSummary = useMemo(() => {
    if (detailCampaignId === null) {
      return null;
    }

    return campaigns.find((campaign) => campaign.id === detailCampaignId) ?? null;
  }, [campaigns, detailCampaignId]);

  useEffect(() => {
      document.documentElement.classList.add("digiTheme");
      document.body.classList.add("digiTheme");
  
      return () => {
        document.documentElement.classList.remove("digiTheme");
        document.body.classList.remove("digiTheme");
      };
    }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedCampaignSearch(campaignSearch.trim().toLowerCase());
    }, 250);

    return () => {
      clearTimeout(handler);
    };
  }, [campaignSearch]);
    
  const filteredKols = useMemo(() => {
  return kols.filter((kol) => {
    const normalizedSearch = kolSearch.trim().toLowerCase();
    const matchesSearch =
      !normalizedSearch ||
      kol.displayName.toLowerCase().includes(normalizedSearch);

    const matchesKeywords =
      selectedKeywordFilter.length === 0 ||
      selectedKeywordFilter.some((keyword) =>
        kol.keywords.toLowerCase().includes(keyword.toLowerCase())
      );

    return matchesSearch && matchesKeywords;
  });
}, [kols, kolSearch, selectedKeywordFilter]);

  const filteredCampaigns = useMemo(() => {
    if (!debouncedCampaignSearch) {
      return campaigns;
    }

    return campaigns.filter((campaign) => {
      const haystack = [
        campaign.name,
        campaign.brand,
        campaign.keywords,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(debouncedCampaignSearch);
    });
  }, [campaigns, debouncedCampaignSearch]);

  const addContent = useMutation({
    mutationFn: (input: { campaignId: number; contents: Array<{ contentUrl: string; kolId: number }> }) =>
      client.campaign.addContent(input),
    onSuccess: (campaignDetail, variables) => {
      if (!campaignDetail) {
        toast.error("Konten tersimpan, tetapi detail campaign tidak dapat dimuat.");
        setIsAddContentDialogOpen(false);
        setAddContentCampaignId(null);
        setContentRows(getDefaultContentRows());
        return;
      }

      const failedCount = campaignDetail.contentsByKol
        .flatMap((group) => group.contents)
        .filter((content: CampaignContentRecord) => content.syncStatus === "failed").length;

      if (failedCount > 0) {
        toast.error(`Konten tersimpan, tetapi ${failedCount} post gagal di-scrap`);
      } else {
        toast.success("Konten berhasil disimpan dan di-scrap");
      }

      setIsAddContentDialogOpen(false);
      setAddContentCampaignId(null);
      setContentRows(getDefaultContentRows());
      setDetailCampaignId(variables.campaignId);
      setIsDetailDialogOpen(true);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal menambahkan konten");
    },
  });

  const syncContent = useMutation({
    mutationFn: ({ id }: { id: number }) => client.campaign.syncContent({ id }),
    onSuccess: (content) => {
      if (content.syncStatus === "failed") {
        toast.error(content.syncMessage || "Konten gagal di-scrap");
      } else {
        toast.success("Konten berhasil di-scrap");
      }

      if (detailCampaignQuery.isFetched) {
        detailCampaignQuery.refetch();
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal melakukan sync konten");
    },
  });

  const deleteContent = useMutation({
    mutationFn: ({ id }: { id: number }) => client.campaign.deleteContent({ id }),
    onSuccess: () => {
      toast.success("Konten berhasil dihapus");

      if (detailCampaignQuery.isFetched) {
        detailCampaignQuery.refetch();
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal menghapus konten");
    },
  });

  const allKeywords = useMemo(() => {
    return Array.from(
      new Set(
        kols
          .flatMap((kol) => kol.keywords.split(",").map((k) => k.trim()))
          .filter(Boolean)
      )
    ).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
  }, [kols]);

  const createCampaign = useMutation({
    mutationFn: (input: CampaignFormState) => client.campaign.create(input),
    onSuccess: () => {
      toast.success("Campaign berhasil dibuat");
      campaignsQuery.refetch();
      resetForm();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal membuat campaign");
    },
  });


  const updateCampaign = useMutation({
    mutationFn: (input: CampaignFormState & { id: number }) => client.campaign.update(input),
    onSuccess: () => {
      toast.success("Campaign berhasil diperbarui");
      campaignsQuery.refetch();
      resetForm();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal memperbarui campaign");
    },
  });

  const deleteCampaign = useMutation({
    mutationFn: ({ id }: { id: number }) => client.campaign.delete({ id }),
    onSuccess: () => {
      toast.success("Campaign berhasil dihapus");
      campaignsQuery.refetch();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal menghapus campaign");
    },
  });

  function resetForm() {
    setEditingId(null);
    setIsDialogOpen(false);
    setForm(getDefaultForm());
    setKolSearch("");
    setSelectedKeywordFilter([]);
  }

  function openCreateDialog() {
    setEditingId(null);
    setForm(getDefaultForm());
    setIsDialogOpen(true);
  }

  function openDetailDialog(campaignId: number) {
    setDetailCampaignId(campaignId);
    setIsDetailDialogOpen(true);
  }

  function closeDetailDialog() {
    setIsDetailDialogOpen(false);
    setDetailCampaignId(null);
  }

  function openAddContentDialog(campaignId: number) {
    setAddContentCampaignId(campaignId);
    setContentRows(getDefaultContentRows());
    setIsAddContentDialogOpen(true);
  }

  function closeAddContentDialog() {
    setIsAddContentDialogOpen(false);
    setAddContentCampaignId(null);
    setContentRows(getDefaultContentRows());
  }

  function updateContentRow(rowId: string, patch: Partial<ContentFormRow>) {
    setContentRows((current) => current.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  }

  function addContentRow() {
    setContentRows((current) => [...current, createEmptyContentRow()]);
  }

  function removeContentRow(rowId: string) {
    setContentRows((current) => (current.length === 1 ? current : current.filter((row) => row.id !== rowId)));
  }

  function submitAddContent() {
    if (addContentCampaignId === null) {
      toast.error("Campaign belum dipilih");
      return;
    }

    const invalidRowIndex = contentRows.findIndex((row) => !row.kolId || !row.contentUrl.trim());

    if (invalidRowIndex >= 0) {
      toast.error(`Baris ${invalidRowIndex + 1}: pilih KOL dan isi link konten.`);
      return;
    }

    addContent.mutate({
      campaignId: addContentCampaignId,
      contents: contentRows.map((row) => ({
        contentUrl: row.contentUrl.trim(),
        kolId: Number(row.kolId),
      })),
    });
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
      <div className="h-full overflow-y-auto">
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
            <Button type="button" onClick={openCreateDialog} className="hover:bg-primary-hover">
              <Plus className="mr-2 size-4" />
              Tambah campaign
            </Button>
          </div>

          <div className="max-w-md">
            <FormInput
              label="Search"
              value={campaignSearch}
              onChange={setCampaignSearch}
              placeholder="Cari Nama campaign, brand, keyword"
            />
          </div>

          <div className="space-y-3">
            {filteredCampaigns.map((campaign) => (
              <article key={campaign.id} className="border-border space-y-3 border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{campaign.name}</p>
                    <p className="text-muted-foreground text-sm">{campaign.brand}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openDetailDialog(campaign.id)}>
                      <ExternalLink className="mr-1 size-4" />
                      Detail
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!campaign.kols.length}
                      onClick={() => openAddContentDialog(campaign.id)}
                    >
                      <Plus className="mr-1 size-4" />
                      Add content
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => editCampaign(campaign)}>
                      <PencilLine className="mr-1 size-4" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={deleteCampaign.isPending}
                      onClick={() => {
                        if (window.confirm("Apakah Anda yakin ingin menghapus campaign ini?")) {
                          deleteCampaign.mutate({ id: campaign.id });
                        }
                      }}
                    >
                      <Trash2 className="mr-1 size-4" />
                      Hapus
                    </Button>
                  </div>
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

            {!filteredCampaigns.length && (
              <p className="text-muted-foreground text-sm">Belum ada campaign yang dibuat.</p>
            )}
          </div>
          </section>
        </div>
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
              <DialogTitle>{editingId ? "Edit campaign" : "Tambah campaign"}</DialogTitle>
              <DialogDescription>
                Isi brief dan pilih KOL yang masuk shortlist.
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
              <Label className="grid gap-2 md:col-span-2">
                <span>Status</span>
                <select
                  className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 min-h-10 w-full min-w-0 rounded-none border px-3 text-xs outline-none focus-visible:ring-1"
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
              </Label>
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

            <div className="grid gap-2">
              <Label>Pilih KOL untuk campaign ini</Label>
              
              <div className="space-y-3">
                <Input
                  placeholder="Cari KOL berdasarkan nama, keyword, atau handle"
                  value={kolSearch}
                  onChange={(event) => setKolSearch(event.target.value)}
                />

                {allKeywords.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Filter by keyword</p>
                    <div className="flex flex-wrap gap-2">
                      {allKeywords.map((keyword) => (
                        <button
                          key={keyword}
                          type="button"
                          onClick={() => {
                            setSelectedKeywordFilter((current) =>
                              current.includes(keyword)
                                ? current.filter((k) => k !== keyword)
                                : [...current, keyword]
                            );
                          }}
                          className={`
                            border px-2 py-1 text-xs transition-colors
                            ${
                              selectedKeywordFilter.includes(keyword)
                                ? "border-foreground bg-primary text-background"
                                : "border-border text-muted-foreground hover:border-primary"
                            }
                          `}
                        >
                          {keyword}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-border grid max-h-64 gap-2 overflow-y-auto overflow-x-hidden border p-3">
                {filteredKols.map((kol) => {
                  const checked = form.selectedKolIds.includes(kol.id);

                  return (
                    <label key={kol.id} className="hover:bg-muted/40 flex min-w-0 items-start gap-3 p-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0"
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
                      <span className="min-w-0">
                        <strong>{kol.displayName}</strong>
                        <span className="text-muted-foreground block wrap-break-word">
                          {kol.accounts
                            .map((account) => `${account.platform}: @${account.handle}`)
                            .join(" • ")}
                        </span>
                        {kol.keywords && <span className="text-muted-foreground block">{kol.keywords}</span>}
                      </span>
                    </label>
                  );
                })}

                {!filteredKols.length && (
                  <p className="text-muted-foreground text-sm">
                    {kols.length === 0
                      ? "Belum ada KOL. Tambah dulu di halaman KOL."
                      : "Tidak ada KOL yang sesuai dengan filter."}
                  </p>
                )}
              </div>
            </div>

            <DialogFooter className="border-border border-t pt-4">
              {editingId && (
                <Button type="button" variant="outline" onClick={resetForm}>
                  Batal edit
                </Button>
              )}
              <Button type="submit" disabled={createCampaign.isPending || updateCampaign.isPending} className="hover:bg-primary-hover">
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

      <Dialog
        open={isDetailDialogOpen && detailCampaignId !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeDetailDialog();
            return;
          }

          setIsDetailDialogOpen(true);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0">
          <DialogHeader>
            <div className="border-border border-b-[1.6px] px-4 py-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <DialogTitle className="!text-[22px] !font-bold tracking-tight text-foreground">
                    Detail campaign
                  </DialogTitle>
                  <DialogDescription className="!text-xs !leading-6 text-muted-foreground">
                    Ringkasan campaign dan daftar konten yang sudah di-scrap.
                  </DialogDescription>
                </div>

                {detailCampaignId !== null && (
                  <Button
                    variant="outline"
                    size="sm"
                    render={<a href={campaignReportUrl} download={`campaign-${detailCampaignId}-report.pdf`} />}
                  >
                    <Download className="mr-1 size-4" />
                    Buat laporan PDF
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>

          {!detailCampaignSummary ? (
            <div className="px-4 pb-4 text-sm text-muted-foreground sm:px-6 sm:pb-6">
              {detailCampaignQuery.isLoading ? "Memuat detail campaign..." : "Campaign tidak ditemukan."}
            </div>
          ) : !detailCampaignData ? (
            <div className="px-4 pb-4 text-sm text-muted-foreground sm:px-6 sm:pb-6">
              Memuat detail konten campaign...
            </div>
          ) : (
            <div className="grid gap-6 px-4 pb-4 sm:px-6 sm:pb-6">
              <section className="space-y-4 border-[1.6px] border-border/70 bg-white p-4 sm:p-5">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <DetailStat boxed label="Nama campaign" value={detailCampaignSummary?.name ?? detailCampaignData?.name ?? "-"} />
                  <DetailStat boxed label="Brand" value={detailCampaignSummary?.brand ?? detailCampaignData?.brand ?? "-"} />
                  <DetailStat boxed label="Status" value={detailCampaignSummary?.status ?? detailCampaignData?.status ?? "-"} />
                  <DetailStat
                    boxed
                    label="Periode"
                    value={`${detailCampaignSummary?.periodStart ?? detailCampaignData?.periodStart ?? "-"} → ${detailCampaignSummary?.periodEnd ?? detailCampaignData?.periodEnd ?? "-"}`}
                  />
                  <DetailStat boxed label="Target KOL" value={String(detailCampaignSummary?.targetKolCount ?? detailCampaignData?.targetKolCount ?? 0)} />
                  <DetailStat boxed label="Follower tier" value={detailCampaignSummary?.targetFollowerTier ?? detailCampaignData?.targetFollowerTier ?? "-"} />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <DetailStat boxed label="Objective" value={detailCampaignSummary?.objective ?? detailCampaignData?.objective ?? "-"} />
                  <DetailStat boxed label="Keywords" value={detailCampaignSummary?.keywords ?? detailCampaignData?.keywords ?? "-"} />
                  <DetailStat boxed label="Created at" value={detailCampaignSummary?.createdAt ?? detailCampaignData?.createdAt ?? "-"} />
                  <DetailStat boxed label="Updated at" value={detailCampaignSummary?.updatedAt ?? detailCampaignData?.updatedAt ?? "-"} />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <DetailStat boxed label="Deskripsi" value={detailCampaignSummary?.description ?? detailCampaignData?.description ?? "-"} />
                  <DetailStat boxed label="Post brief" value={detailCampaignSummary?.postBriefs ?? detailCampaignData?.postBriefs ?? "-"} />
                </div>
              </section>

              <section className="space-y-3">
                <div>
                  <h3 className="text-[15px] font-semibold text-foreground">Konten campaign</h3>
                  <p className="text-xs text-muted-foreground">
                    Konten dikelompokkan per KOL. Sync dan hapus dilakukan pada tiap item konten.
                  </p>
                </div>

                {detailCampaignData.contentsByKol.length ? (
                  <div className="space-y-4">
                    {detailCampaignData.contentsByKol.map((group) => (
                      <article key={group.kolId} className="border-[1.6px] border-border/70 bg-white p-4 sm:p-5">
                        <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-[18px] font-semibold leading-none text-foreground">{group.displayName}</p>
                            <p className="text-[13px] text-muted-foreground">
                              {group.handles.length ? group.handles.join(" / ") : "Tidak ada handle yang tersimpan."}
                            </p>
                          </div>
                          <span className="border border-border bg-[#F8EAED] px-2 py-1 text-xs text-[#6D3A44]">
                            {group.contents.length} konten
                          </span>
                        </div>

                        <div className="space-y-3">
                          {group.contents.map((content) => (
                            <article key={content.id} className="border-[1.6px] border-border/70 bg-[#FFF5F7] space-y-3 p-3 sm:p-4">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 space-y-1">
                                        {(() => {
                                          const isSyncingThisContent = syncingContentId === content.id;

                                          return (
                                            <div className="flex flex-wrap items-center gap-2">
                                              <span className="border-border text-muted-foreground border px-2 py-0.5 text-[11px] uppercase tracking-[0.2em]">
                                                {content.platform}
                                              </span>
                                              <span
                                                className={`border px-2 py-0.5 text-[11px] uppercase tracking-[0.2em] ${
                                                  isSyncingThisContent
                                                    ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                                                    : content.syncStatus === "success"
                                                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                                                      : content.syncStatus === "failed"
                                                        ? "border-red-500/40 bg-red-500/10 text-red-300"
                                                        : "border-amber-500/40 bg-amber-500/10 text-amber-300"
                                                }`}
                                              >
                                                {isSyncingThisContent ? "sync in progress..." : content.syncStatus}
                                              </span>
                                            </div>
                                          );
                                        })()}

                                  <a
                                    className="text-primary break-all text-xs underline-offset-4 hover:underline"
                                    href={content.contentUrl}
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    {content.contentUrl}
                                  </a>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={syncContent.isPending || syncingContentId !== null}
                                    onClick={async () => {
                                      setSyncingContentId(content.id);

                                      try {
                                        await syncContent.mutateAsync({ id: content.id });
                                      } finally {
                                        setSyncingContentId((current) => (current === content.id ? null : current));
                                      }
                                    }}
                                  >
                                    <RefreshCcw className={`mr-1 size-4 ${syncingContentId === content.id ? "animate-spin" : ""}`} />
                                    {syncingContentId === content.id ? "Sync in progress..." : "Sync now"}
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    disabled={deleteContent.isPending}
                                    onClick={() => {
                                      if (window.confirm("Hapus konten ini?")) {
                                        deleteContent.mutate({ id: content.id });
                                      }
                                    }}
                                  >
                                    <Trash2 className="mr-1 size-4" />
                                    Hapus
                                  </Button>
                                </div>
                              </div>

                              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4 text-[6px]">
                                <DetailStat boxed compact label="Likes" value={formatNumber(content.likeCount)} />
                                <DetailStat boxed compact label="Views" value={formatNumber(content.viewCount)} />
                                <DetailStat boxed compact label="Comments" value={formatNumber(content.commentCount)} />
                                <DetailStat boxed compact label="Shares" value={formatNumber(content.shareCount)} />
                              </div>

                              <div className="grid gap-2 text-sm md:grid-cols-2">
                                <DetailStat label="Posted at" value={formatDateTime(content.postedAt)} compact />
                                <DetailStat label="Synced at" value={formatDateTime(content.syncedAt)} compact />
                                <DetailStat label="Author" value={content.authorDisplayName || content.authorHandle || "-"} compact />
                                <DetailStat label="Engagement rate" value={content.engagementRate || "-"} compact />
                              </div>

                              {content.caption && <p className="text-sm text-foreground/90">{content.caption}</p>}
                              {content.syncMessage && (
                                <p className={`text-sm ${content.syncStatus === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
                                  {content.syncMessage}
                                  {content.syncErrorCode ? ` (${content.syncErrorCode})` : ""}
                                </p>
                              )}
                            </article>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">Belum ada konten yang di-scrap untuk campaign ini.</p>
                )}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={isAddContentDialogOpen && addContentCampaignId !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeAddContentDialog();
            return;
          }

          setIsAddContentDialogOpen(true);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto p-0">
          <DialogHeader>
            <div className="border-border border-b px-4 py-4 sm:px-6">
              <DialogTitle>Tambah content</DialogTitle>
              <DialogDescription>
                Masukkan link konten per baris, lalu scrap post untuk menyimpan dan mengambil metriknya.
              </DialogDescription>
            </div>
          </DialogHeader>

          {!addContentCampaign ? (
            <div className="px-4 pb-4 text-sm text-muted-foreground sm:px-6 sm:pb-6">
              Campaign tidak ditemukan.
            </div>
          ) : !addContentCampaign.kols.length ? (
            <div className="px-4 pb-4 text-sm text-muted-foreground sm:px-6 sm:pb-6">
              Campaign ini belum punya KOL. Tambahkan KOL terlebih dahulu sebelum menambah konten.
            </div>
          ) : (
            <form
              className="grid gap-5 px-4 pb-4 sm:px-6 sm:pb-6"
              onSubmit={(event) => {
                event.preventDefault();
                submitAddContent();
              }}
            >
              <div className="grid gap-3 md:grid-cols-2">
                <DetailStat label="Campaign" value={addContentCampaign.name} />
                <DetailStat label="Brand" value={addContentCampaign.brand} />
                <DetailStat label="Periode" value={`${addContentCampaign.periodStart} → ${addContentCampaign.periodEnd}`} />
                <DetailStat label="KOL terpilih" value={String(addContentCampaign.kols.length)} />
              </div>

              <div className="space-y-3">
                {contentRows.map((row, index) => (
                  <div key={row.id} className="grid gap-3 rounded-none border border-border p-3 md:grid-cols-[240px_minmax(0,1fr)_auto] md:items-end">
                    <Label className="grid gap-2">
                      <span>KOL</span>
                      <select
                        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 min-h-10 w-full min-w-0 rounded-none border px-3 text-xs outline-none focus-visible:ring-1"
                        value={row.kolId}
                        onChange={(event) =>
                          updateContentRow(row.id, { kolId: event.target.value ? Number(event.target.value) : "" })
                        }
                      >
                        <option value="">Pilih KOL</option>
                        {addContentCampaign.kols.map((kol) => (
                          <option key={kol.id} value={kol.id}>
                            {kol.displayName}
                          </option>
                        ))}
                      </select>
                    </Label>

                    <Label className="grid gap-2">
                      <span>Link konten</span>
                      <Input
                        placeholder="https://..."
                        value={row.contentUrl}
                        onChange={(event) => updateContentRow(row.id, { contentUrl: event.target.value })}
                      />
                    </Label>

                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={contentRows.length === 1}
                      onClick={() => removeContentRow(row.id)}
                    >
                      Hapus
                    </Button>

                    <div className="md:col-span-3">
                      <p className="text-muted-foreground text-[11px] uppercase tracking-[0.2em]">Baris {index + 1}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={addContentRow}>
                  <Plus className="mr-1 size-4" />
                  Tambah link
                </Button>
              </div>

              <DialogFooter className="border-border border-t pt-4">
                <Button type="button" variant="outline" onClick={closeAddContentDialog}>
                  Batal
                </Button>
                <Button type="submit" disabled={addContent.isPending} className="hover:bg-primary-hover">
                  {addContent.isPending ? "Scraping..." : "Scrap Post"}
                </Button>
              </DialogFooter>
            </form>
          )}
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
    <Label className="grid gap-2">
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
    <Label className="grid gap-2">
      <span>{label}</span>
      <Input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </Label>
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
    <Label className="grid gap-2">
      <span>{label}</span>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
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

function DetailStat({
  compact = false,
  boxed = false,
  label,
  value,
}: {
  compact?: boolean;
  boxed?: boolean;
  label: string;
  value: string;
}) {
  const labelClassName = boxed
    ? "text-[13px] uppercase tracking-[0.22em] text-[#982E41]"
    : "text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground";

  const valueClassName = boxed
    ? compact
      ? "text-[17px] font-[500] leading-none tracking-[0.04em] text-foreground"
      : "text-sm font-medium text-foreground"
    : compact
      ? "text-xs text-foreground"
      : "text-sm text-foreground";

  return (
    <div
      className={`${compact ? "space-y-0.5" : "space-y-1"} ${boxed ? "border-[1.6px] border-border/80 bg-white/70 px-3 py-2" : ""}`}
    >
      <p className={labelClassName}>{label}</p>
      <p className={`${valueClassName} break-words whitespace-pre-line`}>
        {value}
      </p>
    </div>
  );
}

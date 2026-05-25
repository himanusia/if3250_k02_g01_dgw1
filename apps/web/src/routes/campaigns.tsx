import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Archive, ArchiveRestore, CalendarIcon, ChevronDown, Download, Loader2, PencilLine, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";

import type { CampaignContentRecord, CampaignDashboardRecord, CampaignDetailRecord, CampaignRecord, KolRecord } from "@/lib/app-types";
import { splitCampaignContentsByArchiveState } from "@/lib/campaign-content-archive";
import { encodeCampaignObjective, formatObjectiveDetails, formatObjectiveSummary, getProgressPercent, getTargetInteractions, parseCampaignObjective } from "@/lib/campaign-objective";
import { formatDateTime, formatNumber } from "@/lib/kol-utils";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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

function toDateInputValue(date: Date | undefined) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function fromDateInputValue(value: string) {
  if (!value) {
    return undefined;
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatShortDate(value: string) {
  if (!value) {
    return "Pilih tanggal";
  }

  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}


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
    targetFollowerTier: "",
    targetKolCount: 0,
  };
}


const TARGET_KOL_TIERS = [
  { key: "nano", label: "Nano" },
  { key: "micro", label: "Micro" },
  { key: "macro", label: "Macro" },
  { key: "mega", label: "Mega" },
] as const;

type TargetKolTier = { count: number; tier: string };
type MetricTarget = { actual: number; isFallback: boolean; label: string; percent: number; target: number };

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function formatHumanDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "long", year: "numeric" }).format(date);
}

function formatHumanDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function getCampaignTemporalStatus(periodStart: string, periodEnd: string): CampaignRecord["status"] {
  const start = fromDateInputValue(periodStart);
  const end = fromDateInputValue(periodEnd);
  const now = new Date();

  if (!start || !end) return "draft";
  if (now < start) return "draft";
  if (now > end) return "completed";
  return "active";
}

function formatCampaignStatus(status: CampaignRecord["status"]) {
  const labels: Record<CampaignRecord["status"], string> = {
    active: "Berjalan",
    archived: "Diarsipkan",
    completed: "Selesai",
    draft: "Belum mulai",
  };

  return labels[status];
}

function parseTargetKolTiers(value: string | null | undefined): TargetKolTier[] {
  const result = new Map<TargetKolTier["tier"], number>(TARGET_KOL_TIERS.map((tier) => [tier.key, 0]));
  const validTiers = new Set<TargetKolTier["tier"]>(TARGET_KOL_TIERS.map((tier) => tier.key));
  const text = value?.trim() ?? "";

  if (!text) {
    result.set("nano", 15);
    result.set("micro", 5);
    return Array.from(result, ([tier, count]) => ({ tier, count })).filter((item) => item.count > 0);
  }

  for (const part of text.split(/[\n,;]+/)) {
    const match = part.trim().match(/^([a-zA-Z]+)\s*[:=]?\s*(\d+)/);
    if (!match) continue;
    const tier = match[1]!.toLowerCase() as TargetKolTier["tier"];
    const count = Number(match[2]);
    if (validTiers.has(tier) && Number.isFinite(count)) {
      result.set(tier, Math.max(0, Math.round(count)));
    }
  }

  const parsed = Array.from(result, ([tier, count]) => ({ tier, count })).filter((item) => item.count > 0);
  return parsed.length ? parsed : [{ tier: "nano", count: 15 }, { tier: "micro", count: 5 }];
}

function encodeTargetKolTiers(tiers: TargetKolTier[]) {
  return TARGET_KOL_TIERS
    .map(({ key }) => ({ tier: key, count: tiers.find((item) => item.tier === key)?.count ?? 0 }))
    .filter((item) => item.count > 0)
    .map((item) => `${item.tier} ${item.count}`)
    .join(", ");
}

function formatTargetKolTier(tier: TargetKolTier) {
  const label = TARGET_KOL_TIERS.find((item) => item.key === tier.tier)?.label ?? tier.tier;
  return `${label}: ${tier.count.toLocaleString("id-ID")} KOL`;
}

function formatTargetKolTiers(value: string | null | undefined) {
  const tiers = parseTargetKolTiers(value);
  return tiers.length ? tiers.map(formatTargetKolTier).join(" • ") : "-";
}

function getTargetKolTotal(tiers: TargetKolTier[]) {
  return tiers.reduce((sum, tier) => sum + tier.count, 0);
}

function getTimeProgress(periodStart: string, periodEnd: string, now = new Date()) {
  const start = fromDateInputValue(periodStart);
  const end = fromDateInputValue(periodEnd);

  if (!start || !end) {
    return { daysLeftLabel: "tanggal belum lengkap", percent: 0 };
  }

  const duration = end.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  const percent = duration > 0 ? clampPercent((elapsed / duration) * 100) : 0;

  if (daysLeft > 0) return { daysLeftLabel: `${daysLeft} hari tersisa`, percent };
  if (daysLeft === 0) return { daysLeftLabel: "berakhir hari ini", percent };
  return { daysLeftLabel: "periode selesai", percent };
}

function getFallbackTarget(actual: number, seed: number, multiplier: number) {
  return Math.max(100, actual > 0 ? Math.ceil((actual * multiplier) / 100) * 100 : seed);
}

function getCampaignProgressDisplay(campaign: CampaignRecord, progress?: CampaignDashboardRecord) {
  const objective = parseCampaignObjective(campaign.objective);
  const actual = {
    comments: progress?.commentCount ?? 0,
    likes: progress?.likeCount ?? 0,
    posts: progress?.contentCount ?? 0,
    shares: progress?.shareCount ?? 0,
    views: progress?.viewCount ?? 0,
  };
  const targets = {
    comments: objective.targetComments || getFallbackTarget(actual.comments, 500 + campaign.id * 11, 1.7),
    likes: objective.targetLikes || getFallbackTarget(actual.likes, 3_000 + campaign.id * 101, 1.6),
    posts: objective.targetPosts || getFallbackTarget(actual.posts, Math.max(campaign.targetKolCount, 1), 1),
    shares: objective.targetShares || getFallbackTarget(actual.shares, 250 + campaign.id * 7, 1.8),
    views: objective.targetViews || getFallbackTarget(actual.views, 50_000 + campaign.id * 1_000, 1.5),
  };
  const metrics: MetricTarget[] = [
    { actual: actual.posts, isFallback: objective.targetPosts <= 0, label: "Post", percent: getProgressPercent(actual.posts, targets.posts), target: targets.posts },
    { actual: actual.views, isFallback: objective.targetViews <= 0, label: "Views", percent: getProgressPercent(actual.views, targets.views), target: targets.views },
    { actual: actual.likes, isFallback: objective.targetLikes <= 0, label: "Likes", percent: getProgressPercent(actual.likes, targets.likes), target: targets.likes },
    { actual: actual.comments, isFallback: objective.targetComments <= 0, label: "Comments", percent: getProgressPercent(actual.comments, targets.comments), target: targets.comments },
    { actual: actual.shares, isFallback: objective.targetShares <= 0, label: "Shares", percent: getProgressPercent(actual.shares, targets.shares), target: targets.shares },
  ];
  const time = getTimeProgress(campaign.periodStart, campaign.periodEnd);
  const explicitTargets = metrics.filter((metric) => !metric.isFallback).length;
  const bestMetricPercent = metrics.reduce((max, metric) => Math.max(max, metric.percent), 0);
  const metricSummary = explicitTargets
    ? `${explicitTargets} target asli • terbaik ${bestMetricPercent}%`
    : `Target dummy sementara • terbaik ${bestMetricPercent}%`;

  return { bestMetricPercent, daysLeftLabel: time.daysLeftLabel, metricSummary, metrics, timePercent: time.percent };
}

export const Route = createFileRoute("/campaigns")({
  component: RouteComponent,
  pendingComponent: CampaignsPendingComponent,
});

function CampaignsPendingComponent() {
  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-background via-[#fff6f8] to-background">
      <div className="container mx-auto max-w-6xl space-y-5 px-4 py-6 lg:py-8">
        <section className="space-y-4 rounded-none border border-[#b43c39]/15 bg-white p-5 shadow-[8px_8px_0_rgba(152,46,65,0.10)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <Skeleton className="h-3 w-24 bg-[#b43c39]/15" />
              <Skeleton className="h-10 w-80 max-w-full bg-[#b43c39]/10" />
              <Skeleton className="h-4 w-[32rem] max-w-full bg-[#b43c39]/10" />
            </div>
            <Skeleton className="h-10 w-40 bg-[#b43c39]/10" />
          </div>

          <div className="grid gap-3 border border-[#982E41]/15 bg-gradient-to-b from-background via-[#fff6f8] to-background p-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="grid gap-2">
              <Skeleton className="h-4 w-28 bg-[#b43c39]/15" />
              <Skeleton className="h-10 w-full bg-[#b43c39]/10" />
            </div>
            <div className="grid gap-2">
              <Skeleton className="h-4 w-24 bg-[#b43c39]/15" />
              <Skeleton className="h-10 w-full bg-[#b43c39]/10" />
            </div>
          </div>

          <div className="space-y-3">
            <CampaignListSkeleton />
          </div>
        </section>
      </div>
    </div>
  );
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

  const [editingId, setEditingId] = useState<number | null>(null);
  const [detailCampaignId, setDetailCampaignId] = useState<number | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [addContentCampaignId, setAddContentCampaignId] = useState<number | null>(null);
  const [isAddContentDialogOpen, setIsAddContentDialogOpen] = useState(false);
  const [syncingContentId, setSyncingContentId] = useState<number | null>(null);
  const [pendingContentSyncIds, setPendingContentSyncIds] = useState<Set<number>>(new Set());
  const [archivingContentId, setArchivingContentId] = useState<number | null>(null);
  const [restoringContentId, setRestoringContentId] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState<CampaignFormState>(getDefaultForm());
  const [campaignSearch, setCampaignSearch] = useState("");
  const [campaignStatusFilter, setCampaignStatusFilter] = useState<"all" | CampaignRecord["status"]>("all");
  const [contentRows, setContentRows] = useState<ContentFormRow[]>(getDefaultContentRows());
  const [kolSearch, setKolSearch] = useState("");
  const [selectedKeywordFilter, setSelectedKeywordFilter] = useState<string[]>([]);
  const campaignsQuery = useQuery(orpc.campaign.list.queryOptions());
  const campaignProgressQuery = useQuery(orpc.campaign.dashboard.queryOptions());
  const kolsQuery = useQuery(orpc.kol.list.queryOptions());
  const detailCampaignQuery = useQuery({
    ...orpc.campaign.getById.queryOptions({ input: { id: detailCampaignId ?? 0 } }),
    enabled: isDetailDialogOpen && detailCampaignId !== null,
  });
  const campaigns = (campaignsQuery.data as CampaignRecord[] | undefined) ?? [];
  const campaignProgressRows = (campaignProgressQuery.data as CampaignDashboardRecord[] | undefined) ?? [];
  const campaignProgressById = useMemo(
    () => new Map(campaignProgressRows.map((campaign) => [campaign.id, campaign])),
    [campaignProgressRows],
  );
  const kols = (kolsQuery.data as KolRecord[] | undefined) ?? [];
  const detailCampaignData = (detailCampaignQuery.data as CampaignDetailRecord | null | undefined) ?? null;

  useEffect(() => {
    const hasPendingContent = detailCampaignData?.contentsByKol.some((group) =>
      group.contents.some((content) => content.syncStatus === "pending"),
    );

    if (!hasPendingContent) {
      return;
    }

    const interval = window.setInterval(() => {
      detailCampaignQuery.refetch();
      campaignProgressQuery.refetch();
    }, 5_000);

    return () => window.clearInterval(interval);
  }, [campaignProgressQuery, detailCampaignData, detailCampaignQuery]);

  const brandOptions = useMemo(() => {
    return Array.from(new Set(campaigns.map((campaign) => campaign.brand.trim()).filter(Boolean)))
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
  }, [campaigns]);

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

  const filteredCampaigns = useMemo(() => {
    const normalizedSearch = campaignSearch.trim().toLowerCase();

    return campaigns.filter((campaign) => {
      const derivedStatus = getCampaignTemporalStatus(campaign.periodStart, campaign.periodEnd);
      const matchesStatus = campaignStatusFilter === "all" || derivedStatus === campaignStatusFilter;
      const matchesSearch =
        !normalizedSearch ||
        [campaign.name, campaign.brand, campaign.description, campaign.keywords, formatObjectiveSummary(campaign.objective)]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [campaignSearch, campaignStatusFilter, campaigns]);

  const { activeContentGroups, archivedContentGroups } = useMemo(() => {
    const activeGroups: CampaignDetailRecord["contentsByKol"] = [];
    const archivedGroups: CampaignDetailRecord["contentsByKol"] = [];

    for (const group of detailCampaignData?.contentsByKol ?? []) {
      const { activeContents, archivedContents } = splitCampaignContentsByArchiveState(group.contents);

      if (activeContents.length) {
        activeGroups.push({ ...group, contents: activeContents });
      }

      if (archivedContents.length) {
        archivedGroups.push({ ...group, contents: archivedContents });
      }
    }

    return { activeContentGroups: activeGroups, archivedContentGroups: archivedGroups };
  }, [detailCampaignData]);

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
      setPendingContentSyncIds((current) => {
        const next = new Set(current);
        next.delete(content.id);
        return next;
      });

      if (content.syncStatus === "failed") {
        toast.error(content.syncMessage || "Konten gagal di-scrap");
      } else {
        toast.success("Konten berhasil di-scrap");
      }

      if (detailCampaignQuery.isFetched) {
        detailCampaignQuery.refetch();
      }
    },
    onError: (error, variables) => {
      setPendingContentSyncIds((current) => {
        const next = new Set(current);
        next.delete(variables.id);
        return next;
      });
      toast.error(error instanceof Error ? error.message : "Gagal melakukan sync konten");
    },
  });

  const archiveContent = useMutation({
    mutationFn: ({ id }: { id: number }) => client.campaign.archiveContent({ id }),
    onSuccess: () => {
      toast.success("Konten berhasil diarsipkan");

      if (detailCampaignQuery.isFetched) {
        detailCampaignQuery.refetch();
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal mengarsipkan konten");
    },
  });

  const restoreContent = useMutation({
    mutationFn: ({ id }: { id: number }) => client.campaign.restoreContent({ id }),
    onSuccess: () => {
      toast.success("Konten dikembalikan dari arsip");

      if (detailCampaignQuery.isFetched) {
        detailCampaignQuery.refetch();
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal mengembalikan konten");
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
        kols.flatMap((kol) => parseKeywordTokens(kol.keywords))
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
      status: getCampaignTemporalStatus(campaign.periodStart, campaign.periodEnd),
      targetFollowerTier: campaign.targetFollowerTier,
      targetKolCount: campaign.targetKolCount,
    });
    setIsDialogOpen(true);
  }

  function submit() {
    const payload = {
      ...form,
      status: getCampaignTemporalStatus(form.periodStart, form.periodEnd),
      targetFollowerTier: encodeTargetKolTiers(parseTargetKolTiers(form.targetFollowerTier)),
      targetKolCount: getTargetKolTotal(parseTargetKolTiers(form.targetFollowerTier)),
    };

    if (editingId) {
      updateCampaign.mutate({ id: editingId, ...payload });
      return;
    }

    createCampaign.mutate(payload);
  }

  return (
    <>
      <div className="h-full overflow-y-auto bg-gradient-to-b from-background via-[#fff6f8] to-background">
        <div className="container mx-auto max-w-6xl space-y-5 px-4 py-6 lg:py-8">
          <section className="space-y-4 rounded-none border border-[#b43c39]/15 bg-white p-5 shadow-[8px_8px_0_rgba(152,46,65,0.10)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#B43C39]">Campaigns</p>
                <h1 className="font-goldman text-3xl font-bold uppercase tracking-wide text-[#2b1418] md:text-4xl">Daftar campaign</h1>
              </div>
              <Button type="button" onClick={openCreateDialog} className="rounded-none bg-[#B43C39] font-semibold text-white hover:bg-[#8f2e2c]">
                <Plus className="mr-2 size-4" />
                Tambah campaign
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
              <Label className="grid gap-2 text-sm text-[#2b1418]">
                <span>Cari campaign</span>
                <Input
                  placeholder="Nama, brand, keyword, objective"
                  value={campaignSearch}
                  onChange={(event) => setCampaignSearch(event.target.value)}
                />
              </Label>
              <Label className="grid gap-2 text-sm text-[#2b1418]">
                <span>Filter status</span>
                <Select
                  value={campaignStatusFilter}
                  onChange={(event) => setCampaignStatusFilter(event.target.value as typeof campaignStatusFilter)}
                >
                  <option value="all">Semua status</option>
                  <option value="draft">Belum mulai</option>
                  <option value="active">Berjalan</option>
                  <option value="completed">Selesai</option>
                  <option value="archived">Diarsipkan</option>
                </Select>
              </Label>
            </div>

            <div className="space-y-3">
              {campaignsQuery.isLoading || campaignProgressQuery.isLoading ? (
                <CampaignListSkeleton />
              ) : filteredCampaigns.map((campaign) => {
                const progress = campaignProgressById.get(campaign.id);
                const targetTiers = parseTargetKolTiers(campaign.targetFollowerTier);
                const derivedStatus = getCampaignTemporalStatus(campaign.periodStart, campaign.periodEnd);
                const progressSummary = getCampaignProgressDisplay(campaign, progress);

                return (
                  <article
                    key={campaign.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openDetailDialog(campaign.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openDetailDialog(campaign.id);
                      }
                    }}
                    className="cursor-pointer rounded-none border border-[#b43c39]/15 bg-white p-4 shadow-[6px_6px_0_rgba(152,46,65,0.08)] transition hover:-translate-y-0.5 hover:shadow-[8px_8px_0_rgba(152,46,65,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B43C39]"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0 space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#B43C39]">{campaign.brand}</p>
                        <h2 className="truncate text-lg font-semibold text-[#2b1418]">{campaign.name}</h2>
                        <p className="line-clamp-2 text-sm text-muted-foreground">{formatObjectiveSummary(campaign.objective)}</p>
                      </div>
                      <span className="w-fit border border-[#b43c39]/20 bg-[#fff3d8] px-2 py-1 text-xs uppercase tracking-[0.14em] text-[#7B204C]">{formatCampaignStatus(derivedStatus)}</span>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
                      <ProgressBlock
                        label="Progress waktu"
                        percent={progressSummary.timePercent}
                        meta={`${formatHumanDate(campaign.periodStart)} → ${formatHumanDate(campaign.periodEnd)} • ${progressSummary.daysLeftLabel}`}
                      />
                      <ProgressBlock
                        label="Target KPI"
                        percent={progressSummary.bestMetricPercent}
                        meta={progressSummary.metricSummary}
                      />
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                      {progressSummary.metrics.map((metric) => (
                        <MetricTargetBadge key={metric.label} {...metric} />
                      ))}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {targetTiers.map((tier) => (
                        <span key={tier.tier} className="border border-[#982E41]/25 bg-[#FFF8F9] px-2 py-1 text-xs font-medium text-[#2b1418]">
                          {formatTargetKolTier(tier)}
                        </span>
                      ))}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{formatHumanDate(campaign.periodStart)} → {formatHumanDate(campaign.periodEnd)}</span>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!campaign.kols.length}
                          onClick={(event) => {
                            event.stopPropagation();
                            openAddContentDialog(campaign.id);
                          }}
                        >
                          <Plus className="mr-1 size-4" />
                          Tambahkan konten
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            editCampaign(campaign);
                          }}
                        >
                          <PencilLine className="mr-1 size-4" />
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="rounded-none border-red-700 bg-red-600 px-2 text-white hover:bg-red-700"
                          disabled={deleteCampaign.isPending}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (window.confirm("Apakah Anda yakin ingin menghapus campaign ini?")) {
                              deleteCampaign.mutate({ id: campaign.id });
                            }
                          }}
                          aria-label={`Hapus ${campaign.name}`}
                          title="Hapus"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}

              {!campaignsQuery.isLoading && !campaignProgressQuery.isLoading && !filteredCampaigns.length && (
                <p className="text-sm text-muted-foreground">{campaigns.length ? "Tidak ada campaign yang cocok dengan filter." : "Belum ada campaign yang dibuat."}</p>
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
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-hidden text-[#2b1418]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit campaign" : "Tambah campaign"}</DialogTitle>
          </DialogHeader>

          <form
            className="flex max-h-[calc(92vh-88px)] flex-col bg-white"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="grid gap-5 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6 sm:py-6">
            <section className="grid gap-5 border border-[#982E41]/20 bg-white p-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#982E41]">Identitas campaign</p>
              </div>
              <FormInput
                label="Nama campaign"
                value={form.name}
                onChange={(value) => setForm((current) => ({ ...current, name: value }))}
              />
              <BrandInput
                options={brandOptions}
                value={form.brand}
                onChange={(value) => setForm((current) => ({ ...current, brand: value }))}
              />
              <DateRangePicker
                label="Periode campaign"
                value={{ from: fromDateInputValue(form.periodStart), to: fromDateInputValue(form.periodEnd) }}
                onChange={(range) =>
                  setForm((current) => ({
                    ...current,
                    periodEnd: toDateInputValue(range?.to),
                    periodStart: toDateInputValue(range?.from),
                  }))
                }
              />
              <TargetKolTierInputs
                value={form.targetFollowerTier}
                onChange={(targetFollowerTier) =>
                  setForm((current) => ({
                    ...current,
                    targetFollowerTier,
                    targetKolCount: getTargetKolTotal(parseTargetKolTiers(targetFollowerTier)),
                  }))
                }
              />
              <div className="grid gap-2 border border-[#982E41]/20 bg-[#FFF8F9] px-3 py-2 text-sm text-[#2b1418] md:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#982E41]">Status otomatis</span>
                <span>{formatCampaignStatus(getCampaignTemporalStatus(form.periodStart, form.periodEnd))}</span>
                <span className="text-xs text-muted-foreground">Status dihitung dari periode campaign, bukan input manual.</span>
              </div>
            </section>

            <section className="grid gap-5 border border-[#982E41]/20 bg-white p-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#982E41]">Brief & target</p>
              </div>

            <div className="md:col-span-2">
              <FormTextarea
                label="Deskripsi"
                value={form.description}
                onChange={(value) => setForm((current) => ({ ...current, description: value }))}
              />
            </div>
            <CampaignObjectiveFields
              value={form.objective}
              onChange={(value) => setForm((current) => ({ ...current, objective: value }))}
            />
            <KeywordTokenInput
              label="Keyword"
              value={form.keywords}
              onChange={(value) => setForm((current) => ({ ...current, keywords: value }))}
            />
            <div className="md:col-span-2">
              <FormTextarea
                label="Post brief campaign"
                value={form.postBriefs}
                onChange={(value) => setForm((current) => ({ ...current, postBriefs: value }))}
                placeholder="Satu brief per baris"
              />
            </div>
            </section>

            <section className="grid gap-3 border border-[#982E41]/20 bg-white p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#982E41]">Shortlist KOL</p>
              </div>

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
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Filter keyword</p>
                    <div className="flex flex-wrap gap-2">
                      {allKeywords.map((keyword) => (
                        <Button
                          key={keyword}
                          type="button"
                          size="xs"
                          variant={selectedKeywordFilter.includes(keyword) ? "default" : "outline"}
                          onClick={() => {
                            setSelectedKeywordFilter((current) =>
                              current.includes(keyword)
                                ? current.filter((k) => k !== keyword)
                                : [...current, keyword]
                            );
                          }}
                          className={selectedKeywordFilter.includes(keyword)
                            ? "border-[#982E41] bg-[#982E41] text-white hover:bg-[#7E2334]"
                            : "border-[#982E41]/25 bg-white text-[#982E41] hover:bg-[#982E41]/10"}
                        >
                          {keyword}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-border grid max-h-64 gap-2 overflow-y-auto overflow-x-hidden border p-3">
                {filteredKols.map((kol) => {
                  const checked = form.selectedKolIds.includes(kol.id);

                  return (
                    <Label key={kol.id} className="hover:bg-muted/40 flex min-w-0 items-start gap-3 p-2 text-sm">
                      <Checkbox
                        className="mt-0.5 shrink-0"
                        checked={checked}
                        onCheckedChange={(nextChecked) => {
                          setForm((current) => ({
                            ...current,
                            selectedKolIds: nextChecked === true
                              ? [...current.selectedKolIds, kol.id]
                              : current.selectedKolIds.filter((id) => id !== kol.id),
                          }));
                        }}
                      />
                      <span className="min-w-0">
                        <strong>{kol.displayName}</strong>
                        <details className="text-muted-foreground mt-1">
                          <summary className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-foreground">
                            Sosmed ({kol.accounts.length}) <ChevronDown className="size-3" />
                          </summary>
                          <span className="mt-1 block wrap-break-word">
                            {kol.accounts.length
                              ? kol.accounts.map((account) => `${account.platform}: @${account.handle}`).join(" • ")
                              : "Belum ada sosmed"}
                          </span>
                        </details>
                        {kol.keywords && <span className="text-muted-foreground block">{kol.keywords}</span>}
                      </span>
                    </Label>
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
            </section>
            </div>

            <DialogFooter className="shrink-0">
              {editingId && (
                <Button type="button" variant="outline" className="border-[#982E41] text-[#982E41] hover:bg-[#982E41]/10 hover:text-[#982E41]" onClick={resetForm}>
                  Batal edit
                </Button>
              )}
              <Button type="submit" disabled={createCampaign.isPending || updateCampaign.isPending} className="border border-[#982E41] bg-[#982E41] text-white hover:bg-[#7E2334]">
                {(editingId ? updateCampaign.isPending : createCampaign.isPending) && <Loader2 className="mr-2 size-4 animate-spin" />}
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
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto text-[#2b1418]">
          <DialogHeader>
              <div className="flex flex-col gap-3 pr-10 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <DialogTitle>
                    Detail campaign
                  </DialogTitle>
                </div>

                {detailCampaignId !== null && (
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    {detailCampaignSummary && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-[#982E41] bg-[#FFF8F9] text-[#982E41] hover:bg-[#982E41] hover:text-white"
                          onClick={() => {
                            closeDetailDialog();
                            editCampaign(detailCampaignSummary);
                          }}
                        >
                          <PencilLine className="mr-1 size-4" />
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={deleteCampaign.isPending}
                          onClick={() => {
                            if (window.confirm("Apakah Anda yakin ingin menghapus campaign ini?")) {
                              deleteCampaign.mutate({ id: detailCampaignSummary.id });
                              closeDetailDialog();
                            }
                          }}
                        >
                          <Trash2 className="mr-1 size-4" />
                          Hapus
                        </Button>
                      </>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      render={<a href={campaignReportUrl} download={`campaign-${detailCampaignId}-report.pdf`} />}
                    >
                      <Download className="mr-1 size-4" />
                      Buat laporan PDF
                    </Button>
                  </div>
                )}
              </div>
          </DialogHeader>

          {!detailCampaignSummary ? (
            detailCampaignQuery.isLoading ? (
              <CampaignDetailSkeleton compact />
            ) : (
              <div className="px-4 pb-4 text-sm text-muted-foreground sm:px-6 sm:pb-6">Campaign tidak ditemukan.</div>
            )
          ) : !detailCampaignData ? (
            <CampaignDetailSkeleton />
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
                    value={`${formatHumanDate(detailCampaignSummary?.periodStart ?? detailCampaignData?.periodStart)} → ${formatHumanDate(detailCampaignSummary?.periodEnd ?? detailCampaignData?.periodEnd)}`}
                  />
                  <DetailStat boxed label="Target KOL total" value={String(detailCampaignSummary?.targetKolCount ?? detailCampaignData?.targetKolCount ?? 0)} />
                  <DetailStat boxed label="Follower tier" value={formatTargetKolTiers(detailCampaignSummary?.targetFollowerTier ?? detailCampaignData?.targetFollowerTier)} />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <DetailStat boxed label="Objective" value={formatObjectiveDetails(detailCampaignData?.objective ?? detailCampaignSummary?.objective)} />
                  <DetailStat boxed label="Keywords" value={<KeywordChips value={detailCampaignData?.keywords ?? detailCampaignSummary?.keywords} />} />
                  <DetailStat boxed label="Created at" value={formatHumanDateTime(detailCampaignSummary?.createdAt ?? detailCampaignData?.createdAt)} />
                  <DetailStat boxed label="Updated at" value={formatHumanDateTime(detailCampaignSummary?.updatedAt ?? detailCampaignData?.updatedAt)} />
                </div>

                <div className="grid gap-3">
                  <DetailStat boxed label="Deskripsi" value={detailCampaignData?.description ?? detailCampaignSummary?.description ?? "-"} />
                  <DetailStat boxed label="Post brief" value={detailCampaignData?.postBriefs ?? detailCampaignSummary?.postBriefs ?? "-"} />
                </div>
              </section>

              <section className="space-y-3">
                <div>
                  <h3 className="text-[15px] font-semibold text-foreground">Konten campaign</h3>
                </div>

                {activeContentGroups.length ? (
                  <div className="space-y-4">
                    {activeContentGroups.map((group) => (
                      <article key={group.kolId} className="border-[1.6px] border-border/70 bg-white p-4 sm:p-5">
                        <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-[18px] font-semibold leading-none text-foreground">{group.displayName}</p>
                            <p className="text-[13px] text-muted-foreground">
                              {group.handles.length ? group.handles.join(" / ") : "Tidak ada handle yang tersimpan."}
                            </p>
                          </div>
                          <span className="border border-border bg-[#fff3d8] px-2 py-1 text-xs text-muted-foreground">
                            {group.contents.length} konten
                          </span>
                        </div>

                        <div className="space-y-3">
                          {group.contents.map((content) => (
                            <article key={content.id} className="border-[1.6px] border-border/70 bg-[#FFF5F7] space-y-3 p-3 sm:p-4">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 space-y-1">
                                        {(() => {
                                          const isSyncingThisContent =
                                            syncingContentId === content.id ||
                                            pendingContentSyncIds.has(content.id) ||
                                            content.syncStatus === "pending";

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
                                                {isSyncingThisContent && <Loader2 className="mr-1 inline size-3 animate-spin" />}
                                                {isSyncingThisContent ? "sedang sync..." : content.syncStatus}
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
                                    disabled={syncContent.isPending || syncingContentId !== null || content.syncStatus === "pending"}
                                    onClick={async () => {
                                      const toastId = toast.loading("Sinkronisasi konten berjalan...");
                                      setSyncingContentId(content.id);
                                      setPendingContentSyncIds((current) => new Set(current).add(content.id));

                                      try {
                                        await syncContent.mutateAsync({ id: content.id });
                                      } finally {
                                        toast.dismiss(toastId);
                                        setSyncingContentId((current) => (current === content.id ? null : current));
                                      }
                                    }}
                                  >
                                    {syncingContentId === content.id || content.syncStatus === "pending" ? (
                                      <Loader2 className="mr-1 size-4 animate-spin" />
                                    ) : (
                                      <RefreshCcw className="mr-1 size-4" />
                                    )}
                                    {syncingContentId === content.id || content.syncStatus === "pending" ? "Sedang sync..." : "Sync sekarang"}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={archiveContent.isPending || archivingContentId === content.id}
                                    onClick={async () => {
                                      setArchivingContentId(content.id);

                                      try {
                                        await archiveContent.mutateAsync({ id: content.id });
                                      } finally {
                                        setArchivingContentId((current) => (current === content.id ? null : current));
                                      }
                                    }}
                                  >
                                    <Archive className="mr-1 size-4" />
                                    {archivingContentId === content.id ? "Mengarsipkan..." : "Arsipkan"}
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    disabled={deleteContent.isPending}
                                    onClick={() => {
                                      if (window.confirm("Hapus permanen konten ini?")) {
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
                  <p className="text-muted-foreground text-sm">Belum ada konten aktif untuk campaign ini.</p>
                )}
              </section>

              {archivedContentGroups.length ? (
                <section className="space-y-3">
                  <div>
                    <h3 className="text-[15px] font-semibold text-foreground">Arsip konten</h3>
                    <p className="text-xs text-muted-foreground">
                      Post yang diarsip tetap tersimpan, tapi tidak ikut daftar konten aktif.
                    </p>
                  </div>

                  <div className="space-y-4">
                    {archivedContentGroups.map((group) => (
                      <article key={`archived-${group.kolId}`} className="border-[1.6px] border-border/70 bg-white/70 p-4 sm:p-5">
                        <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-[18px] font-semibold leading-none text-foreground">{group.displayName}</p>
                            <p className="text-[13px] text-muted-foreground">
                              {group.handles.length ? group.handles.join(" / ") : "Tidak ada handle yang tersimpan."}
                            </p>
                          </div>
                          <span className="border border-border bg-[#F1E2E6] px-2 py-1 text-xs text-muted-foreground">
                            {group.contents.length} archived
                          </span>
                        </div>

                        <div className="space-y-3">
                          {group.contents.map((content) => (
                            <article key={content.id} className="space-y-3 border-[1.6px] border-border/70 bg-[#F9EEF1] p-3 opacity-80 sm:p-4">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="border border-border px-2 py-0.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                                      archived
                                    </span>
                                    <span className="border border-border px-2 py-0.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                                      {content.platform}
                                    </span>
                                  </div>
                                  <a
                                    className="break-all text-xs text-primary underline-offset-4 hover:underline"
                                    href={content.contentUrl}
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    {content.contentUrl}
                                  </a>
                                  <p className="text-xs text-muted-foreground">Diarsipkan pada {formatDateTime(content.archivedAt)}</p>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={restoreContent.isPending || restoringContentId === content.id}
                                    onClick={async () => {
                                      setRestoringContentId(content.id);

                                      try {
                                        await restoreContent.mutateAsync({ id: content.id });
                                      } finally {
                                        setRestoringContentId((current) => (current === content.id ? null : current));
                                      }
                                    }}
                                  >
                                    <ArchiveRestore className="mr-1 size-4" />
                                    {restoringContentId === content.id ? "Memulihkan..." : "Pulihkan"}
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    disabled={deleteContent.isPending}
                                    onClick={() => {
                                      if (window.confirm("Hapus permanen konten ini?")) {
                                        deleteContent.mutate({ id: content.id });
                                      }
                                    }}
                                  >
                                    <Trash2 className="mr-1 size-4" />
                                    Hapus
                                  </Button>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
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
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden text-[#2b1418]">
          <DialogHeader>
            <DialogTitle>Tambahkan konten</DialogTitle>
            <DialogDescription>
              Masukkan link konten per baris, lalu simpan untuk mengambil metriknya.
            </DialogDescription>
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
              className="flex max-h-[calc(90vh-88px)] flex-col bg-white"
              onSubmit={(event) => {
                event.preventDefault();
                submitAddContent();
              }}
            >
              <div className="grid gap-5 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6 sm:py-6">
                <div className="grid gap-3 md:grid-cols-2">
                  <DetailStat label="Campaign" value={addContentCampaign.name} />
                  <DetailStat label="Brand" value={addContentCampaign.brand} />
                  <DetailStat label="Periode" value={`${formatHumanDate(addContentCampaign.periodStart)} → ${formatHumanDate(addContentCampaign.periodEnd)}`} />
                  <DetailStat label="KOL terpilih" value={String(addContentCampaign.kols.length)} />
                </div>

                <div className="space-y-3">
                {contentRows.map((row, index) => (
                  <div key={row.id} className="grid gap-3 rounded-none border border-border p-3 md:grid-cols-[240px_minmax(0,1fr)_auto] md:items-end">
                    <Label className="grid gap-2">
                      <span>KOL</span>
                      <Select
                        className="text-xs"
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
                      </Select>
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
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" className="border-[#982E41] text-[#982E41] hover:bg-[#982E41]/10 hover:text-[#982E41]" onClick={closeAddContentDialog}>
                  Batal
                </Button>
                <Button type="submit" disabled={addContent.isPending} className="border border-[#982E41] bg-[#982E41] text-white hover:bg-[#7E2334]">
                  {addContent.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                  {addContent.isPending ? "Mengambil data..." : "Tambahkan konten"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}


function ProgressBlock({ label, meta, percent }: { label: string; meta: string; percent: number }) {
  return (
    <div className="border border-[#982E41]/20 bg-white p-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#982E41]">{label}</p>
          <p className="text-xs text-muted-foreground">{meta}</p>
        </div>
        <span className="text-2xl font-semibold text-[#2b1418]">{percent}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden bg-[#F2DDE2]">
        <div className="h-full bg-[#982E41]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function MetricTargetBadge({ actual, label, percent, target }: MetricTarget) {
  return (
    <div className="border border-[#982E41]/25 bg-white px-3 py-2 text-xs text-[#2b1418]">
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold uppercase tracking-[0.14em] text-[#982E41]">{label}</span>
        <span className="font-semibold">{target === null ? "-" : `${percent}%`}</span>
      </div>
      <p className="mt-1 text-muted-foreground">
        {formatNumber(actual)} / {target === null ? "belum ada target" : formatNumber(target)}
      </p>
    </div>
  );
}

function parseKeywordTokens(value: string) {
  return value
    .split(/[\s,]+/)
    .map((keyword) => keyword.trim().replace(/^#+/, ""))
    .filter(Boolean);
}

function encodeKeywordTokens(tokens: string[]) {
  return Array.from(new Set(tokens.map((token) => token.trim()).filter(Boolean))).join(", ");
}

function KeywordChips({ value }: { value: string | null | undefined }) {
  const tokens = parseKeywordTokens(value ?? "");

  if (!tokens.length) {
    return <span>-</span>;
  }

  return (
    <span className="flex flex-wrap gap-2">
      {tokens.map((token) => (
        <span key={token} className="border border-[#982E41]/25 bg-[#FFF8F9] px-2 py-1 text-xs font-medium text-[#982E41]">
          {token}
        </span>
      ))}
    </span>
  );
}

function KeywordTokenInput({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  const tokens = parseKeywordTokens(value);
  const [draft, setDraft] = useState("");

  function commitDraft(rawDraft = draft) {
    const nextTokens = parseKeywordTokens(rawDraft);
    if (!nextTokens.length) {
      setDraft("");
      return;
    }

    onChange(encodeKeywordTokens([...tokens, ...nextTokens]));
    setDraft("");
  }

  function removeToken(tokenToRemove: string) {
    onChange(encodeKeywordTokens(tokens.filter((token) => token !== tokenToRemove)));
  }

  return (
    <div className="space-y-2 md:col-span-2">
      <Label>{label}</Label>
      <div className="flex min-h-11 flex-wrap items-center gap-2 border border-[#b43c39]/20 bg-white px-3 py-2 focus-within:border-[#B43C39] focus-within:ring-[3px] focus-within:ring-[#B43C39]/15">
        {tokens.map((token) => (
          <button
            key={token}
            type="button"
            className="border border-[#982E41]/25 bg-[#FFF8F9] px-2 py-1 text-xs font-medium text-[#982E41] hover:bg-[#982E41]/10"
            onClick={() => removeToken(token)}
            aria-label={`Hapus keyword ${token}`}
          >
            {token} x
          </button>
        ))}
        <input
          className="min-w-32 flex-1 bg-transparent text-sm text-[#2b1418] outline-none placeholder:text-[#A16A75]"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commitDraft()}
          onKeyDown={(event) => {
            if ([" ", "Enter", ","].includes(event.key)) {
              event.preventDefault();
              commitDraft();
            }

            if (event.key === "Backspace" && !draft && tokens.length) {
              event.preventDefault();
              onChange(encodeKeywordTokens(tokens.slice(0, -1)));
            }
          }}
          placeholder={tokens.length ? "Tambah lalu tekan spasi" : "Ketik keyword lalu tekan spasi"}
        />
      </div>
    </div>
  );
}

function TargetKolTierInputs({ onChange, value }: { onChange: (value: string) => void; value: string }) {
  const tiers = parseTargetKolTiers(value);

  function updateTier(tier: string, count: number) {
    const next = TARGET_KOL_TIERS.map(({ key }) => ({
      tier: key,
      count: key === tier ? count : tiers.find((item) => item.tier === key)?.count ?? 0,
    }));

    onChange(encodeTargetKolTiers(next));
  }

  return (
    <div className="space-y-3 md:col-span-2">
      <div>
        <Label>Target KOL total per tier</Label>
        <p className="text-xs text-muted-foreground">Deterministik: simpan sebagai list seperti “micro 5, nano 15”.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {TARGET_KOL_TIERS.map(({ key, label }) => (
          <Label key={key} className="grid gap-2 border border-[#982E41]/20 bg-white p-3">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#982E41]">{label}</span>
            <Input
              min={0}
              type="number"
              value={tiers.find((item) => item.tier === key)?.count ?? 0}
              onChange={(event) => updateTier(key, Number(event.target.value || 0))}
            />
          </Label>
        ))}
      </div>
    </div>
  );
}

function DateRangePicker({ label, onChange, value }: { label: string; onChange: (range: DateRange | undefined) => void; value: DateRange }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2 md:col-span-2">
      <Label>{label}</Label>
      <Button type="button" variant="outline" className="w-full justify-start gap-2 border-[#b43c39]/20 bg-white font-normal text-[#2b1418] hover:bg-[#fff3d8] hover:text-[#2b1418]" onClick={() => setOpen((current) => !current)}>
        <CalendarIcon className="size-4" />
        {value.from ? `${formatShortDate(toDateInputValue(value.from))} - ${value.to ? formatShortDate(toDateInputValue(value.to)) : "Pilih selesai"}` : "Pilih rentang tanggal"}
      </Button>
      {open && (
        <div className="w-fit max-w-full overflow-x-auto border border-[#b43c39]/15 bg-white p-3 shadow-sm">
          <Calendar mode="range" numberOfMonths={2} selected={value} onSelect={onChange} />
        </div>
      )}
    </div>
  );
}

function CampaignObjectiveFields({ onChange, value }: { onChange: (value: string) => void; value: string }) {
  const objective = parseCampaignObjective(value);
  const updateObjective = (patch: Partial<typeof objective>) => onChange(encodeCampaignObjective({ ...objective, ...patch }));
  const interactions = getTargetInteractions(objective);

  return (
    <div className="space-y-3 md:col-span-2">
      <div>
        <Label>Objektif campaign</Label>
        <p className="text-muted-foreground text-xs">Target eksplisit untuk progress: views dan interaksi.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-5">
        <ObjectiveNumberInput label="Target post" value={objective.targetPosts} onChange={(targetPosts) => updateObjective({ targetPosts })} />
        <ObjectiveNumberInput label="Target view" value={objective.targetViews} onChange={(targetViews) => updateObjective({ targetViews })} />
        <ObjectiveNumberInput label="Target like" value={objective.targetLikes} onChange={(targetLikes) => updateObjective({ targetLikes })} />
        <ObjectiveNumberInput label="Target komentar" value={objective.targetComments} onChange={(targetComments) => updateObjective({ targetComments })} />
        <ObjectiveNumberInput label="Target share" value={objective.targetShares} onChange={(targetShares) => updateObjective({ targetShares })} />
      </div>
      <FormTextarea
        label={`Catatan objektif tambahan${interactions ? ` • total interaksi ${interactions.toLocaleString("id-ID")}` : ""}`}
        value={objective.legacyText}
        onChange={(legacyText) => updateObjective({ legacyText })}
        placeholder="Opsional: konteks target, segmentasi, atau KPI tambahan"
      />
    </div>
  );
}

function ObjectiveNumberInput({ label, onChange, value }: { label: string; onChange: (value: number) => void; value: number }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        min={0}
        type="number"
        value={value || ""}
        onChange={(event) => onChange(Number(event.target.value || 0))}
        placeholder="0"
      />
    </div>
  );
}

function BrandInput({ onChange, options, value }: { onChange: (value: string) => void; options: string[]; value: string }) {
  const normalizedValue = value.trim().toLowerCase();
  const isNewBrand = value.trim().length > 0 && !options.some((option) => option.toLowerCase() === normalizedValue);

  return (
    <label className="grid gap-2 text-xs font-medium uppercase tracking-[0.14em] text-[#982E41]">
      <span>Brand</span>
      <Input
        className="border-[#b43c39]/20 bg-white text-[#2b1418] placeholder:text-[#A16A75] focus-visible:border-[#B43C39] focus-visible:ring-[#B43C39]/15"
        list="campaign-brand-options"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Pilih brand existing atau ketik brand baru"
        value={value}
      />
      <datalist id="campaign-brand-options">
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <span className="text-[11px] font-normal normal-case tracking-normal text-muted-foreground">
        {isNewBrand ? `Brand baru “${value.trim()}” akan dipakai otomatis saat campaign disimpan.` : "Suggestion diambil dari brand campaign existing."}
      </span>
    </label>
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
        className="border-[#b43c39]/20 bg-white text-[#2b1418] placeholder:text-[#A16A75] focus-visible:border-[#B43C39] focus-visible:ring-[#B43C39]/15"
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
      <Textarea
        className="border-[#b43c39]/20 bg-white text-xs text-[#2b1418] placeholder:text-[#A16A75] focus-visible:border-[#B43C39] focus-visible:ring-[#B43C39]/15"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </Label>
  );
}

function CampaignListSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, index) => (
        <article key={index} className="rounded-none border border-[#b43c39]/15 bg-white p-4 shadow-[6px_6px_0_rgba(152,46,65,0.08)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-72 max-w-full" />
              <Skeleton className="h-4 w-96 max-w-full" />
            </div>
            <Skeleton className="h-7 w-24" />
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            {Array.from({ length: 2 }).map((_, progressIndex) => (
              <div key={progressIndex} className="border border-[#982E41]/20 bg-[#FFF8F9] p-3">
                <div className="flex items-end justify-between gap-3">
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-3 w-48 max-w-full" />
                  </div>
                  <Skeleton className="h-7 w-14" />
                </div>
                <Skeleton className="mt-3 h-2 w-full" />
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, metricIndex) => (
              <div key={metricIndex} className="border border-[#982E41]/25 bg-white px-3 py-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-2 h-4 w-28" />
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-7 w-20" />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <Skeleton className="h-4 w-44" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-20" />
            </div>
          </div>
        </article>
      ))}
    </>
  );
}

function CampaignDetailSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="grid gap-6 px-4 pb-4 sm:px-6 sm:pb-6">
      <section className="space-y-4 border-[1.6px] border-border/70 bg-white p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: compact ? 3 : 6 }).map((_, index) => (
            <div key={index} className="border-border bg-muted/30 border p-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-5 w-36 max-w-full" />
            </div>
          ))}
        </div>
      </section>
      {!compact && (
        <section className="space-y-3 border-[1.6px] border-border/70 bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-9 w-32" />
          </div>
          <div className="grid gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="border-border border p-3">
                <Skeleton className="h-5 w-64 max-w-full" />
                <div className="mt-3 grid gap-2 md:grid-cols-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
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
  value: ReactNode;
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
      <div className={`${valueClassName} break-words whitespace-pre-line`}>
        {value}
      </div>
    </div>
  );
}

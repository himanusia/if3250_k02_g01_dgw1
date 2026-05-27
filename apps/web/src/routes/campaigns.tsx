import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Archive, ArchiveRestore, CalendarIcon, ChevronDown, Download, Eye, Heart, Loader2, MessageCircle, PencilLine, Plus, RefreshCcw, Search, Share2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";

import type { CampaignContentRecord, CampaignDashboardRecord, CampaignDetailRecord, CampaignRecord, KolRecord } from "@/lib/app-types";
import { splitCampaignContentsByArchiveState } from "@/lib/campaign-content-archive";
import { formatObjectiveSummary, getObjectiveText } from "@/lib/campaign-objective";
import { downloadCampaignReportPdf } from "@/lib/campaign-report-pdf";
import { formatDateTime, formatNumber, getAvatarSrc } from "@/lib/kol-utils";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { client, orpc } from "@/utils/orpc";

type CampaignFormState = {
  brand: string;
  budgetIdr: string;
  description: string;
  keywords: string;
  name: string;
  objective: string;
  periodEnd: string;
  periodStart: string;
  postBriefs: string;
  selectedKolIds: number[];
  status: CampaignRecord["status"];
  targetContentCount: string;
  targetFollowerTier: string;
  targetKolCount: number;
};

type CampaignMutationInput = Omit<CampaignFormState, "budgetIdr" | "targetContentCount"> & {
  budgetIdr: number;
  targetContentCount: number;
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
  budgetIdr: string;
  caption: string;
  contentType: "post" | "reel" | "story";
  contentUrl: string;
  estimatedCommentCount: string;
  estimatedLikeCount: string;
  estimatedShareCount: string;
  estimatedViewCount: string;
  id: string;
  isFyp: "yes" | "no";
  kolDisplayName: string;
  kolHandle: string;
  kolId: number | "";
  platform: "instagram" | "tiktok";
  title: string;
};

type AddContentPayloadRow = {
  budgetIdr: number | null;
  caption: string;
  contentType: "post" | "reel" | "story";
  contentUrl: string;
  estimatedCommentCount: number;
  estimatedLikeCount: number;
  estimatedShareCount: number;
  estimatedViewCount: number;
  isFyp: boolean | null;
  kolDisplayName: string;
  kolHandle: string;
  kolId: number | null;
  likeCount: number;
  platform: "instagram" | "tiktok";
  shareCount: number;
  title: string;
  viewCount: number;
};

type ContentRowErrors = Partial<Record<"contentUrl" | "kol" | "platform", string>>;

function createEmptyContentRow(): ContentFormRow {
  const randomId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    budgetIdr: "",
    caption: "",
    contentType: "post",
    contentUrl: "",
    estimatedCommentCount: "",
    estimatedLikeCount: "",
    estimatedShareCount: "",
    estimatedViewCount: "",
    id: randomId,
    isFyp: "no",
    kolDisplayName: "",
    kolHandle: "",
    kolId: "",
    platform: "instagram",
    title: "",
  };
}

function getDefaultContentRows() {
  return [createEmptyContentRow()];
}

function normalizeContentUrl(rawUrl: string) {
  const value = rawUrl.trim();

  if (!value) {
    return null;
  }

  const candidate = value.startsWith("http://") || value.startsWith("https://")
    ? value
    : `https://${value.replace(/^\/+/, "")}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function detectContentPlatformFromUrl(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, "");

    if (/^(?:m\.)?instagram\.com$/i.test(hostname) || /^instagr\.am$/i.test(hostname)) {
      return "instagram";
    }

    if (/^(?:vm\.)?tiktok\.com$/i.test(hostname)) {
      return "tiktok";
    }
  } catch {
    return null;
  }

  return null;
}

function getDefaultForm(): CampaignFormState {
  return {
    brand: "",
    budgetIdr: "",
    description: "",
    keywords: "",
    name: "",
    objective: "",
    periodEnd: "",
    periodStart: "",
    postBriefs: "",
    selectedKolIds: [],
    status: "draft",
    targetContentCount: "",
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
const CAMPAIGN_FORM_DRAFT_KEY = "digiwonder:campaigns:form-draft";

type TargetKolTier = { count: number; tier: string };
type CampaignFormDraft = {
  editingId: number | null;
  form: CampaignFormState;
};

function loadCampaignFormDraft() {
  if (typeof window === "undefined") return null;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(CAMPAIGN_FORM_DRAFT_KEY) ?? "null") as CampaignFormDraft | null;
    return parsed?.form ? parsed : null;
  } catch {
    return null;
  }
}

function saveCampaignFormDraft(draft: CampaignFormDraft) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CAMPAIGN_FORM_DRAFT_KEY, JSON.stringify(draft));
  }
}

function clearCampaignFormDraft() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(CAMPAIGN_FORM_DRAFT_KEY);
  }
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function useDebouncedValue<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);

  return debounced;
}

function parseOptionalNumber(value: string) {
  const parsed = Number(value.replace(/[^\d]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
}

function toInputNumber(value: number | null | undefined) {
  return value && Number.isFinite(value) ? String(Math.round(value)) : "";
}

function getRateForContentType(kol: KolRecord | undefined, contentType: ContentFormRow["contentType"]) {
  const key = contentType === "reel" ? "reel" : contentType === "story" ? "story" : "post";
  return kol?.actualRateCard?.[key]?.suggested ?? kol?.estimatedRateCard?.[key]?.suggested ?? null;
}

function getKolContentEstimate(kol: KolRecord | undefined, contentType: ContentFormRow["contentType"]) {
  if (!kol) {
    return {};
  }

  const estimatedViewCount = kol.averageViews || Math.round(kol.totalFollowers * 0.2);
  const estimatedLikeCount = kol.averageLikes || Math.round(estimatedViewCount * 0.04);

  return {
    budgetIdr: toInputNumber(getRateForContentType(kol, contentType)),
    estimatedCommentCount: toInputNumber(estimatedLikeCount * 0.08),
    estimatedLikeCount: toInputNumber(estimatedLikeCount),
    estimatedShareCount: toInputNumber(estimatedLikeCount * 0.04),
    estimatedViewCount: toInputNumber(estimatedViewCount),
  };
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

function formatCurrencyIdr(value: number | null | undefined) {
  if (!value) return "-";
  return new Intl.NumberFormat("id-ID", {
    currency: "IDR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function formatRupiahInput(value: string) {
  const numeric = parseOptionalNumber(value);
  return numeric ? formatCurrencyIdr(numeric) : "";
}

function getOldestContentSyncAt(groups: CampaignDetailRecord["contentsByKol"]) {
  const syncedDates = groups
    .flatMap((group) => group.contents)
    .filter((content) => !content.archivedAt)
    .map((content) => content.syncedAt)
    .filter(Boolean)
    .map((value) => new Date(value as string))
    .filter((date) => !Number.isNaN(date.getTime()));

  if (!syncedDates.length) {
    return null;
  }

  return new Date(Math.min(...syncedDates.map((date) => date.getTime()))).toISOString();
}

function getContentAuthorLabel(content: CampaignContentRecord) {
  return content.authorDisplayName || content.authorHandle || content.kolDisplayName || "-";
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
    archived: "Selesai",
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

function getCampaignProgressDisplay(campaign: CampaignRecord, progress?: CampaignDashboardRecord) {
  const targetContentCount = progress?.targetContentCount ?? campaign.targetContentCount ?? 0;
  const actual = {
    comments: progress?.commentCount ?? 0,
    content: progress?.contentCount ?? 0,
    likes: progress?.likeCount ?? 0,
    posts: progress?.postCount ?? 0,
    reels: progress?.reelCount ?? 0,
    shares: progress?.shareCount ?? 0,
    stories: progress?.storyCount ?? 0,
    views: progress?.viewCount ?? 0,
  };
  const time = getTimeProgress(campaign.periodStart, campaign.periodEnd);
  const estimatedBudget = progress?.budgetUsedIdr ?? 0;
  const contentPercent = targetContentCount > 0 ? clampPercent((actual.content / targetContentCount) * 100) : 0;

  return { actual, budgetIdr: progress?.budgetIdr ?? campaign.budgetIdr ?? 0, budgetUsedIdr: estimatedBudget, contentPercent, daysLeftLabel: time.daysLeftLabel, targetContentCount, timePercent: time.percent };
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
  const [campaignPage, setCampaignPage] = useState(1);
  const [campaignPageSize, setCampaignPageSize] = useState(8);
  const [campaignStatusFilter, setCampaignStatusFilter] = useState<"all" | CampaignRecord["status"]>("active");
  const [contentRows, setContentRows] = useState<ContentFormRow[]>(getDefaultContentRows());
  const [contentRowErrors, setContentRowErrors] = useState<Record<string, ContentRowErrors>>({});
  const [kolSearch, setKolSearch] = useState("");
  const [selectedKeywordFilter, setSelectedKeywordFilter] = useState<string[]>([]);
  const debouncedCampaignSearch = useDebouncedValue(campaignSearch);
  const debouncedKolSearch = useDebouncedValue(kolSearch);
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
    const normalizedSearch = debouncedCampaignSearch.trim().toLowerCase();

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
  }, [debouncedCampaignSearch, campaignStatusFilter, campaigns]);
  const totalCampaignPages = Math.max(1, Math.ceil(filteredCampaigns.length / campaignPageSize));
  const paginatedCampaigns = useMemo(
    () => filteredCampaigns.slice((campaignPage - 1) * campaignPageSize, campaignPage * campaignPageSize),
    [campaignPage, campaignPageSize, filteredCampaigns],
  );

  useEffect(() => {
    setCampaignPage(1);
  }, [debouncedCampaignSearch, campaignStatusFilter]);

  useEffect(() => {
    if (campaignPage > totalCampaignPages) {
      setCampaignPage(totalCampaignPages);
    }
  }, [campaignPage, totalCampaignPages]);

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
    const normalizedSearch = debouncedKolSearch.trim().toLowerCase();
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
}, [kols, debouncedKolSearch, selectedKeywordFilter]);

  const addContent = useMutation({
    mutationFn: (input: { campaignId: number; contents: AddContentPayloadRow[] }) =>
      client.campaign.addContent(input),
    onSuccess: (campaignDetail, variables) => {
      if (!campaignDetail) {
        toast.error("Konten tersimpan, tetapi detail campaign tidak dapat dimuat.");
        setIsAddContentDialogOpen(false);
        setAddContentCampaignId(null);
        setContentRows(getDefaultContentRows());
        setContentRowErrors({});
        return;
      }

      const failedCount = campaignDetail.contentsByKol
        .flatMap((group) => group.contents)
        .filter((content: CampaignContentRecord) => content.syncStatus === "failed").length;

      if (failedCount > 0) {
        toast.error(`Konten tersimpan, tetapi ${failedCount} post gagal di-scrap`);
      } else {
        toast.success("Konten berhasil disimpan");
      }

      setIsAddContentDialogOpen(false);
      setAddContentCampaignId(null);
      setContentRows(getDefaultContentRows());
      setContentRowErrors({});
      campaignsQuery.refetch();
      campaignProgressQuery.refetch();
      kolsQuery.refetch();
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
    mutationFn: (input: CampaignMutationInput) => client.campaign.create(input),
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
    mutationFn: (input: CampaignMutationInput & { id: number }) => client.campaign.update(input),
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

  const syncActiveContent = useMutation({
    mutationFn: () => client.campaign.syncActiveContent(),
    onSuccess: (result) => {
      if (result.total === 0) {
        toast.info("Tidak ada konten aktif yang perlu disinkronkan.");
      } else if (result.failed > 0) {
        toast.error(`${result.synced} konten tersinkron, ${result.failed} gagal.`);
      } else {
        toast.success(`${result.synced} konten aktif berhasil disinkronkan.`);
      }

      campaignsQuery.refetch();
      campaignProgressQuery.refetch();
      if (detailCampaignQuery.isFetched) {
        detailCampaignQuery.refetch();
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal sync konten campaign aktif");
    },
  });

  function resetForm() {
    setEditingId(null);
    setIsDialogOpen(false);
    setForm(getDefaultForm());
    setKolSearch("");
    setSelectedKeywordFilter([]);
    clearCampaignFormDraft();
  }

  function openCreateDialog() {
    const draft = loadCampaignFormDraft();

    setEditingId(draft?.editingId ?? null);
    setForm(draft?.form ?? getDefaultForm());
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
    setContentRowErrors({});
  }

  useEffect(() => {
    if (!isDialogOpen) {
      return;
    }

    saveCampaignFormDraft({ editingId, form });
  }, [editingId, form, isDialogOpen]);

  function updateContentRow(rowId: string, patch: Partial<ContentFormRow>) {
    setContentRows((current) => current.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
    setContentRowErrors((current) => {
      if (!current[rowId]) return current;
      const next = { ...current };
      delete next[rowId];
      return next;
    });
  }

  function applyKolEstimate(row: ContentFormRow, kolId: number | "", contentType = row.contentType) {
    const selectedKol = kolId ? kols.find((kol) => kol.id === Number(kolId)) : undefined;
    return {
      ...getKolContentEstimate(selectedKol, contentType),
      kolDisplayName: selectedKol?.displayName ?? row.kolDisplayName,
    };
  }

  function addContentRow() {
    setContentRows((current) => [...current, createEmptyContentRow()]);
  }

  function removeContentRow(rowId: string) {
    setContentRows((current) => (current.length === 1 ? current : current.filter((row) => row.id !== rowId)));
    setContentRowErrors((current) => {
      const next = { ...current };
      delete next[rowId];
      return next;
    });
  }

  function submitAddContent() {
    if (addContentCampaignId === null) {
      toast.error("Campaign belum dipilih");
      return;
    }

    const nextErrors: Record<string, ContentRowErrors> = {};
    const normalizedRows = contentRows.map((row, index) => {
      const normalizedUrl = row.contentUrl.trim() ? normalizeContentUrl(row.contentUrl) : "";
      const platform = normalizedUrl ? detectContentPlatformFromUrl(normalizedUrl) : null;
      const errors: ContentRowErrors = {};

      if (row.contentType !== "story" && !normalizedUrl) {
        errors.contentUrl = "Link wajib untuk post dan reels.";
      }

      if (row.contentUrl.trim() && (!normalizedUrl || !platform)) {
        errors.contentUrl = "Link harus berasal dari Instagram atau TikTok.";
      }

      if (row.contentType === "story" && !normalizedUrl && !row.kolId && !row.kolDisplayName.trim() && !row.kolHandle.trim()) {
        errors.kol = "Pilih KOL atau isi username untuk story tanpa link.";
      }

      if (!platform && !row.platform) {
        errors.platform = "Pilih platform.";
      }

      if (Object.keys(errors).length) {
        nextErrors[row.id] = errors;
      }

      return Object.keys(errors).length
        ? null
        : {
            budgetIdr: row.budgetIdr ? parseOptionalNumber(row.budgetIdr) : null,
            caption: row.caption,
            contentType: row.contentType,
            contentUrl: normalizedUrl,
            estimatedCommentCount: parseOptionalNumber(row.estimatedCommentCount),
            estimatedLikeCount: parseOptionalNumber(row.estimatedLikeCount),
            estimatedShareCount: parseOptionalNumber(row.estimatedShareCount),
            estimatedViewCount: parseOptionalNumber(row.estimatedViewCount),
            isFyp: row.isFyp === "yes",
            kolDisplayName: row.kolDisplayName,
            kolHandle: row.kolHandle,
            kolId: row.kolId ? Number(row.kolId) : null,
            likeCount: parseOptionalNumber(row.estimatedLikeCount),
            platform: platform ?? row.platform,
            shareCount: parseOptionalNumber(row.estimatedShareCount),
            title: row.title,
            viewCount: parseOptionalNumber(row.estimatedViewCount),
          };
    });

    setContentRowErrors(nextErrors);

    if (normalizedRows.some((row) => row === null)) {
      return;
    }

    const seenUrls = new Set<string>();
    const duplicateRowIndex = normalizedRows.findIndex((row) => {
      if (!row) return false;
      if (!row.contentUrl) return false;
      if (seenUrls.has(row.contentUrl)) return true;
      seenUrls.add(row.contentUrl);
      return false;
    });

    if (duplicateRowIndex >= 0) {
      toast.error(`Baris ${duplicateRowIndex + 1}: link konten duplikat di form.`);
      return;
    }

    setIsAddContentDialogOpen(false);
    addContent.mutate({
      campaignId: addContentCampaignId,
      contents: normalizedRows as AddContentPayloadRow[],
    });
  }

  function editCampaign(campaign: CampaignRecord) {
    setEditingId(campaign.id);
    setForm({
      brand: campaign.brand,
      budgetIdr: toInputNumber(campaign.budgetIdr),
      description: campaign.description,
      keywords: campaign.keywords,
      name: campaign.name,
      objective: getObjectiveText(campaign.objective),
      periodEnd: campaign.periodEnd,
      periodStart: campaign.periodStart,
      postBriefs: campaign.postBriefs,
      selectedKolIds: campaign.kols.map((kol) => kol.id),
      status: getCampaignTemporalStatus(campaign.periodStart, campaign.periodEnd),
      targetContentCount: toInputNumber(campaign.targetContentCount),
      targetFollowerTier: campaign.targetFollowerTier,
      targetKolCount: campaign.targetKolCount,
    });
    setIsDialogOpen(true);
  }

  function submit() {
    const payload = {
      ...form,
      budgetIdr: parseOptionalNumber(form.budgetIdr),
      postBriefs: form.objective,
      status: getCampaignTemporalStatus(form.periodStart, form.periodEnd),
      targetContentCount: parseOptionalNumber(form.targetContentCount),
      targetFollowerTier: encodeTargetKolTiers(parseTargetKolTiers(form.targetFollowerTier)),
      targetKolCount: getTargetKolTotal(parseTargetKolTiers(form.targetFollowerTier)),
    };

    if (editingId) {
      updateCampaign.mutate({ id: editingId, ...payload });
      return;
    }

    createCampaign.mutate(payload);
  }

  async function syncDetailCampaignContents() {
    if (!detailCampaignData) return;

    const activeContents = detailCampaignData.contentsByKol
      .flatMap((group) => group.contents)
      .filter((content) => !content.archivedAt && !content.contentUrl.startsWith("manual://"));

    if (!activeContents.length) {
      toast.info("Tidak ada konten aktif yang bisa disinkronkan.");
      return;
    }

    const toastId = toast.loading("Sinkronisasi campaign berjalan...");

    try {
      await Promise.all(activeContents.map((content) => syncContent.mutateAsync({ id: content.id })));
      toast.success("Konten campaign berhasil disinkronkan.");
      campaignsQuery.refetch();
      campaignProgressQuery.refetch();
      detailCampaignQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyinkronkan campaign.");
    } finally {
      toast.dismiss(toastId);
    }
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
              <div className="flex flex-wrap gap-2 md:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={syncActiveContent.isPending}
                  onClick={() => syncActiveContent.mutate()}
                  className="rounded-none border-[#982E41] bg-white font-semibold text-[#982E41] hover:bg-[#982E41] hover:text-white"
                >
                  {syncActiveContent.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCcw className="mr-2 size-4" />}
                  Sync konten aktif
                </Button>
                <Button type="button" onClick={openCreateDialog} className="rounded-none bg-[#B43C39] font-semibold text-white hover:bg-[#8f2e2c]">
                  <Plus className="mr-2 size-4" />
                  Tambah campaign
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
              <Label className="grid gap-2 text-sm text-[#2b1418]">
                <span>Cari campaign</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#982E41]" />
                  <Input
                    className="pl-9"
                    placeholder="Kucing Mukbang"
                    value={campaignSearch}
                    onChange={(event) => setCampaignSearch(event.target.value)}
                  />
                </div>
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
                </Select>
              </Label>
            </div>

            <div className="space-y-3">
              {campaignsQuery.isLoading || campaignProgressQuery.isLoading ? (
                <CampaignListSkeleton />
              ) : paginatedCampaigns.map((campaign) => {
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
                        label="Konten"
                        percent={progressSummary.contentPercent}
                        meta={`${progressSummary.actual.content} / ${progressSummary.targetContentCount || "-"} konten • ${progressSummary.actual.posts} post • ${progressSummary.actual.reels} reels • ${progressSummary.actual.stories} story • budget ${formatCurrencyIdr(progressSummary.budgetUsedIdr)} / ${formatCurrencyIdr(progressSummary.budgetIdr)}`}
                      />
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                      <MetricStatBadge icon={<Eye className="size-3.5" />} label="Views" value={progressSummary.actual.views} estimated={progress?.estimatedViewCount} />
                      <MetricStatBadge icon={<Heart className="size-3.5" />} label="Likes" value={progressSummary.actual.likes} estimated={progress?.estimatedLikeCount} />
                      <MetricStatBadge icon={<MessageCircle className="size-3.5" />} label="Comments" value={progressSummary.actual.comments} estimated={progress?.estimatedCommentCount} />
                      <MetricStatBadge icon={<Share2 className="size-3.5" />} label="Shares" value={progressSummary.actual.shares} estimated={progress?.estimatedShareCount} />
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

              {!campaignsQuery.isLoading && !campaignProgressQuery.isLoading && filteredCampaigns.length > 0 && (
                <CampaignPaginationControls
                  page={campaignPage}
                  pageSize={campaignPageSize}
                  onPageSizeChange={(nextPageSize) => {
                    setCampaignPageSize(nextPageSize);
                    setCampaignPage(1);
                  }}
                  totalItems={filteredCampaigns.length}
                  totalPages={totalCampaignPages}
                  onPageChange={setCampaignPage}
                />
              )}
            </div>
          </section>
        </div>
      </div>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsDialogOpen(false);
            return;
          }

          setIsDialogOpen(true);
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-hidden text-[#2b1418]">
          <DialogHeader className="px-4 pt-4 sm:px-6 sm:pt-6">
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
              <Label className="grid gap-2 text-xs font-medium uppercase tracking-[0.14em] text-[#982E41]">
                <span>Budget campaign</span>
                <Input
                  inputMode="numeric"
                  placeholder="Rp100.000.000"
                  value={formatRupiahInput(form.budgetIdr)}
                  onChange={(event) => setForm((current) => ({ ...current, budgetIdr: event.target.value.replace(/[^\d]/g, "") }))}
                />
              </Label>
              <FormInput
                label="Target konten"
                placeholder="100"
                value={form.targetContentCount}
                onChange={(targetContentCount) => setForm((current) => ({ ...current, targetContentCount }))}
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
            </section>

            <section className="grid gap-5 border border-[#982E41]/20 bg-white p-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#982E41]">Brief</p>
              </div>

            <div className="md:col-span-2">
              <FormTextarea
                label="Deskripsi"
                value={form.description}
                onChange={(value) => setForm((current) => ({ ...current, description: value }))}
              />
            </div>
            <div className="md:col-span-2">
              <FormTextarea
                label="Brief campaign"
                value={form.objective}
                onChange={(objective) => setForm((current) => ({ ...current, objective, postBriefs: objective }))}
                placeholder="Awareness produk baru untuk audiens Gen Z"
              />
            </div>
            <KeywordTokenInput
              label="Keyword"
              value={form.keywords}
              onChange={(value) => setForm((current) => ({ ...current, keywords: value }))}
            />
            </section>

            <section className="grid gap-3 border border-[#982E41]/20 bg-white p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#982E41]">KOL</p>
              </div>

            <div className="grid gap-2">
              <Label>KOL</Label>

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

              <div className="grid gap-3 border border-border p-3">
                <Select
                  value=""
                  onChange={(event) => {
                    const kolId = Number(event.target.value);
                    if (!kolId) return;
                    setForm((current) => ({
                      ...current,
                      selectedKolIds: current.selectedKolIds.includes(kolId)
                        ? current.selectedKolIds
                        : [...current.selectedKolIds, kolId],
                    }));
                  }}
                >
                  <option value="">Pilih KOL</option>
                  {filteredKols
                    .filter((kol) => !form.selectedKolIds.includes(kol.id))
                    .map((kol) => (
                      <option key={kol.id} value={kol.id}>
                        {kol.displayName}
                      </option>
                    ))}
                </Select>

                <div className="flex min-h-11 flex-wrap gap-2">
                  {form.selectedKolIds.map((kolId) => {
                    const kol = kols.find((item) => item.id === kolId);
                    if (!kol) return null;

                    return (
                      <span key={kolId} className="inline-flex items-center gap-2 border border-[#982E41]/25 bg-[#FFF8F9] px-2 py-1 text-sm text-[#2b1418]">
                        {kol.displayName}
                        <button
                          type="button"
                          className="inline-flex size-6 items-center justify-center text-[#982E41] hover:bg-[#982E41]/10"
                          aria-label={`Hapus ${kol.displayName}`}
                          onClick={() => {
                            setForm((current) => ({
                              ...current,
                              selectedKolIds: current.selectedKolIds.filter((id) => id !== kolId),
                            }));
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </span>
                    );
                  })}
                  {!form.selectedKolIds.length && <span className="text-sm text-muted-foreground">Belum ada KOL dipilih.</span>}
                </div>
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
                          disabled={!detailCampaignData || syncContent.isPending}
                          onClick={() => {
                            syncDetailCampaignContents();
                          }}
                        >
                          {syncContent.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : <RefreshCcw className="mr-1 size-4" />}
                          Sync
                        </Button>
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
                      disabled={!detailCampaignData}
                      onClick={() => {
                        if (detailCampaignData) {
                          downloadCampaignReportPdf(detailCampaignData, campaignProgressById.get(detailCampaignData.id));
                        }
                      }}
                    >
                      <Download className="mr-1 size-4" />
                      Download PDF
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
                  <DetailStat boxed label="Target konten" value={String(detailCampaignSummary?.targetContentCount ?? detailCampaignData?.targetContentCount ?? 0)} />
                  <DetailStat boxed label="Follower tier" value={formatTargetKolTiers(detailCampaignSummary?.targetFollowerTier ?? detailCampaignData?.targetFollowerTier)} />
                  <DetailStat boxed label="Budget campaign" value={formatCurrencyIdr(detailCampaignData.budgetIdr)} />
                  <DetailStat boxed label="Budget digunakan" value={formatCurrencyIdr(campaignProgressById.get(detailCampaignData.id)?.budgetUsedIdr)} />
                  <DetailStat boxed label="Last sync" value={formatHumanDateTime(getOldestContentSyncAt(detailCampaignData.contentsByKol))} />
                </div>

                <div className="grid gap-3">
                  <ObjectiveProgressPanel
                    campaign={detailCampaignData}
                    progress={campaignProgressById.get(detailCampaignData.id)}
                  />
                  <DetailStat boxed label="Keywords" value={<KeywordChips value={detailCampaignData?.keywords ?? detailCampaignSummary?.keywords} />} />
                  <div className="grid gap-3 md:grid-cols-2">
                    <DetailStat boxed label="Created at" value={formatHumanDateTime(detailCampaignSummary?.createdAt ?? detailCampaignData?.createdAt)} />
                    <DetailStat boxed label="Updated at" value={formatHumanDateTime(detailCampaignSummary?.updatedAt ?? detailCampaignData?.updatedAt)} />
                  </div>
                </div>

                <div className="grid gap-3">
                  <DetailStat boxed label="Deskripsi" value={detailCampaignData?.description ?? detailCampaignSummary?.description ?? "-"} />
                </div>

                <details className="group border border-[#982E41]/15 bg-[#FFF8F9] p-3">
                  <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-[#2b1418]">
                    <span className="inline-flex items-center gap-2">
                      <ChevronDown className="size-4 -rotate-90 text-[#982E41] transition-transform group-open:rotate-0" />
                      KOL
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">{detailCampaignData.kols.length} KOL</span>
                  </summary>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {detailCampaignData.kols.map((kol) => (
                      <div key={kol.id} className="flex items-center gap-3 border border-[#982E41]/15 bg-white p-3">
                        {kol.avatarUrl ? (
                          <img
                            src={getAvatarSrc(kol.avatarUrl)}
                            alt={kol.displayName}
                            className="size-11 shrink-0 rounded-full border border-[#982E41]/15 object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="flex size-11 shrink-0 items-center justify-center rounded-full border border-dashed border-[#982E41]/25 bg-[#FFF8F9] text-xs font-semibold text-[#982E41]">
                            {kol.displayName.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-[#2b1418]">{kol.displayName}</p>
                          <p className="mt-1 break-words text-xs text-muted-foreground">
                            {kol.handles.length ? kol.handles.join(" / ") : "Belum ada akun sosial tersimpan."}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              </section>

              <section className="space-y-3">
                <div>
                  <h3 className="text-[15px] font-semibold text-foreground">Konten campaign</h3>
                </div>

                {activeContentGroups.length ? (
                  <div className="space-y-4">
                    {activeContentGroups.map((group) => (
                      <article key={group.kolId} className="border-[1.6px] border-border/70 bg-white p-4 sm:p-5">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="flex min-w-0 items-center gap-3">
                            {group.avatarUrl ? (
                              <img
                                src={getAvatarSrc(group.avatarUrl)}
                                alt={group.displayName}
                                className="size-12 shrink-0 rounded-full border border-[#982E41]/15 object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="flex size-12 shrink-0 items-center justify-center rounded-full border border-dashed border-[#982E41]/25 bg-[#FFF8F9] text-sm font-semibold text-[#982E41]">
                                {group.displayName.slice(0, 1).toUpperCase()}
                              </div>
                            )}
                          <div className="min-w-0">
                            <p className="truncate text-[18px] font-semibold leading-none text-foreground">{group.displayName}</p>
                            <p className="text-[13px] text-muted-foreground">
                              {group.handles.length ? group.handles.join(" / ") : "Tidak ada handle yang tersimpan."}
                            </p>
                          </div>
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
                                                {content.contentType} · {content.platform}
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

                                  {!content.contentUrl.startsWith("manual://") && (
                                    <a
                                      className="text-primary break-all text-xs underline-offset-4 hover:underline"
                                      href={content.contentUrl}
                                      rel="noreferrer"
                                      target="_blank"
                                    >
                                      {content.contentUrl}
                                    </a>
                                  )}
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
                                    aria-label="Hapus konten"
                                    title="Hapus"
                                    disabled={deleteContent.isPending}
                                    onClick={() => {
                                      if (window.confirm("Hapus permanen konten ini?")) {
                                        deleteContent.mutate({ id: content.id });
                                      }
                                    }}
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </div>
                              </div>

                              <div className="grid gap-3 border border-[#982E41]/15 bg-white p-3 md:grid-cols-[104px_minmax(0,1fr)]">
                                {content.thumbnailUrl ? (
                                  <img
                                    src={getAvatarSrc(content.thumbnailUrl)}
                                    alt={content.title || "Preview post"}
                                    className="aspect-square w-full border border-[#982E41]/15 object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="flex aspect-square w-full items-center justify-center border border-dashed border-[#982E41]/25 bg-[#FFF8F9] text-[11px] uppercase tracking-[0.14em] text-[#982E41]">
                                    Preview
                                  </div>
                                )}
                                <div className="min-w-0 space-y-2">
                                  {content.caption && (
                                    <p className="line-clamp-3 text-sm text-[#2b1418]">{content.caption}</p>
                                  )}
                                  <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                                    <span>Author: {getContentAuthorLabel(content)}</span>
                                    <span>Posted: {formatDateTime(content.postedAt)}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                                <DetailStat boxed compact label="Likes" value={formatNumber(content.likeCount)} />
                                <DetailStat boxed compact label="Views" value={formatNumber(content.viewCount)} />
                                <DetailStat boxed compact label="Comments" value={formatNumber(content.commentCount)} />
                                <DetailStat boxed compact label="Shares" value={formatNumber(content.shareCount)} />
                              </div>

                              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                                <DetailStat boxed compact label="Est. views" value={formatNumber(content.estimatedViewCount)} />
                                <DetailStat boxed compact label="Est. likes" value={formatNumber(content.estimatedLikeCount)} />
                                <DetailStat boxed compact label="Est. comments" value={formatNumber(content.estimatedCommentCount)} />
                                <DetailStat boxed compact label="Est. shares" value={formatNumber(content.estimatedShareCount)} />
                              </div>

                              <div className="grid gap-2 text-sm md:grid-cols-2">
                                <DetailStat label="Budget" value={formatCurrencyIdr(content.budgetIdr)} compact />
                                <DetailStat label="FYP" value={content.isFyp ? "Ya" : "Tidak"} compact />
                                <DetailStat label="Posted at" value={formatDateTime(content.postedAt)} compact />
                                <DetailStat label="Synced at" value={formatDateTime(content.syncedAt)} compact />
                                <DetailStat label="Author" value={getContentAuthorLabel(content)} compact />
                                <DetailStat label="Engagement rate" value={content.engagementRate || "-"} compact />
                              </div>

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
                  <details className="group border border-[#982E41]/15 bg-white p-4">
                    <summary className="flex cursor-pointer items-center justify-between gap-3 text-[15px] font-semibold text-foreground">
                      <span className="inline-flex items-center gap-2">
                        <ChevronDown className="size-4 -rotate-90 text-[#982E41] transition-transform group-open:rotate-0" />
                        Arsip konten
                      </span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {archivedContentGroups.reduce((sum, group) => sum + group.contents.length, 0)} post
                      </span>
                    </summary>

                    <div className="mt-4 space-y-4">
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
                                    aria-label="Hapus konten"
                                    title="Hapus"
                                    disabled={deleteContent.isPending}
                                    onClick={() => {
                                      if (window.confirm("Hapus permanen konten ini?")) {
                                        deleteContent.mutate({ id: content.id });
                                      }
                                    }}
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                        </article>
                      ))}
                    </div>
                  </details>
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
          </DialogHeader>

          {!addContentCampaign ? (
            <div className="px-4 pb-4 text-sm text-muted-foreground sm:px-6 sm:pb-6">
              Campaign tidak ditemukan.
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
                  {contentRows.map((row) => (
                    <div key={row.id} className="grid gap-3 rounded-none border border-border p-3">
                      <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
                        <Label className="grid gap-2">
                          <span>Jenis</span>
                          <Select
                            value={row.contentType}
                            onChange={(event) => {
                              const contentType = event.target.value as ContentFormRow["contentType"];
                              updateContentRow(row.id, {
                                contentType,
                                ...applyKolEstimate(row, row.kolId, contentType),
                              });
                            }}
                          >
                            <option value="post">Post</option>
                            <option value="reel">Reels</option>
                            <option value="story">Story</option>
                          </Select>
                        </Label>
                        <Label className="grid gap-2">
                          <span>Link</span>
                          <Input
                            aria-invalid={Boolean(contentRowErrors[row.id]?.contentUrl)}
                            placeholder="https://www.instagram.com/reel/DYyTFReyo3D/"
                            value={row.contentUrl}
                            onChange={(event) => updateContentRow(row.id, { contentUrl: event.target.value })}
                          />
                          {contentRowErrors[row.id]?.contentUrl && (
                            <span className="text-xs font-medium normal-case tracking-normal text-destructive">{contentRowErrors[row.id]?.contentUrl}</span>
                          )}
                        </Label>
                      </div>

                      <details className="group border border-[#982E41]/15 bg-[#FFF8F9] p-3">
                        <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-[#2b1418]">
                          <span className="inline-flex items-center gap-2">
                            <ChevronDown className="size-4 -rotate-90 text-[#982E41] transition-transform group-open:rotate-0" />
                            Detail opsional
                          </span>
                        </summary>
                        <div className="mt-3 grid gap-3">
                          <div className="grid gap-3 md:grid-cols-3">
                            <Label className="grid gap-2">
                              <span>Platform</span>
                              <Select
                                value={row.platform}
                                onChange={(event) => updateContentRow(row.id, { platform: event.target.value as ContentFormRow["platform"] })}
                              >
                                <option value="instagram">Instagram</option>
                                <option value="tiktok">TikTok</option>
                              </Select>
                              {contentRowErrors[row.id]?.platform && (
                                <span className="text-xs font-medium normal-case tracking-normal text-destructive">{contentRowErrors[row.id]?.platform}</span>
                              )}
                            </Label>
                            <Label className="grid gap-2">
                              <span>Budget</span>
                              <Input
                                inputMode="numeric"
                                placeholder="Rp46.000.000"
                                value={formatRupiahInput(row.budgetIdr)}
                                onChange={(event) => updateContentRow(row.id, { budgetIdr: event.target.value.replace(/[^\d]/g, "") })}
                              />
                            </Label>
                            <Label className="grid gap-2">
                              <span>FYP</span>
                              <Select
                                value={row.isFyp}
                                onChange={(event) => updateContentRow(row.id, { isFyp: event.target.value as ContentFormRow["isFyp"] })}
                              >
                                <option value="no">Tidak</option>
                                <option value="yes">Ya</option>
                              </Select>
                            </Label>
                          </div>

                          <div className="grid gap-3 md:grid-cols-3">
                            <Label className="grid gap-2 md:col-span-1">
                              <span>KOL</span>
                              <Select
                                value={row.kolId}
                                onChange={(event) => {
                                  const selected = addContentCampaign.kols.find((kol) => kol.id === Number(event.target.value));
                                  const kolId = event.target.value ? Number(event.target.value) : "";
                                  updateContentRow(row.id, {
                                    ...applyKolEstimate(row, kolId),
                                    kolDisplayName: selected?.displayName ?? row.kolDisplayName,
                                    kolId,
                                  });
                                }}
                              >
                                <option value="">Otomatis dari link</option>
                                {addContentCampaign.kols.map((kol) => (
                                  <option key={kol.id} value={kol.id}>
                                    {kol.displayName}
                                  </option>
                                ))}
                              </Select>
                              {contentRowErrors[row.id]?.kol && (
                                <span className="text-xs font-medium normal-case tracking-normal text-destructive">{contentRowErrors[row.id]?.kol}</span>
                              )}
                            </Label>
                            <FormInput
                              label="Nama KOL manual"
                              placeholder="ITB Official"
                              value={row.kolDisplayName}
                              onChange={(kolDisplayName) => updateContentRow(row.id, { kolDisplayName })}
                            />
                            <FormInput
                              label="Username manual"
                              placeholder="@itb1920"
                              value={row.kolHandle}
                              onChange={(kolHandle) => updateContentRow(row.id, { kolHandle })}
                            />
                          </div>

                          <div className="grid gap-3 md:grid-cols-4">
                            <FormInput label="Est. views" placeholder="75000" value={row.estimatedViewCount} onChange={(estimatedViewCount) => updateContentRow(row.id, { estimatedViewCount })} />
                            <FormInput label="Est. likes" placeholder="4200" value={row.estimatedLikeCount} onChange={(estimatedLikeCount) => updateContentRow(row.id, { estimatedLikeCount })} />
                            <FormInput label="Est. comments" placeholder="650" value={row.estimatedCommentCount} onChange={(estimatedCommentCount) => updateContentRow(row.id, { estimatedCommentCount })} />
                            <FormInput label="Est. shares" placeholder="320" value={row.estimatedShareCount} onChange={(estimatedShareCount) => updateContentRow(row.id, { estimatedShareCount })} />
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <FormInput label="Judul/catatan" placeholder="Story mention produk" value={row.title} onChange={(title) => updateContentRow(row.id, { title })} />
                            <FormTextarea
                              label="Caption/manual note"
                              placeholder="Caption singkat"
                              value={row.caption}
                              onChange={(caption) => updateContentRow(row.id, { caption })}
                            />
                          </div>
                        </div>
                      </details>

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          aria-label="Hapus baris konten"
                          title="Hapus"
                          disabled={contentRows.length === 1}
                          onClick={() => removeContentRow(row.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
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


function ProgressBlock({ hideBar = false, label, meta, percent }: { hideBar?: boolean; label: string; meta: string; percent: number }) {
  return (
    <div className="border border-[#982E41]/20 bg-white p-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#982E41]">{label}</p>
          <p className="text-xs text-muted-foreground">{meta}</p>
        </div>
        {!hideBar && <span className="text-2xl font-semibold text-[#2b1418]">{percent}%</span>}
      </div>
      {!hideBar && (
        <div className="mt-2 h-2 overflow-hidden bg-[#F2DDE2]">
          <div className="h-full bg-[#982E41]" style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}

function ObjectiveProgressPanel({ campaign, progress }: { campaign: CampaignDetailRecord | CampaignRecord; progress?: CampaignDashboardRecord }) {
  const display = getCampaignProgressDisplay(campaign as CampaignRecord, progress);

  return (
    <div className="space-y-4 border-[1.6px] border-[#982E41]/20 bg-[#FFF8F9] p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <ProgressBlock
          label="Progress waktu"
          percent={display.timePercent}
          meta={`${formatHumanDate(campaign.periodStart)} → ${formatHumanDate(campaign.periodEnd)} • ${display.daysLeftLabel}`}
        />
        <ProgressBlock
          label="Konten"
          percent={display.contentPercent}
          meta={`${display.actual.content} / ${display.targetContentCount || "-"} konten • ${display.actual.posts} post • ${display.actual.reels} reels • ${display.actual.stories} story`}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricStatBadge icon={<Eye className="size-3.5" />} label="Views" value={display.actual.views} estimated={progress?.estimatedViewCount} />
        <MetricStatBadge icon={<Heart className="size-3.5" />} label="Likes" value={display.actual.likes} estimated={progress?.estimatedLikeCount} />
        <MetricStatBadge icon={<MessageCircle className="size-3.5" />} label="Comments" value={display.actual.comments} estimated={progress?.estimatedCommentCount} />
        <MetricStatBadge icon={<Share2 className="size-3.5" />} label="Shares" value={display.actual.shares} estimated={progress?.estimatedShareCount} />
      </div>
    </div>
  );
}

function MetricStatBadge({ estimated = 0, icon, label, value }: { estimated?: number; icon: ReactNode; label: string; value: number }) {
  return (
    <div className="border border-[#982E41]/25 bg-white px-3 py-2 text-xs text-[#2b1418]">
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex items-center gap-1 font-semibold uppercase tracking-[0.14em] text-[#982E41]">{icon}{label}</span>
      </div>
      <p className="mt-1 text-muted-foreground">
        {formatNumber(value)} actual{estimated ? ` • est. ${formatNumber(estimated)}` : ""}
      </p>
    </div>
  );
}

function CampaignPaginationControls({
  onPageChange,
  onPageSizeChange,
  page,
  pageSize,
  totalItems,
  totalPages,
}: {
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}) {
  const start = totalItems ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-col gap-3 border border-[#982E41]/15 bg-white px-4 py-3 text-sm text-[#2b1418] sm:flex-row sm:items-center sm:justify-between">
      <span className="text-xs text-muted-foreground">
        {start}-{end} dari {totalItems}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="h-8 w-24"
          value={String(pageSize)}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {[4, 8, 12, 20].map((size) => (
            <option key={size} value={size}>
              {size} / page
            </option>
          ))}
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          Sebelumnya
        </Button>
        <Input
          aria-label="Halaman campaign"
          className="h-8 w-16 text-center"
          min={1}
          max={totalPages}
          type="number"
          value={page}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) {
              onPageChange(Math.min(totalPages, Math.max(1, next)));
            }
          }}
        />
        <span className="text-xs text-muted-foreground">/ {totalPages}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        >
          Berikutnya
        </Button>
      </div>
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

function BrandInput({ onChange, options, value }: { onChange: (value: string) => void; options: string[]; value: string }) {
  return (
    <label className="grid gap-2 text-xs font-medium uppercase tracking-[0.14em] text-[#982E41]">
      <span>Brand</span>
      <Input
        className="border-[#b43c39]/20 bg-white text-[#2b1418] placeholder:text-[#A16A75] focus-visible:border-[#B43C39] focus-visible:ring-[#B43C39]/15"
        list="campaign-brand-options"
        onChange={(event) => onChange(event.target.value)}
        placeholder="DigiWonder"
        value={value}
      />
      <datalist id="campaign-brand-options">
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
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

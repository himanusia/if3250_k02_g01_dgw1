import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Archive, ArchiveRestore, CalendarIcon, ChevronDown, Download, Eye, Heart, Instagram, Loader2, MessageCircle, PencilLine, Plus, RefreshCcw, Search, Share2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";

import type { CampaignContentRecord, CampaignDashboardRecord, CampaignDetailRecord, CampaignRecord, KolRecord } from "@/lib/app-types";
import { splitCampaignContentsByArchiveState } from "@/lib/campaign-content-archive";
import { getObjectiveText } from "@/lib/campaign-objective";
import { downloadCampaignReportPdf } from "@/lib/campaign-report-pdf";
import { formatDateTime, formatNumber, getAvatarSrc } from "@/lib/kol-utils";
import { arrayFromQueryData } from "@/lib/query-data";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
  targetPostCount: string;
  targetReelCount: string;
  targetStoryCount: string;
  targetContentCount: string;
  targetFollowerTier: string;
  targetKolCount: number;
};

type CampaignMutationInput = Omit<CampaignFormState, "budgetIdr" | "targetContentCount" | "targetPostCount" | "targetReelCount" | "targetStoryCount"> & {
  budgetIdr: number;
  targetPostCount: number;
  targetReelCount: number;
  targetStoryCount: number;
  targetContentCount: number;
};

type CampaignListResponse = {
  items: CampaignRecord[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

function toDateInputValue(date: Date | undefined) {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  contentType: "" | "post" | "reel" | "story";
  contentUrl: string;
  estimatedCommentCount: string;
  estimatedLikeCount: string;
  estimatedShareCount: string;
  estimatedViewCount: string;
  id: string;
  isFyp: "" | "yes" | "no";
  kolDisplayName: string;
  kolHandle: string;
  kolId: number | "";
  platform: "" | "instagram" | "tiktok";
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

type ContentEditFormState = {
  budgetIdr: string;
  estimatedCommentCount: string;
  estimatedLikeCount: string;
  estimatedShareCount: string;
  estimatedViewCount: string;
  isFyp: "" | "yes" | "no";
};

type ContentRowErrors = Partial<Record<"contentType" | "contentUrl" | "kol" | "platform", string>>;
type RpcLikeError = {
  code?: string;
  data?: {
    reason?: string;
    issues?: Array<{
      message: string;
      path?: Array<string | number>;
    }>;
  };
  message?: string;
};

function createEmptyContentRow(): ContentFormRow {
  const randomId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    budgetIdr: "",
    caption: "",
    contentType: "",
    contentUrl: "",
    estimatedCommentCount: "",
    estimatedLikeCount: "",
    estimatedShareCount: "",
    estimatedViewCount: "",
    id: randomId,
    isFyp: "",
    kolDisplayName: "",
    kolHandle: "",
    kolId: "",
    platform: "",
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

function detectContentTypeFromUrl(url: string): AddContentPayloadRow["contentType"] {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();

    if (path.includes("/reel/") || path.includes("/video/")) {
      return "reel";
    }

    if (path.includes("/stories/")) {
      return "story";
    }
  } catch {
    return "post";
  }

  return "post";
}

function getSocialPlatformLabel(platform: Exclude<ContentFormRow["platform"], "">) {
  return platform === "instagram" ? "Instagram" : "TikTok";
}

function SocialPlatformIcon({ platform, className = "size-3.5" }: { platform: Exclude<ContentFormRow["platform"], "">; className?: string }) {
  if (platform === "instagram") {
    return <Instagram className={className} aria-hidden="true" />;
  }

  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.5 3.2c.4 2.4 1.8 3.9 4.1 4.1v3.1c-1.4.1-2.7-.3-4-1.1v5.9c0 4.2-2.7 6.6-6.2 6.6-3.1 0-5.6-2.1-5.6-5.2 0-3.4 2.6-5.6 6.3-5.4v3.2c-1.8-.3-3 .5-3 2 0 1.3 1 2.1 2.2 2.1 1.4 0 2.5-.8 2.5-3V3.2h3.7Z" />
    </svg>
  );
}

function parseCampaignSocialHandle(value: string) {
  const match = value.trim().match(/^(instagram|tiktok)\s*:?\s*@?(.+)$/i);

  if (!match) {
    return null;
  }

  const platform = match[1]!.toLowerCase() as ContentFormRow["platform"];
  const handle = match[2]!.replace(/^@/, "").trim();

  if (!handle) {
    return null;
  }

  return { handle, platform };
}

function SocialHandleList({ emptyLabel, handles }: { emptyLabel: string; handles: string[] }) {
  if (!handles.length) {
    return <span>{emptyLabel}</span>;
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {handles.map((handle, index) => {
        const parsed = parseCampaignSocialHandle(handle);

        if (!parsed) {
          return <span key={`${handle}-${index}`}>{handle}</span>;
        }

        return (
          <span
            key={`${parsed.platform}-${parsed.handle}-${index}`}
            className="inline-flex items-center gap-1"
            aria-label={`${getSocialPlatformLabel(parsed.platform)} @${parsed.handle}`}
            title={`${getSocialPlatformLabel(parsed.platform)} @${parsed.handle}`}
          >
            <SocialPlatformIcon platform={parsed.platform} />
            <span>@{parsed.handle}</span>
          </span>
        );
      })}
    </span>
  );
}

function ContentPlatformBadge({ contentType, platform }: { contentType: string; platform: Exclude<ContentFormRow["platform"], ""> }) {
  return (
    <span className="inline-flex items-center gap-1.5 border-border text-muted-foreground border px-2 py-0.5 text-[11px] uppercase tracking-[0.2em]">
      <SocialPlatformIcon platform={platform} />
      <span>{contentType} · {getSocialPlatformLabel(platform)}</span>
    </span>
  );
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
    targetPostCount: "",
    targetReelCount: "",
    targetStoryCount: "",
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
const CAMPAIGN_STATUS_OPTIONS = [
  { label: "Semua status", value: "all" },
  { label: "Belum mulai", value: "draft" },
  { label: "Berjalan", value: "active" },
  { label: "Selesai", value: "completed" },
] as const;
const CONTENT_TYPE_OPTIONS = [
  { label: "Post", value: "post" },
  { label: "Reels", value: "reel" },
  { label: "Story", value: "story" },
] as const;
const CONTENT_PLATFORM_OPTIONS = [
  { label: "Instagram", value: "instagram" },
  { label: "TikTok", value: "tiktok" },
] as const;
const FYP_OPTIONS = [
  { label: "Tidak", value: "no" },
  { label: "Ya", value: "yes" },
] as const;
const CAMPAIGN_PAGE_SIZE_OPTIONS = [4, 8, 12, 20].map((size) => ({
  label: `${size} / page`,
  value: String(size),
}));
const CAMPAIGN_FORM_DRAFT_KEY = "digiwonder:campaigns:form-draft";
const ADD_CONTENT_FORM_DRAFT_KEY = "digiwonder:campaigns:add-content-draft";

type TargetKolTier = { count: number; tier: string };
type CampaignFormDraft = {
  editingId: number | null;
  form: CampaignFormState;
};
type AddContentFormDraft = {
  campaignId: number;
  rows: ContentFormRow[];
};
type PendingAddContentRow = {
  campaignId: number;
  contentType: AddContentPayloadRow["contentType"];
  contentUrl: string;
  id: string;
  platform: AddContentPayloadRow["platform"];
  submittedAt: number;
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

function loadAddContentFormDraft(campaignId: number) {
  if (typeof window === "undefined") return null;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(ADD_CONTENT_FORM_DRAFT_KEY) ?? "null") as AddContentFormDraft | null;
    return parsed?.campaignId === campaignId && Array.isArray(parsed.rows) && parsed.rows.length ? parsed.rows : null;
  } catch {
    return null;
  }
}

function saveAddContentFormDraft(draft: AddContentFormDraft) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ADD_CONTENT_FORM_DRAFT_KEY, JSON.stringify(draft));
  }
}

function clearAddContentFormDraft() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(ADD_CONTENT_FORM_DRAFT_KEY);
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

function sanitizeIntegerInput(value: string) {
  return value.replace(/[^\d]/g, "");
}

function isPlaceholderKol(kol: Pick<KolRecord, "displayName" | "accounts">) {
  return kol.displayName.trim().toLowerCase() === "kol belum terdaftar" && !kol.accounts.length;
}

function getCampaignErrorMessage(error: unknown, fallback: string) {
  const rpcError = error as RpcLikeError;
  const issue = rpcError?.data?.issues?.[0];

  if (issue?.message) {
    const path = issue.path?.length ? `${issue.path.join(".")}: ` : "";
    return `${path}${issue.message}`;
  }

  if (rpcError?.data?.reason === "CONTENT_TYPE_REQUIRED") {
    return rpcError.message || "Pilih jenis konten.";
  }

  return error instanceof Error ? error.message : fallback;
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

  return Array.from(result, ([tier, count]) => ({ tier, count })).filter((item) => item.count > 0);
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
  const [editingContentId, setEditingContentId] = useState<number | null>(null);
  const [contentEditForm, setContentEditForm] = useState<ContentEditFormState>({
    budgetIdr: "",
    estimatedCommentCount: "",
    estimatedLikeCount: "",
    estimatedShareCount: "",
    estimatedViewCount: "",
    isFyp: "",
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState<CampaignFormState>(getDefaultForm());
  const [campaignSearch, setCampaignSearch] = useState("");
  const [campaignPage, setCampaignPage] = useState(1);
  const [campaignPageSize, setCampaignPageSize] = useState(8);
  const [campaignStatusFilter, setCampaignStatusFilter] = useState<"all" | CampaignRecord["status"]>("active");
  const [contentRows, setContentRows] = useState<ContentFormRow[]>(getDefaultContentRows());
  const [contentRowErrors, setContentRowErrors] = useState<Record<string, ContentRowErrors>>({});
  const [pendingAddContentRows, setPendingAddContentRows] = useState<PendingAddContentRow[]>([]);
  const debouncedCampaignSearch = useDebouncedValue(campaignSearch);
  const campaignsQuery = useQuery(orpc.campaign.list.queryOptions({ input: { page: campaignPage, pageSize: campaignPageSize, search: debouncedCampaignSearch, status: campaignStatusFilter } }));
  const campaignProgressQuery = useQuery(orpc.campaign.dashboard.queryOptions());
  const kolsQuery = useQuery(orpc.kol.list.queryOptions());
  const detailCampaignQuery = useQuery({
    ...orpc.campaign.getById.queryOptions({ input: { id: detailCampaignId ?? 0 } }),
    enabled: isDetailDialogOpen && detailCampaignId !== null,
  });
  const campaigns = arrayFromQueryData<CampaignRecord>(campaignsQuery.data);
  const campaignsResponseRaw = campaignsQuery.data as CampaignListResponse | undefined;
  const campaignsResponse: CampaignListResponse = {
    items: campaigns,
    page: campaignsResponseRaw?.page ?? campaignPage,
    pageSize: campaignsResponseRaw?.pageSize ?? campaignPageSize,
    totalItems: campaignsResponseRaw?.totalItems ?? campaigns.length,
    totalPages: campaignsResponseRaw?.totalPages ?? Math.max(1, Math.ceil(campaigns.length / campaignPageSize)),
  };
  const campaignProgressRows = arrayFromQueryData<CampaignDashboardRecord>(campaignProgressQuery.data);
  const campaignProgressById = useMemo(
    () => new Map(campaignProgressRows.map((campaign) => [campaign.id, campaign])),
    [campaignProgressRows],
  );
  const kols = arrayFromQueryData<KolRecord>(kolsQuery.data);
  const selectableKols = useMemo(() => kols.filter((kol) => !isPlaceholderKol(kol)), [kols]);
  const detailCampaignData = (detailCampaignQuery.data as CampaignDetailRecord | null | undefined) ?? null;
  const detailCampaignProgress = detailCampaignData ? campaignProgressById.get(detailCampaignData.id) : undefined;

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
  const keywordOptions = useMemo(() => {
    return Array.from(new Set([
      ...campaigns.flatMap((campaign) => parseKeywordTokens(campaign.keywords)),
      ...kols.flatMap((kol) => parseKeywordTokens(kol.keywords)),
    ]))
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
  }, [campaigns, kols]);

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

  const totalCampaignPages = campaignsResponse.totalPages;
  const paginatedCampaigns = campaigns;

  useEffect(() => {
    setCampaignPage(1);
  }, [debouncedCampaignSearch, campaignStatusFilter]);

  useEffect(() => {
    if (campaignPage > totalCampaignPages) {
      setCampaignPage(totalCampaignPages);
    }
  }, [campaignPage, totalCampaignPages]);

  const pendingUrlsForDetail = useMemo(() => {
    if (!detailCampaignData) return new Set<string>();

    return new Set(
      pendingAddContentRows
        .filter((row) => row.campaignId === detailCampaignData.id)
        .map((row) => row.contentUrl),
    );
  }, [detailCampaignData, pendingAddContentRows]);

  const { activeContentGroups, archivedContentGroups } = useMemo(() => {
    const activeGroups: CampaignDetailRecord["contentsByKol"] = [];
    const archivedGroups: CampaignDetailRecord["contentsByKol"] = [];

    for (const group of detailCampaignData?.contentsByKol ?? []) {
      const { activeContents, archivedContents } = splitCampaignContentsByArchiveState(group.contents);
      const visibleActiveContents = activeContents.filter(
        (content) => !(pendingUrlsForDetail.has(content.contentUrl) && content.syncStatus === "pending"),
      );

      if (visibleActiveContents.length) {
        activeGroups.push({ ...group, contents: visibleActiveContents });
      }

      if (archivedContents.length) {
        archivedGroups.push({ ...group, contents: archivedContents });
      }
    }

    return { activeContentGroups: activeGroups, archivedContentGroups: archivedGroups };
  }, [detailCampaignData, pendingUrlsForDetail]);
  const pendingDetailContentRows = useMemo(() => {
    if (!detailCampaignData) return [];
    const contentByUrl = new Map(
      detailCampaignData.contentsByKol.flatMap((group) => group.contents.map((content) => [content.contentUrl, content] as const)),
    );

    return pendingAddContentRows.filter((row) => {
      if (row.campaignId !== detailCampaignData.id) return false;
      const content = contentByUrl.get(row.contentUrl);
      return !content || content.syncStatus === "pending";
    });
  }, [detailCampaignData, pendingAddContentRows]);
  const detailKolTierRows = useMemo(() => {
    if (!detailCampaignData) {
      return TARGET_KOL_TIERS.map(({ key, label }) => ({ actual: 0, key, label, target: 0 }));
    }

    const targets = new Map(parseTargetKolTiers(detailCampaignData.targetFollowerTier).map((tier) => [tier.tier, tier.count]));
    const selectedKolIds = new Set(detailCampaignData.kols.map((kol) => kol.id));
    const actuals = new Map(TARGET_KOL_TIERS.map(({ key }) => [key, 0]));

    selectableKols.forEach((kol) => {
      if (selectedKolIds.has(kol.id) && actuals.has(kol.followerTier)) {
        actuals.set(kol.followerTier, (actuals.get(kol.followerTier) ?? 0) + 1);
      }
    });

    return TARGET_KOL_TIERS.map(({ key, label }) => ({
      actual: actuals.get(key) ?? 0,
      key,
      label,
      target: targets.get(key) ?? 0,
    }));
  }, [detailCampaignData, selectableKols]);

  const addContent = useMutation({
    mutationFn: (input: { campaignId: number; contents: AddContentPayloadRow[] }) =>
      client.campaign.addContent(input),
    onSuccess: (campaignDetail, variables) => {
      if (!campaignDetail) {
        toast.error("Konten tersimpan, tetapi detail campaign tidak dapat dimuat.");
        setAddContentCampaignId(null);
        setContentRows(getDefaultContentRows());
        setContentRowErrors({});
        clearAddContentFormDraft();
        return;
      }

      const returnedContentUrls = new Set(campaignDetail.contentsByKol.flatMap((group) => group.contents.map((content) => content.contentUrl)));
      const missingSubmittedUrls = variables.contents
        .map((content) => content.contentUrl)
        .filter((contentUrl) => contentUrl && !contentUrl.startsWith("manual://") && !returnedContentUrls.has(contentUrl));

      if (missingSubmittedUrls.length) {
        toast.error(
          missingSubmittedUrls.length === 1
            ? "Konten gagal diambil dan sudah dihapus."
            : `${missingSubmittedUrls.length} konten gagal diambil dan sudah dihapus.`,
        );
        setPendingAddContentRows((current) =>
          current.filter((row) => row.campaignId !== variables.campaignId || !missingSubmittedUrls.includes(row.contentUrl)),
        );
      } else {
        toast.info("Konten sedang diproses. Nilai akan muncul setelah sinkronisasi selesai.");
      }

      setAddContentCampaignId(null);
      setContentRows(getDefaultContentRows());
      setContentRowErrors({});
      clearAddContentFormDraft();
      campaignsQuery.refetch();
      campaignProgressQuery.refetch();
      kolsQuery.refetch();
      setDetailCampaignId(variables.campaignId);
      setIsDetailDialogOpen(true);
      if (typeof window !== "undefined") {
        for (const delay of [5_000, 15_000, 60_000, 120_000]) {
          window.setTimeout(() => {
            campaignsQuery.refetch();
            campaignProgressQuery.refetch();
            kolsQuery.refetch();
            if (detailCampaignQuery.isFetched) {
              detailCampaignQuery.refetch();
            }
          }, delay);
        }
      }
    },
    onError: (error) => {
      if (addContentCampaignId !== null) {
        setPendingAddContentRows((current) => current.filter((row) => row.campaignId !== addContentCampaignId));
      }
      toast.error(getCampaignErrorMessage(error, "Gagal menambahkan konten"));
    },
  });

  const updateContent = useMutation({
    mutationFn: (input: {
      budgetIdr: number | null;
      estimatedCommentCount: number;
      estimatedLikeCount: number;
      estimatedShareCount: number;
      estimatedViewCount: number;
      id: number;
      isFyp: boolean | null;
    }) => client.campaign.updateContent(input),
    onSuccess: () => {
      toast.success("Konten berhasil diperbarui.");
      setEditingContentId(null);
      campaignsQuery.refetch();
      campaignProgressQuery.refetch();
      detailCampaignQuery.refetch();
    },
    onError: (error) => {
      toast.error(getCampaignErrorMessage(error, "Gagal memperbarui konten"));
    },
  });

  useEffect(() => {
    if (!detailCampaignData || !pendingAddContentRows.length) return;

    const contentByUrl = new Map(
      detailCampaignData.contentsByKol.flatMap((group) => group.contents.map((content) => [content.contentUrl, content] as const)),
    );
    const rowsToRemove = new Set<string>();
    let completedCount = 0;
    let failedCount = 0;
    const now = Date.now();

    for (const row of pendingAddContentRows) {
      if (row.campaignId !== detailCampaignData.id) continue;

      const content = contentByUrl.get(row.contentUrl);

      if (content?.syncStatus === "success") {
        rowsToRemove.add(row.id);
        completedCount += 1;
        continue;
      }

      if (content?.syncStatus === "failed" || (!content && now - row.submittedAt > 12_000)) {
        rowsToRemove.add(row.id);
        failedCount += 1;
      }
    }

    if (!rowsToRemove.size) return;

    setPendingAddContentRows((current) => current.filter((row) => !rowsToRemove.has(row.id)));

    if (failedCount > 0) {
      toast.error(failedCount === 1 ? "Konten gagal diambil dan sudah dihapus." : `${failedCount} konten gagal diambil dan sudah dihapus.`);
      return;
    }

    if (completedCount > 0) {
      toast.success(completedCount === 1 ? "Konten berhasil disinkronkan." : `${completedCount} konten berhasil disinkronkan.`);
    }
  }, [detailCampaignData, pendingAddContentRows]);

  useEffect(() => {
    if (!detailCampaignData) return;

    const fallbackSyncContents = detailCampaignData.contentsByKol
      .flatMap((group) => group.contents)
      .filter((content) => content.syncStatus === "pending" && !content.contentUrl.startsWith("manual://") && !pendingContentSyncIds.has(content.id));

    if (!fallbackSyncContents.length) return;

    const timeout = window.setTimeout(() => {
      setPendingContentSyncIds((current) => {
        const next = new Set(current);
        fallbackSyncContents.forEach((content) => next.add(content.id));
        return next;
      });

      void Promise.allSettled(fallbackSyncContents.map((content) => client.campaign.syncContent({ id: content.id }))).then((results) => {
        const failed = results.filter((result) => result.status === "rejected").length;

        setPendingContentSyncIds((current) => {
          const next = new Set(current);
          fallbackSyncContents.forEach((content) => next.delete(content.id));
          return next;
        });

        if (failed > 0) {
          toast.error(failed === 1 ? "Konten gagal diambil dan sudah dihapus." : `${failed} konten gagal diambil dan sudah dihapus.`);
        }

        campaignsQuery.refetch();
        campaignProgressQuery.refetch();
        detailCampaignQuery.refetch();
        kolsQuery.refetch();
      });
    }, 20_000);

    return () => window.clearTimeout(timeout);
  }, [campaignProgressQuery, campaignsQuery, detailCampaignData, detailCampaignQuery, kolsQuery, pendingContentSyncIds]);

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
      toast.error(getCampaignErrorMessage(error, "Gagal melakukan sync konten"));
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
      toast.error(getCampaignErrorMessage(error, "Gagal mengarsipkan konten"));
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
      toast.error(getCampaignErrorMessage(error, "Gagal mengembalikan konten"));
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
      toast.error(getCampaignErrorMessage(error, "Gagal menghapus konten"));
    },
  });

  const createCampaign = useMutation({
    mutationFn: (input: CampaignMutationInput) => client.campaign.create(input),
    onSuccess: () => {
      toast.success("Campaign berhasil dibuat");
      campaignsQuery.refetch();
      resetForm();
    },
    onError: (error) => {
      toast.error(getCampaignErrorMessage(error, "Gagal membuat campaign"));
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
      toast.error(getCampaignErrorMessage(error, "Gagal memperbarui campaign"));
    },
  });

  const deleteCampaign = useMutation({
    mutationFn: ({ id }: { id: number }) => client.campaign.delete({ id }),
    onSuccess: () => {
      toast.success("Campaign berhasil dihapus");
      campaignsQuery.refetch();
    },
    onError: (error) => {
      toast.error(getCampaignErrorMessage(error, "Gagal menghapus campaign"));
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
      toast.error(getCampaignErrorMessage(error, "Gagal sync konten campaign aktif"));
    },
  });

  function resetForm() {
    setEditingId(null);
    setIsDialogOpen(false);
    setForm(getDefaultForm());
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
    setContentRows(loadAddContentFormDraft(campaignId) ?? getDefaultContentRows());
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

  useEffect(() => {
    if (!isAddContentDialogOpen || addContentCampaignId === null) {
      return;
    }

    saveAddContentFormDraft({ campaignId: addContentCampaignId, rows: contentRows });
  }, [addContentCampaignId, contentRows, isAddContentDialogOpen]);

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
    const normalizedRows = contentRows.map((row) => {
      const normalizedUrl = row.contentUrl.trim() ? normalizeContentUrl(row.contentUrl) : "";
      const platform = normalizedUrl ? detectContentPlatformFromUrl(normalizedUrl) : row.platform || null;
      const detectedContentType = normalizedUrl ? detectContentTypeFromUrl(normalizedUrl) : null;
      const contentType = detectedContentType || row.contentType || null;
      const errors: ContentRowErrors = {};

      if (!contentType) {
        errors.contentType = "Pilih jenis konten.";
      }

      if (contentType !== "story" && !normalizedUrl) {
        errors.contentUrl = "Link wajib untuk post dan reels.";
      }

      if (row.contentUrl.trim() && (!normalizedUrl || !platform)) {
        errors.contentUrl = "Link harus berasal dari Instagram atau TikTok.";
      }

      if (contentType === "story" && !normalizedUrl && !row.kolId) {
        errors.kol = "Pilih KOL untuk story tanpa link.";
      }

      if (!platform) {
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
            contentType: contentType!,
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
            platform,
            shareCount: parseOptionalNumber(row.estimatedShareCount),
            title: "",
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

    const payloadRows = normalizedRows as AddContentPayloadRow[];
    const optimisticRows = payloadRows
      .filter((row) => row.contentUrl && !row.contentUrl.startsWith("manual://"))
      .map((row, index) => ({
        campaignId: addContentCampaignId,
        contentType: row.contentType,
        contentUrl: row.contentUrl,
        id: `${Date.now()}-${index}-${row.contentUrl}`,
        platform: row.platform,
        submittedAt: Date.now(),
      }));

    setPendingAddContentRows((current) => [...current, ...optimisticRows]);
    setDetailCampaignId(addContentCampaignId);
    setIsDetailDialogOpen(true);
    setIsAddContentDialogOpen(false);
    addContent.mutate({
      campaignId: addContentCampaignId,
      contents: payloadRows,
    });
  }

  function openContentEdit(content: CampaignContentRecord) {
    setEditingContentId(content.id);
    setContentEditForm({
      budgetIdr: toInputNumber(content.budgetIdr),
      estimatedCommentCount: toInputNumber(content.estimatedCommentCount),
      estimatedLikeCount: toInputNumber(content.estimatedLikeCount),
      estimatedShareCount: toInputNumber(content.estimatedShareCount),
      estimatedViewCount: toInputNumber(content.estimatedViewCount),
      isFyp: content.isFyp ? "yes" : "no",
    });
  }

  function updateContentEditField<K extends keyof ContentEditFormState>(key: K, value: ContentEditFormState[K]) {
    setContentEditForm((current) => ({ ...current, [key]: value }));
  }

  function submitContentEdit(contentId: number) {
    updateContent.mutate({
      budgetIdr: contentEditForm.budgetIdr ? parseOptionalNumber(contentEditForm.budgetIdr) : null,
      estimatedCommentCount: parseOptionalNumber(contentEditForm.estimatedCommentCount),
      estimatedLikeCount: parseOptionalNumber(contentEditForm.estimatedLikeCount),
      estimatedShareCount: parseOptionalNumber(contentEditForm.estimatedShareCount),
      estimatedViewCount: parseOptionalNumber(contentEditForm.estimatedViewCount),
      id: contentId,
      isFyp: contentEditForm.isFyp === "" ? null : contentEditForm.isFyp === "yes",
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
      selectedKolIds: campaign.kols
        .filter((kol) => kol.displayName.trim().toLowerCase() !== "kol belum terdaftar")
        .map((kol) => kol.id),
      status: getCampaignTemporalStatus(campaign.periodStart, campaign.periodEnd),
      targetPostCount: toInputNumber(campaign.targetPostCount),
      targetReelCount: toInputNumber(campaign.targetReelCount),
      targetStoryCount: toInputNumber(campaign.targetStoryCount),
      targetContentCount: toInputNumber(campaign.targetContentCount),
      targetFollowerTier: campaign.targetFollowerTier,
      targetKolCount: campaign.targetKolCount,
    });
    setIsDialogOpen(true);
  }

  function submit() {
    const targetPostCount = parseOptionalNumber(form.targetPostCount);
    const targetReelCount = parseOptionalNumber(form.targetReelCount);
    const targetStoryCount = parseOptionalNumber(form.targetStoryCount);

    const payload = {
      ...form,
      budgetIdr: parseOptionalNumber(form.budgetIdr),
      postBriefs: form.objective,
      status: getCampaignTemporalStatus(form.periodStart, form.periodEnd),
      targetPostCount,
      targetReelCount,
      targetStoryCount,
      targetContentCount: targetPostCount + targetReelCount + targetStoryCount,
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
      const synced = await Promise.all(activeContents.map((content) => client.campaign.syncContent({ id: content.id })));
      const failed = synced.filter((content) => content.syncStatus === "failed").length;
      if (failed > 0) {
        toast.error(`${synced.length - failed} konten tersinkron, ${failed} gagal.`);
      } else {
        toast.success("Konten campaign berhasil disinkronkan.");
      }
      campaignsQuery.refetch();
      campaignProgressQuery.refetch();
      detailCampaignQuery.refetch();
    } catch (error) {
      toast.error(getCampaignErrorMessage(error, "Gagal menyinkronkan campaign."));
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
                  {syncActiveContent.isPending ? "Menyinkronkan..." : "Sinkronkan konten aktif"}
                </Button>
                <Button type="button" onClick={openCreateDialog} className="rounded-none bg-[#B43C39] font-semibold text-white hover:bg-[#8f2e2c]">
                  <Plus className="mr-2 size-4" />
                  Tambah campaign
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
              <Label className="grid gap-2">
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
              <Label className="grid gap-2">
                <span>Filter status</span>
                <SearchableSelect
                  value={campaignStatusFilter}
                  onValueChange={(value) => setCampaignStatusFilter(value as typeof campaignStatusFilter)}
                  options={[...CAMPAIGN_STATUS_OPTIONS]}
                  placeholder="Pilih status"
                  searchPlaceholder="Cari status"
                />
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
                        <p className="line-clamp-2 text-sm text-muted-foreground">{campaign.description || "-"}</p>
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

              {!campaignsQuery.isLoading && !campaignProgressQuery.isLoading && !paginatedCampaigns.length && (
                <p className="text-sm text-muted-foreground">{campaignsResponse.totalItems ? "Tidak ada campaign yang cocok dengan filter." : "Belum ada campaign yang dibuat."}</p>
              )}

              {!campaignsQuery.isLoading && !campaignProgressQuery.isLoading && campaignsResponse.totalItems > 0 && (
                <CampaignPaginationControls
                  page={campaignPage}
                  pageSize={campaignPageSize}
                  onPageSizeChange={(nextPageSize) => {
                    setCampaignPageSize(nextPageSize);
                    setCampaignPage(1);
                  }}
                  totalItems={campaignsResponse.totalItems}
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
              <div className="grid gap-3 md:col-span-2 md:grid-cols-3">
                <NumberFormInput
                  label="Target post"
                  placeholder="40"
                  value={form.targetPostCount}
                  onChange={(targetPostCount) => setForm((current) => ({ ...current, targetPostCount }))}
                />
                <NumberFormInput
                  label="Target reels"
                  placeholder="40"
                  value={form.targetReelCount}
                  onChange={(targetReelCount) => setForm((current) => ({ ...current, targetReelCount }))}
                />
                <NumberFormInput
                  label="Target story"
                  placeholder="20"
                  value={form.targetStoryCount}
                  onChange={(targetStoryCount) => setForm((current) => ({ ...current, targetStoryCount }))}
                />
              </div>
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
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#982E41]">Deskripsi</p>
              </div>

            <div className="md:col-span-2">
              <FormTextarea
                label="Deskripsi campaign"
                value={form.objective}
                onChange={(objective) => setForm((current) => ({ ...current, description: objective, objective, postBriefs: objective }))}
                placeholder="Awareness produk baru untuk audiens Gen Z"
                required
              />
            </div>
            <KeywordTokenInput
              label="Keyword"
              suggestions={keywordOptions}
              value={form.keywords}
              onChange={(value) => setForm((current) => ({ ...current, keywords: value }))}
            />
            </section>

            <section className="grid gap-3 border border-[#982E41]/20 bg-white p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#982E41]">KOL</p>
              </div>

            <div className="grid gap-3">
              <Label>KOL</Label>

              <div className="grid gap-3 border border-border p-3">
                <KolCombobox
                  kols={selectableKols.filter((kol) => !form.selectedKolIds.includes(kol.id))}
                  placeholder="Cari KOL berdasarkan nama, keyword, atau handle"
                  onSelect={(kolId) => {
                    setForm((current) => ({
                      ...current,
                      selectedKolIds: current.selectedKolIds.includes(kolId)
                        ? current.selectedKolIds
                        : [...current.selectedKolIds, kolId],
                    }));
                  }}
                />

                <div className="grid min-h-11 gap-2">
                  {form.selectedKolIds.map((kolId) => {
                    const kol = selectableKols.find((item) => item.id === kolId);
                    if (!kol) return null;

                    const keywordTokens = parseKeywordTokens(kol.keywords);

                    return (
                      <div key={kolId} className="flex items-start justify-between gap-3 border border-[#982E41]/25 bg-[#FFF8F9] px-3 py-2 text-sm text-[#2b1418]">
                        <span className="min-w-0 space-y-1">
                          <span className="block truncate font-medium">{kol.displayName}</span>
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {kol.accounts.length ? (
                              kol.accounts.map((account) => (
                                <span key={account.id} className="inline-flex items-center gap-1">
                                  <SocialPlatformIcon platform={account.platform} className="size-3.5" />
                                  @{account.handle}
                                </span>
                              ))
                            ) : (
                              <span>-</span>
                            )}
                          </span>
                          {keywordTokens.length ? (
                            <span className="flex flex-wrap gap-1.5">
                              {keywordTokens.map((keyword) => (
                                <span key={keyword} className="border border-[#982E41]/25 bg-white px-2 py-0.5 text-[11px] font-medium text-[#982E41]">
                                  {keyword}
                                </span>
                              ))}
                            </span>
                          ) : null}
                        </span>
                        <button
                          type="button"
                          className="inline-flex size-7 shrink-0 items-center justify-center text-[#982E41] hover:bg-[#982E41]/10"
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
                      </div>
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
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden text-[#2b1418]">
          <DialogHeader className="px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-3 pr-10 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <DialogTitle className="uppercase tracking-wide">
                    DETAIL CAMPAIGN
                  </DialogTitle>
                </div>

                {detailCampaignId !== null && (
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    {detailCampaignSummary && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!detailCampaignData || !detailCampaignData.kols.length}
                          onClick={() => {
                            if (detailCampaignId !== null) {
                              closeDetailDialog();
                              openAddContentDialog(detailCampaignId);
                            }
                          }}
                        >
                          <Plus className="mr-1 size-4" />
                          Add konten
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!detailCampaignData || syncContent.isPending}
                          onClick={() => {
                            syncDetailCampaignContents();
                          }}
                        >
                          {syncContent.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : <RefreshCcw className="mr-1 size-4" />}
                          {syncContent.isPending ? "Menyinkronkan..." : "Sinkronkan konten"}
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
                          downloadCampaignReportPdf(detailCampaignData, campaignProgressById.get(detailCampaignData.id), kols);
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

          <div className="max-h-[calc(90vh-116px)] overflow-y-auto overflow-x-hidden">
            {!detailCampaignSummary ? (
              detailCampaignQuery.isLoading ? (
                <CampaignDetailSkeleton compact />
              ) : (
                <div className="px-4 pb-4 text-sm text-muted-foreground sm:px-6 sm:pb-6">Campaign tidak ditemukan.</div>
              )
            ) : !detailCampaignData ? (
              <CampaignDetailSkeleton />
            ) : (
              <div className="grid gap-6 px-4 py-4 sm:px-6 sm:py-6">
              <section className="space-y-4 border-[1.6px] border-border/70 bg-white p-4 sm:p-5">
                <div className="flex flex-col gap-3 border-b border-[#982E41]/15 pb-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#982E41]">{detailCampaignData.brand}</p>
                    <h2 className="mt-1 break-words font-goldman text-2xl font-bold uppercase tracking-wide text-[#2b1418] md:text-3xl">
                      {detailCampaignData.name}
                    </h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span className="border border-[#982E41]/15 bg-[#FFF8F9] px-2 py-1 text-[#2b1418]">{formatCampaignStatus(detailCampaignData.status)}</span>
                      <span>{formatHumanDate(detailCampaignData.periodStart)} → {formatHumanDate(detailCampaignData.periodEnd)}</span>
                      <span>Last sync: {formatHumanDateTime(getOldestContentSyncAt(detailCampaignData.contentsByKol))}</span>
                    </div>
                  </div>
                  <div className="min-w-[220px] border border-[#982E41]/15 bg-[#FFF8F9] p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#982E41]">Budget</p>
                    <p className="mt-1 text-lg font-semibold text-[#2b1418]">
                      {formatCurrencyIdr(detailCampaignProgress?.budgetUsedIdr)} / {formatCurrencyIdr(detailCampaignData.budgetIdr)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {clampPercent(((detailCampaignProgress?.budgetUsedIdr ?? 0) / Math.max(1, detailCampaignData.budgetIdr)) * 100)}% terpakai
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
                  <div className="border border-[#982E41]/15 bg-white">
                    <div className="border-b border-[#982E41]/15 bg-[#FFF8F9] px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#982E41]">
                      KOL
                    </div>
                    <div className="divide-y divide-[#982E41]/10">
                      <CampaignDetailRow label="Total KOL" value={`${detailCampaignData.kols.length.toLocaleString("id-ID")} / ${detailCampaignData.targetKolCount.toLocaleString("id-ID")}`} strong />
                      {detailKolTierRows.map((tier) => (
                        <CampaignDetailRow
                          key={tier.key}
                          label={`KOL ${tier.label}`}
                          value={`${tier.actual.toLocaleString("id-ID")} / ${tier.target.toLocaleString("id-ID")}`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="border border-[#982E41]/15 bg-white">
                    <div className="border-b border-[#982E41]/15 bg-[#FFF8F9] px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#982E41]">
                      Konten
                    </div>
                    <div className="divide-y divide-[#982E41]/10">
                      <CampaignDetailRow label="Total konten" value={`${(detailCampaignProgress?.contentCount ?? 0).toLocaleString("id-ID")} / ${detailCampaignData.targetContentCount.toLocaleString("id-ID")}`} strong />
                      <CampaignDetailRow label="Post" value={`${(detailCampaignProgress?.postCount ?? 0).toLocaleString("id-ID")} / ${detailCampaignData.targetPostCount.toLocaleString("id-ID")}`} />
                      <CampaignDetailRow label="Reels" value={`${(detailCampaignProgress?.reelCount ?? 0).toLocaleString("id-ID")} / ${detailCampaignData.targetReelCount.toLocaleString("id-ID")}`} />
                      <CampaignDetailRow label="Story" value={`${(detailCampaignProgress?.storyCount ?? 0).toLocaleString("id-ID")} / ${detailCampaignData.targetStoryCount.toLocaleString("id-ID")}`} />
                      <CampaignDetailRow label="Published / drafting / belum acc" value={`${(detailCampaignProgress?.syncedContentCount ?? 0).toLocaleString("id-ID")} / ${(detailCampaignProgress?.pendingSyncCount ?? 0).toLocaleString("id-ID")} / ${(detailCampaignProgress?.failedSyncCount ?? 0).toLocaleString("id-ID")}`} />
                    </div>
                  </div>
                </div>

                <div className="grid gap-3">
                  <ObjectiveProgressPanel
                    campaign={detailCampaignData}
                    progress={detailCampaignProgress}
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
                            <SocialHandleList handles={kol.handles} emptyLabel="Belum ada sosial media tersimpan." />
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

                {activeContentGroups.length || pendingDetailContentRows.length ? (
                  <div className="space-y-4">
                    {pendingDetailContentRows.length ? (
                      <article className="border-[1.6px] border-dashed border-[#982E41]/35 bg-white p-4 sm:p-5">
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-[18px] font-semibold leading-none text-foreground">Konten baru</p>
                            <p className="mt-1 text-[13px] text-muted-foreground">Sedang disimpan dan disinkronkan di background.</p>
                          </div>
                          <span className="border border-border bg-[#fff3d8] px-2 py-1 text-xs text-muted-foreground">
                            {pendingDetailContentRows.length} pending
                          </span>
                        </div>
                        <div className="mt-4 space-y-3">
                          {pendingDetailContentRows.map((row) => (
                            <article key={row.id} className="space-y-3 border-[1.6px] border-[#982E41]/20 bg-[#FFF5F7] p-3 sm:p-4">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <ContentPlatformBadge contentType={row.contentType} platform={row.platform} />
                                    <span className="border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.2em] text-amber-300">
                                      <Loader2 className="mr-1 inline size-3 animate-spin" />
                                      pending
                                    </span>
                                  </div>
                                  <a className="break-all text-xs text-primary underline-offset-4 hover:underline" href={row.contentUrl} rel="noreferrer" target="_blank">
                                    {row.contentUrl}
                                  </a>
                                </div>
                              </div>
                              <div className="grid gap-3 border border-[#982E41]/15 bg-white p-3 md:grid-cols-[104px_minmax(0,1fr)]">
                                <Skeleton className="aspect-square w-full" />
                                <div className="space-y-2">
                                  <Skeleton className="h-4 w-4/5" />
                                  <Skeleton className="h-4 w-2/3" />
                                  <Skeleton className="h-4 w-1/2" />
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      </article>
                    ) : null}
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
                              <SocialHandleList handles={group.handles} emptyLabel="Tidak ada sosial media yang tersimpan." />
                            </p>
                          </div>
                          </div>
                          <span className="border border-border bg-[#fff3d8] px-2 py-1 text-xs text-muted-foreground">
                            {group.contents.length} konten
                          </span>
                        </div>

                        <div className="mt-4 space-y-3">
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
                                              <ContentPlatformBadge contentType={content.contentType} platform={content.platform} />
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
                                                {isSyncingThisContent ? "menyinkronkan..." : content.syncStatus}
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
                                    disabled={updateContent.isPending}
                                    onClick={() => openContentEdit(content)}
                                  >
                                    <PencilLine className="mr-1 size-4" />
                                    Edit
                                  </Button>
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
                                    {syncingContentId === content.id || content.syncStatus === "pending" ? "Menyinkronkan..." : "Sinkronkan"}
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

                              {editingContentId === content.id && (
                                <div className="grid gap-3 border border-[#982E41]/15 bg-white p-3 md:grid-cols-2 xl:grid-cols-6">
                                  <Label className="grid gap-2 xl:col-span-2">
                                    <span>Budget</span>
                                    <Input
                                      className="border-[#b43c39]/20 bg-white text-[#2b1418] focus-visible:border-[#B43C39] focus-visible:ring-[#B43C39]/15"
                                      inputMode="numeric"
                                      value={formatRupiahInput(contentEditForm.budgetIdr)}
                                      onChange={(event) => updateContentEditField("budgetIdr", sanitizeIntegerInput(event.target.value))}
                                      placeholder="Rp0"
                                    />
                                  </Label>
                                  <NumberFormInput
                                    label="Est. views"
                                    value={contentEditForm.estimatedViewCount}
                                    onChange={(value) => updateContentEditField("estimatedViewCount", value)}
                                    placeholder="0"
                                  />
                                  <NumberFormInput
                                    label="Est. likes"
                                    value={contentEditForm.estimatedLikeCount}
                                    onChange={(value) => updateContentEditField("estimatedLikeCount", value)}
                                    placeholder="0"
                                  />
                                  <NumberFormInput
                                    label="Est. comments"
                                    value={contentEditForm.estimatedCommentCount}
                                    onChange={(value) => updateContentEditField("estimatedCommentCount", value)}
                                    placeholder="0"
                                  />
                                  <NumberFormInput
                                    label="Est. shares"
                                    value={contentEditForm.estimatedShareCount}
                                    onChange={(value) => updateContentEditField("estimatedShareCount", value)}
                                    placeholder="0"
                                  />
                                  <Label className="grid gap-2">
                                    <span>FYP</span>
                                    <SearchableSelect
                                      value={contentEditForm.isFyp}
                                      onValueChange={(value) => updateContentEditField("isFyp", value as ContentEditFormState["isFyp"])}
                                      options={[
                                        { label: "Belum ditentukan", value: "" },
                                        { label: "Ya", value: "yes" },
                                        { label: "Tidak", value: "no" },
                                      ]}
                                      placeholder="Pilih FYP"
                                      searchPlaceholder="Cari status"
                                    />
                                  </Label>
                                  <div className="flex items-end gap-2 xl:col-span-6">
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="bg-[#982E41] text-white hover:bg-[#7E2334]"
                                      disabled={updateContent.isPending}
                                      onClick={() => submitContentEdit(content.id)}
                                    >
                                      {updateContent.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}
                                      Simpan konten
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={updateContent.isPending}
                                      onClick={() => setEditingContentId(null)}
                                    >
                                      Batal
                                    </Button>
                                  </div>
                                </div>
                              )}

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
                                <DetailStat boxed compact label="Views" value={<EstimatedMetricValue value={content.viewCount} estimated={content.estimatedViewCount} />} />
                                <DetailStat boxed compact label="Likes" value={<EstimatedMetricValue value={content.likeCount} estimated={content.estimatedLikeCount} />} />
                                <DetailStat boxed compact label="Comments" value={<EstimatedMetricValue value={content.commentCount} estimated={content.estimatedCommentCount} />} />
                                <DetailStat boxed compact label="Shares" value={<EstimatedMetricValue value={content.shareCount} estimated={content.estimatedShareCount} />} />
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
                              <SocialHandleList handles={group.handles} emptyLabel="Tidak ada sosial media yang tersimpan." />
                            </p>
                          </div>
                          <span className="border border-border bg-[#F1E2E6] px-2 py-1 text-xs text-muted-foreground">
                            {group.contents.length} archived
                          </span>
                        </div>

                        <div className="mt-4 space-y-3">
                          {group.contents.map((content) => (
                            <article key={content.id} className="space-y-3 border-[1.6px] border-border/70 bg-[#F9EEF1] p-3 opacity-80 sm:p-4">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="border border-border px-2 py-0.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                                      archived
                                    </span>
                                    <ContentPlatformBadge contentType={content.contentType} platform={content.platform} />
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
          </div>
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
            <DialogTitle>{addContentCampaign ? `Tambah konten - ${addContentCampaign.name}` : "Tambah konten"}</DialogTitle>
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
                <div className="space-y-3">
                  {contentRows.map((row) => (
                    <div key={row.id} className="grid gap-3 rounded-none border border-border p-3">
                      <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
                        <Label className="grid gap-2">
                          <span>Jenis</span>
                          <SearchableSelect
                            value={row.contentType}
                            onValueChange={(value) => {
                              const contentType = value as ContentFormRow["contentType"];
                              updateContentRow(row.id, {
                                contentType,
                                ...applyKolEstimate(row, row.kolId, contentType),
                              });
                            }}
                            options={[...CONTENT_TYPE_OPTIONS]}
                            placeholder="Pilih jenis"
                            searchPlaceholder="Cari jenis"
                          />
                          {contentRowErrors[row.id]?.contentType && (
                            <span className="text-xs font-medium normal-case tracking-normal text-destructive">{contentRowErrors[row.id]?.contentType}</span>
                          )}
                        </Label>
                        <Label className="grid gap-2">
                          <span>Link</span>
                          {(() => {
                            const normalizedUrl = normalizeContentUrl(row.contentUrl);
                            const detectedPlatform = normalizedUrl ? detectContentPlatformFromUrl(normalizedUrl) : null;

                            return (
                              <div className="relative">
                                <Input
                                  aria-invalid={Boolean(contentRowErrors[row.id]?.contentUrl)}
                                  className={detectedPlatform ? "pr-10" : undefined}
                                  placeholder="https://www.instagram.com/reel/DYyTFReyo3D/"
                                  value={row.contentUrl}
                                  onChange={(event) => {
                                    const contentUrl = event.target.value;
                                    updateContentRow(row.id, {
                                      contentUrl,
                                    });
                                  }}
                                />
                                {detectedPlatform ? (
                                  <span
                                    className="pointer-events-none absolute right-3 top-1/2 inline-flex -translate-y-1/2 text-[#982E41]"
                                    title={getSocialPlatformLabel(detectedPlatform)}
                                  >
                                    <SocialPlatformIcon platform={detectedPlatform} className="size-4" />
                                  </span>
                                ) : null}
                              </div>
                            );
                          })()}
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
                              <SearchableSelect
                                value={row.platform}
                                onValueChange={(value) => updateContentRow(row.id, { platform: value as ContentFormRow["platform"] })}
                                options={CONTENT_PLATFORM_OPTIONS.map((option) => ({
                                  ...option,
                                  icon: <SocialPlatformIcon platform={option.value} className="size-4" />,
                                }))}
                                placeholder="Pilih platform"
                                searchPlaceholder="Cari platform"
                              />
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
                              <SearchableSelect
                                value={row.isFyp}
                                onValueChange={(value) => updateContentRow(row.id, { isFyp: value as ContentFormRow["isFyp"] })}
                                options={[...FYP_OPTIONS]}
                                placeholder="Pilih FYP"
                                searchPlaceholder="Cari FYP"
                              />
                            </Label>
                          </div>

                          <div className="grid gap-3">
                            <Label className="grid gap-2">
                              <span>KOL</span>
                              <SearchableSelect
                                value={row.kolId === "" ? "" : String(row.kolId)}
                                onValueChange={(value) => {
                                  const selected = addContentCampaign.kols.find((kol) => kol.id === Number(value));
                                  const kolId = value ? Number(value) : "";
                                  updateContentRow(row.id, {
                                    ...applyKolEstimate(row, kolId),
                                    kolDisplayName: selected?.displayName ?? row.kolDisplayName,
                                    kolHandle: selected?.handles[0]?.replace(/^(instagram|tiktok):/i, "") ?? row.kolHandle,
                                    kolId,
                                  });
                                }}
                                options={[
                                  ...addContentCampaign.kols
                                    .filter((kol) => kol.displayName.trim().toLowerCase() !== "kol belum terdaftar")
                                    .map((kol) => ({
                                    label: kol.displayName,
                                    value: String(kol.id),
                                    keywords: kol.handles,
                                  })),
                                ]}
                                placeholder="Pilih KOL"
                                searchPlaceholder="Cari KOL"
                              />
                              {contentRowErrors[row.id]?.kol && (
                                <span className="text-xs font-medium normal-case tracking-normal text-destructive">{contentRowErrors[row.id]?.kol}</span>
                              )}
                            </Label>
                          </div>

                          <div className="grid gap-3 md:grid-cols-4">
                            <FormInput label="Est. views" placeholder="75000" value={row.estimatedViewCount} onChange={(estimatedViewCount) => updateContentRow(row.id, { estimatedViewCount })} />
                            <FormInput label="Est. likes" placeholder="4200" value={row.estimatedLikeCount} onChange={(estimatedLikeCount) => updateContentRow(row.id, { estimatedLikeCount })} />
                            <FormInput label="Est. comments" placeholder="650" value={row.estimatedCommentCount} onChange={(estimatedCommentCount) => updateContentRow(row.id, { estimatedCommentCount })} />
                            <FormInput label="Est. shares" placeholder="320" value={row.estimatedShareCount} onChange={(estimatedShareCount) => updateContentRow(row.id, { estimatedShareCount })} />
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
                <Button type="submit" className="border border-[#982E41] bg-[#982E41] text-white hover:bg-[#7E2334]">
                  Tambahkan konten
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
        {formatNumber(value)}{estimated ? ` • est. ${formatNumber(estimated)} (${getEstimatedPercent(value, estimated)}%)` : ""}
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
        <SearchableSelect
          className="h-8 w-24"
          value={String(pageSize)}
          onValueChange={(value) => onPageSizeChange(Number(value))}
          options={CAMPAIGN_PAGE_SIZE_OPTIONS}
          placeholder="Page size"
          searchPlaceholder="Cari ukuran"
        />
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
  return Array.from(new Set(tokens.map((token) => token.trim().toLowerCase()).filter(Boolean))).join(", ");
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

function KeywordTokenInput({
  label,
  onChange,
  suggestions = [],
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  suggestions?: string[];
  value: string;
}) {
  const tokens = parseKeywordTokens(value);
  const [draft, setDraft] = useState("");
  const availableSuggestions = suggestions.filter((suggestion) =>
    !tokens.some((token) => token.toLowerCase() === suggestion.toLowerCase()) &&
    (!draft || suggestion.toLowerCase().includes(draft.toLowerCase())),
  );

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
      {availableSuggestions.length ? (
        <div className="space-y-2 border border-[#982E41]/15 bg-[#FFF8F9] p-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#982E41]">Suggestion</p>
          <div className="flex flex-wrap gap-2">
            {availableSuggestions.slice(0, 12).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="border border-[#982E41]/25 bg-white px-2 py-1 text-xs font-medium text-[#982E41] hover:bg-[#982E41]/10"
                onClick={() => onChange(encodeKeywordTokens([...tokens, suggestion]))}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TargetKolTierInputs({ onChange, value }: { onChange: (value: string) => void; value: string }) {
  const tiers = parseTargetKolTiers(value);
  const tierCounts = useMemo(
    () => Object.fromEntries(TARGET_KOL_TIERS.map(({ key }) => [key, tiers.find((item) => item.tier === key)?.count ?? 0])) as Record<string, number>,
    [value],
  );
  const [focusedTier, setFocusedTier] = useState<string | null>(null);
  const [draftCounts, setDraftCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(TARGET_KOL_TIERS.map(({ key }) => [key, String(tierCounts[key] ?? 0)])),
  );

  useEffect(() => {
    if (focusedTier) return;
    setDraftCounts(Object.fromEntries(TARGET_KOL_TIERS.map(({ key }) => [key, String(tierCounts[key] ?? 0)])));
  }, [focusedTier, tierCounts]);

  function updateTier(tier: string, count: number) {
    const next = TARGET_KOL_TIERS.map(({ key }) => ({
      tier: key,
      count: key === tier ? count : tiers.find((item) => item.tier === key)?.count ?? 0,
    }));

    onChange(encodeTargetKolTiers(next));
  }

  function updateTierDraft(tier: string, rawValue: string) {
    const digitsOnly = rawValue.replace(/[^\d]/g, "");
    setDraftCounts((current) => ({ ...current, [tier]: digitsOnly }));
    updateTier(tier, digitsOnly ? Number(digitsOnly) : 0);
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
              inputMode="numeric"
              value={draftCounts[key] ?? ""}
              onFocus={() => setFocusedTier(key)}
              onBlur={() => {
                setFocusedTier(null);
                setDraftCounts((current) => ({ ...current, [key]: current[key] === "" ? "0" : current[key] ?? "0" }));
              }}
              onChange={(event) => updateTierDraft(key, event.target.value)}
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
  const [open, setOpen] = useState(false);
  const filteredOptions = options.filter((option) => option.toLowerCase().includes(value.toLowerCase()) && option !== value);

  return (
    <Label className="grid gap-2 text-xs font-medium uppercase tracking-[0.14em] text-[#982E41]">
      <span>Brand</span>
      <div className="relative">
        <Input
          className="border-[#b43c39]/20 bg-white text-[#2b1418] placeholder:text-[#A16A75] focus-visible:border-[#B43C39] focus-visible:ring-[#B43C39]/15"
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="DigiWonder"
          required
          value={value}
        />
        {open && filteredOptions.length ? (
          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-56 overflow-y-auto border border-[#982E41]/20 bg-white p-1 shadow-sm">
            {filteredOptions.map((option) => (
              <button
                key={option}
                type="button"
                className="block w-full px-2 py-2 text-left text-sm normal-case tracking-normal text-[#2b1418] hover:bg-[#fff6f8]"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                {option}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </Label>
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

function NumberFormInput({
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
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={(event) => onChange(sanitizeIntegerInput(event.target.value))}
        placeholder={placeholder}
      />
    </Label>
  );
}

function FormTextarea({
  label,
  onChange,
  placeholder,
  required = false,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
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
        required={required}
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
    <div className="grid gap-6 px-4 py-4 sm:px-6 sm:py-6">
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


function getEstimatedPercent(value: number, estimated: number) {
  if (!estimated) return 0;
  return clampPercent((value / estimated) * 100);
}

function EstimatedMetricValue({ estimated, value }: { estimated: number; value: number }) {
  if (!estimated) {
    return <div>{formatNumber(value)}</div>;
  }

  return (
    <div className="space-y-0.5">
      <div>{formatNumber(value)}</div>
      <div className="text-[11px] font-normal leading-snug text-muted-foreground">
        est. {formatNumber(estimated)} • {getEstimatedPercent(value, estimated)}% sampai est
      </div>
    </div>
  );
}

function KolCombobox({ kols, onSelect, placeholder }: { kols: KolRecord[]; onSelect: (kolId: number) => void; placeholder: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filteredKols = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return kols;

    return kols.filter((kol) => {
      const haystack = [
        kol.displayName,
        kol.keywords,
        kol.followerTier,
        ...kol.accounts.flatMap((account) => [account.handle, account.platform]),
      ].join(" ").toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [kols, query]);

  function selectKol(kolId: number) {
    onSelect(kolId);
    setQuery("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-[#982E41]" />
          <Input
            aria-expanded={open}
            role="combobox"
            className="h-10 w-full border-[#982E41]/20 bg-white pl-9 pr-9 text-sm font-normal text-[#2b1418] placeholder:text-[#A16A75] focus-visible:border-[#B43C39] focus-visible:ring-[#B43C39]/15"
            placeholder={placeholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (!open) setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setOpen(true);
              }

              if (event.key === "Enter" && open && filteredKols[0]) {
                event.preventDefault();
                selectKol(filteredKols[0].id);
              }

              if (event.key === "Escape") {
                setOpen(false);
              }
            }}
          />
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 z-10 size-4 -translate-y-1/2 opacity-50" />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] border-[#982E41]/20 p-0" align="start" onOpenAutoFocus={(event) => event.preventDefault()}>
        <div className="max-h-80 overflow-y-auto p-1">
          {filteredKols.length ? (
            filteredKols.map((kol) => {
              const keywordTokens = parseKeywordTokens(kol.keywords);

              return (
                <button
                  key={kol.id}
                  type="button"
                  className="grid w-full gap-1 px-2 py-2 text-left text-sm text-[#2b1418] hover:bg-[#fff6f8]"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectKol(kol.id)}
                >
                  <span className="font-medium">{kol.displayName}</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {kol.accounts.length ? (
                      kol.accounts.map((account) => (
                        <span key={account.id} className="inline-flex items-center gap-1">
                          <SocialPlatformIcon platform={account.platform} className="size-3.5" />
                          @{account.handle}
                        </span>
                      ))
                    ) : (
                      <span>Tanpa akun</span>
                    )}
                  </span>
                  {keywordTokens.length ? (
                    <span className="flex flex-wrap gap-1.5">
                      {keywordTokens.slice(0, 6).map((keyword) => (
                        <span key={keyword} className="border border-[#982E41]/25 bg-white px-2 py-0.5 text-[11px] font-medium text-[#982E41]">
                          {keyword}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </button>
              );
            })
          ) : (
            <div className="px-2 py-3 text-sm text-muted-foreground">KOL tidak ditemukan.</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
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

function CampaignDetailRow({
  label,
  strong = false,
  value,
}: {
  label: string;
  strong?: boolean;
  value: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-sm">
      <span className={`${strong ? "font-semibold text-[#2b1418]" : "text-muted-foreground"}`}>{label}</span>
      <span className={`${strong ? "text-base font-semibold" : "font-medium"} text-right text-[#2b1418]`}>{value}</span>
    </div>
  );
}

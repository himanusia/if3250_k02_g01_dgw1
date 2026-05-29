import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronDown, Download, Instagram, Loader2, PencilLine, Plus, RefreshCcw, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "@e965/xlsx";

import type { KolRecord, RateCardValue, SocialPlatform } from "@/lib/app-types";
import { formatCurrencyIdr, formatDateTime, formatNumber, getAccountMetadata, getAvatarSrc, getPostDisplayTitle, getRecentAccountPosts } from "@/lib/kol-utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { client, orpc } from "@/utils/orpc";

type KolAccountFormState = {
  handle: string;
  platform: SocialPlatform;
};

const PLATFORM_OPTIONS = [
  { label: "Semua platform", value: "all" },
  { label: "Instagram", value: "instagram" },
  { label: "TikTok", value: "tiktok" },
] as const;
const SOCIAL_PLATFORM_OPTIONS = [
  { label: "Instagram", value: "instagram" },
  { label: "TikTok", value: "tiktok" },
] as const;

type KolFormState = {
  accounts: KolAccountFormState[];
  actualPostRate: string;
  actualReelRate: string;
  actualStoryRate: string;
  displayName: string;
  keywords: string;
};

type KolMutationInput = KolFormState & {
  actualRateCard?: RateCardValue | null;
};

type RawExcelRow = {
  Nama?: string;
  Platform?: string;
  username?: string;
  "Persona kreator"?: string;
};

type RpcLikeError = {
  code?: string;
  data?: {
    reason?: string;
    issues?: Array<{
      message: string;
      path?: string[];
    }>;
  };
  message?: string;
};

function getDefaultAccount(platform: SocialPlatform = "instagram"): KolAccountFormState {
  return {
    handle: "",
    platform,
  };
}

function getDefaultForm(): KolFormState {
  return {
    accounts: [getDefaultAccount("instagram")],
    actualPostRate: "",
    actualReelRate: "",
    actualStoryRate: "",
    displayName: "",
    keywords: "",
  };
}

function toRateInput(value: number | null | undefined) {
  return value && Number.isFinite(value) ? String(Math.round(value)) : "";
}

function parseOptionalPositiveRate(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value.replace(/[^\d]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
}

function sanitizeIntegerInput(value: string) {
  return value.replace(/[^\d]/g, "");
}

function formatRupiahInput(value: string) {
  const parsed = Number(value.replace(/[^\d]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? formatCurrencyIdr(parsed) : "";
}

function buildActualRateCard(form: KolFormState): RateCardValue | null | undefined {
  const post = parseOptionalPositiveRate(form.actualPostRate);
  const story = parseOptionalPositiveRate(form.actualStoryRate);
  const reel = parseOptionalPositiveRate(form.actualReelRate);

  if (post === undefined || story === undefined || reel === undefined) {
    return undefined;
  }

  if (post === null && story === null && reel === null) {
    return null;
  }

  if (post === null || story === null || reel === null) {
    return undefined;
  }

  return {
    currency: "IDR",
    post: { max: post, min: post, suggested: post },
    reel: { max: reel, min: reel, suggested: reel },
    story: { max: story, min: story, suggested: story },
  };
}

function createOptimisticKol(input: KolMutationInput, id: number): KolRecord {
  const now = new Date().toISOString();

  return {
    accounts: input.accounts.map((account, index) => ({
      averageLikes: 0,
      averageViews: 0,
      biography: null,
      createdAt: now,
      engagementRate: "",
      externalId: null,
      followers: 0,
      handle: account.handle.trim().replace(/^@/, ""),
      id: id - index - 1,
      kolId: id,
      lastSyncedAt: null,
      metadata: null,
      platform: account.platform,
      profileUrl: null,
      syncMessage: "Menunggu sinkronisasi.",
      syncStatus: "pending",
      updatedAt: now,
    })),
    actualRateCard: input.actualRateCard ?? null,
    averageLikes: 0,
    averageViews: 0,
    contents: [],
    createdAt: now,
    displayName: input.displayName.trim() || "KOL baru",
    engagementRate: "",
    estimatedRateCard: null,
    followerTier: "nano",
    history: [],
    id,
    keywords: input.keywords,
    lastSyncedAt: null,
    rateCardHistory: [],
    rateCardMetadata: null,
    syncMessage: "Menunggu sinkronisasi.",
    syncStatus: "pending",
    totalFollowers: 0,
    updatedAt: now,
  };
}

function getNormalizedAccountKey(account: KolAccountFormState) {
  return `${account.platform}:${account.handle.trim().replace(/^@/, "").toLowerCase()}`;
}

function getDuplicateAccountMessage(accounts: KolAccountFormState[]) {
  const seen = new Set<string>();

  for (const account of accounts) {
    const key = getNormalizedAccountKey(account);
    if (!account.handle.trim()) continue;

    if (seen.has(key)) {
      return `Akun ${account.platform} @${account.handle.replace(/^@/, "").trim()} terduplikat di form.`;
    }

    seen.add(key);
  }

  return "";
}

function parseKeywordSegments(keywords: string | null | undefined): string[] {
  const raw = keywords?.trim();
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((k) => k.trim().replace(/^#+/, ""))
    .filter(Boolean);
}

function encodeKeywordSegments(keywords: string[]) {
  return Array.from(new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))).join(" ");
}

function formatFollowerTier(tier: string | null | undefined) {
  const labels: Record<string, string> = {
    macro: "Macro (100 ribu - 999 ribu followers)",
    mega: "Mega (1 juta+ followers)",
    micro: "Micro (10 ribu - 99 ribu followers)",
    nano: "Nano (< 10 ribu followers)",
  };

  return tier ? labels[tier] ?? tier : "-";
}

function useDebouncedValue<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);

  return debounced;
}

function formatRateWithEstimate(actual: number | null | undefined, estimated: number | null | undefined) {
  const actualLabel = actual ? formatCurrencyIdr(actual) : "-";
  return estimated ? `${actualLabel} (est. ${formatCurrencyIdr(estimated)})` : actualLabel;
}

const KOLS_COLORS = {
  badgeFill: "#B33C39",
  mutedText: "#6D3A44",
  darkText: "#722331",
  pageBackground: "#FFF8F9",
  stroke: "#982E41",
  surface: "#FFF8F9",
  text: "#2B1418",
} as const;

const KOL_ACTION_BUTTON_CLASS =
  "h-8 rounded-none !border !border-[#982E41] !bg-white px-3 !text-[12px] !font-semibold !text-[#982E41] shadow-[3px_3px_0_rgba(152,46,65,0.12)] transition-colors hover:!bg-[#982E41] hover:!text-[#ffffff]";
const KOL_PAGE_SIZE = 8;
const KOL_FORM_DRAFT_KEY = "digiwonder:kols:form-draft";

type KolFormDraft = {
  editingId: number | null;
  form: KolFormState;
};

function loadKolFormDraft() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(KOL_FORM_DRAFT_KEY) ?? "null") as KolFormDraft | null;
    return parsed?.form ? parsed : null;
  } catch {
    return null;
  }
}

function saveKolFormDraft(draft: KolFormDraft) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(KOL_FORM_DRAFT_KEY, JSON.stringify(draft));
}

function clearKolFormDraft() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(KOL_FORM_DRAFT_KEY);
}

function getSocialUrl(platform: SocialPlatform, handle: string) {
  const cleanHandle = handle.replace(/^@/, "").trim();

  if (platform === "instagram") {
    return `https://www.instagram.com/${cleanHandle}/`;
  }

  return `https://www.tiktok.com/@${cleanHandle}`;
}

function getSocialPlatformLabel(platform: SocialPlatform) {
  return platform === "instagram" ? "Instagram" : "TikTok";
}

function SocialPlatformIcon({ platform, className = "size-4" }: { platform: SocialPlatform; className?: string }) {
  if (platform === "instagram") {
    return <Instagram className={className} aria-hidden="true" />;
  }

  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.5 3.2c.4 2.4 1.8 3.9 4.1 4.1v3.1c-1.4.1-2.7-.3-4-1.1v5.9c0 4.2-2.7 6.6-6.2 6.6-3.1 0-5.6-2.1-5.6-5.2 0-3.4 2.6-5.6 6.3-5.4v3.2c-1.8-.3-3 .5-3 2 0 1.3 1 2.1 2.2 2.1 1.4 0 2.5-.8 2.5-3V3.2h3.7Z" />
    </svg>
  );
}
function getKolErrorMessage(error: unknown, fallback: string) {
  const rpcError = error as RpcLikeError;
  const reason = rpcError?.data?.reason;
  const code = rpcError?.code;

  if (code === "BAD_REQUEST") {
    if (reason === "INVALID_ACCOUNT") {
      return rpcError?.message || "Akun tidak valid atau tidak ditemukan di platform.";
    }

    if (rpcError?.data?.issues?.[0]?.message) {
      return rpcError.data.issues[0].message;
    }
  }

  if (code === "SERVICE_UNAVAILABLE") {
    return "Layanan sinkronisasi akun sedang bermasalah. Coba lagi nanti.";
  }

  if (code === "NOT_FOUND" && reason === "KOL_NOT_FOUND") {
    return "KOL tidak ditemukan.";
  }

  return error instanceof Error ? error.message : fallback;
}

export const Route = createFileRoute("/kols")({
  component: RouteComponent,
  pendingComponent: KolsPendingComponent,
});

function KolsPendingComponent() {
  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-gradient-to-b from-background via-[#fff6f8] to-background py-6">
      <div className="container mx-auto max-w-6xl space-y-5 px-4 lg:py-2" style={{ color: KOLS_COLORS.text }}>
        <section className="space-y-4 rounded-none border border-[#b43c39]/15 bg-white p-5 shadow-[8px_8px_0_rgba(152,46,65,0.10)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <Skeleton className="h-3 w-12 bg-[#b43c39]/15" />
              <Skeleton className="h-10 w-56 bg-[#b43c39]/10" />
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              <Skeleton className="h-8 w-28 bg-[#b43c39]/10" />
              <Skeleton className="h-8 w-40 bg-[#b43c39]/10" />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px]">
            <div className="grid gap-2">
              <Skeleton className="h-4 w-16 bg-[#b43c39]/15" />
              <Skeleton className="h-10 w-full bg-[#b43c39]/10" />
            </div>
            <div className="grid gap-2">
              <Skeleton className="h-4 w-20 bg-[#b43c39]/15" />
              <Skeleton className="h-10 w-full bg-[#b43c39]/10" />
            </div>
            <div className="grid gap-2">
              <Skeleton className="h-4 w-12 bg-[#b43c39]/15" />
              <Skeleton className="h-10 w-full bg-[#b43c39]/10" />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-7 w-24 bg-[#b43c39]/10" />
            ))}
          </div>

          <div className="border border-dashed border-[#b43c39]/15" />

          <div className="space-y-5">
            <KolListSkeleton />
          </div>
        </section>
      </div>
    </div>
  );
}

function RouteComponent() {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [syncingKolId, setSyncingKolId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [keywordFilter, setKeywordFilter] = useState("all");
  const [kolPage, setKolPage] = useState(1);
  const [platformFilter, setPlatformFilter] = useState<"all" | SocialPlatform>("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [form, setForm] = useState<KolFormState>(getDefaultForm());
  const [optimisticKols, setOptimisticKols] = useState<KolRecord[]>([]);
  const kolQuery = useQuery(orpc.kol.list.queryOptions());
  const serverKols = (kolQuery.data as KolRecord[] | undefined) ?? [];
  const kols = useMemo(() => {
    if (!optimisticKols.length) return serverKols;

    const serverIds = new Set(serverKols.map((kol) => kol.id));
    return [...optimisticKols.filter((kol) => !serverIds.has(kol.id)), ...serverKols];
  }, [optimisticKols, serverKols]);

  useEffect(() => {
    if (!kols.some((kol) => kol.syncStatus === "pending" || kol.accounts.some((account) => account.syncStatus === "pending"))) {
      return;
    }

    const interval = window.setInterval(() => {
      kolQuery.refetch();
    }, 5_000);

    return () => window.clearInterval(interval);
  }, [kolQuery, kols]);

  const keywordOptions = useMemo(() => {
    return Array.from(new Set(kols.flatMap((kol) => parseKeywordSegments(kol.keywords))))
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
  }, [kols]);

  const tierOptions = useMemo(() => {
    return Array.from(new Set(kols.map((kol) => kol.followerTier).filter(Boolean)))
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
  }, [kols]);

  const filteredKols = useMemo(() => {
    const normalizedSearch = debouncedSearch.trim().toLowerCase();

    return kols.filter((kol) => {
      const haystack = [
        kol.displayName,
        kol.keywords,
        ...kol.accounts.map((account) => account.biography ?? ""),
        ...kol.accounts.map((account) => `${account.platform} ${account.handle}`),
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = !normalizedSearch || haystack.includes(normalizedSearch);
      const matchesKeyword = keywordFilter === "all" || parseKeywordSegments(kol.keywords).some(
        (keyword) => keyword.toLowerCase() === keywordFilter.toLowerCase(),
      );
      const matchesPlatform = platformFilter === "all" || kol.accounts.some((account) => account.platform === platformFilter);
      const matchesTier = tierFilter === "all" || kol.followerTier === tierFilter;

      return matchesSearch && matchesKeyword && matchesPlatform && matchesTier;
    });
  }, [keywordFilter, kols, platformFilter, debouncedSearch, tierFilter]);

  const totalKolPages = Math.max(1, Math.ceil(filteredKols.length / KOL_PAGE_SIZE));
  const paginatedKols = useMemo(
    () => filteredKols.slice((kolPage - 1) * KOL_PAGE_SIZE, kolPage * KOL_PAGE_SIZE),
    [filteredKols, kolPage],
  );

  useEffect(() => {
    setKolPage(1);
  }, [keywordFilter, platformFilter, debouncedSearch, tierFilter]);

  useEffect(() => {
    if (kolPage > totalKolPages) {
      setKolPage(totalKolPages);
    }
  }, [kolPage, totalKolPages]);

  const createKol = useMutation({
    mutationFn: (input: KolMutationInput) => client.kol.create(input),
    onMutate: (input) => {
      const tempId = -Date.now();
      setOptimisticKols((current) => [createOptimisticKol(input, tempId), ...current]);
      return { tempId };
    },
    onSuccess: async (kol, _variables, context) => {
      setOptimisticKols((current) => [
        { ...kol, syncStatus: "pending" },
        ...current.filter((item) => item.id !== context?.tempId && item.id !== kol.id),
      ]);
      resetForm();
      setSyncingKolId(kol.id);

      try {
        const syncedKol = await client.kol.syncMetrics({ id: kol.id });
        setOptimisticKols((current) => current.map((item) => (item.id === kol.id ? syncedKol : item)));

        if (syncedKol?.syncStatus === "failed") {
          toast.error(syncedKol.syncMessage || "KOL tersimpan, tetapi sebagian akun gagal disinkronkan.");
        } else if (syncedKol?.syncStatus === "pending") {
          toast.info("KOL tersimpan. Sinkronisasi masih berjalan dan status akan diperbarui.");
        } else {
          toast.success("KOL berhasil ditambahkan dan disinkronkan.");
        }
      } catch (error) {
        toast.error(getKolErrorMessage(error, "KOL tersimpan, tetapi sinkronisasi gagal"));
      } finally {
        setSyncingKolId(null);
        await kolQuery.refetch();
        setOptimisticKols((current) => current.filter((item) => item.id !== kol.id));
      }
    },
    onError: (error) => {
      setOptimisticKols((current) => current.filter((item) => item.id > 0));
      toast.error(getKolErrorMessage(error, "Gagal menambahkan KOL"));
    },
  });

  const updateKol = useMutation({
    mutationFn: (input: KolMutationInput & { id: number }) => client.kol.update(input),
    onSuccess: () => {
      toast.success("KOL berhasil diperbarui");
      kolQuery.refetch();
      resetForm();
    },
    onError: (error) => {
      toast.error(getKolErrorMessage(error, "Gagal memperbarui KOL"));
    },
  });

  const syncKol = useMutation({
    mutationFn: ({ id }: { id: number }) => client.kol.syncMetrics({ id }),
    onSuccess: (kol) => {
      if (kol?.syncStatus === "failed") {
        toast.error(kol.syncMessage || "Sinkronisasi KOL selesai, tetapi sebagian akun gagal.");
      } else if (kol?.syncStatus === "pending") {
        toast.info("Sinkronisasi KOL masih berjalan. Status akan diperbarui saat data masuk.");
      } else {
        toast.success("Data KOL berhasil disinkronkan");
      }

      kolQuery.refetch();
      setSyncingKolId(null);
    },
    onError: (error) => {
      toast.error(getKolErrorMessage(error, "Sinkronisasi KOL gagal"));
      setSyncingKolId(null);
    },
  });

  const deleteKol = useMutation({
    mutationFn: ({ id }: { id: number }) => client.kol.delete({ id }),
    onSuccess: () => {
      toast.success("KOL berhasil dihapus");
      kolQuery.refetch();
      setDeleteTargetId(null);
    },
    onError: (error) => {
      toast.error(getKolErrorMessage(error, "Gagal menghapus KOL"));
      setDeleteTargetId(null);
    },
  });

  const syncDueKols = useMutation({
    mutationFn: () => client.kol.syncDueKols(),
    onSuccess: (result) => {
      toast.success(`Sinkronisasi KOL terjadwal selesai: ${result.synced} dari ${result.total} KOL diproses.`);
      kolQuery.refetch();
    },
    onError: (error) => {
      toast.error(getKolErrorMessage(error, "Sinkronisasi KOL terjadwal gagal"));
    },
  });

  function resetForm() {
    setEditingId(null);
    setIsDialogOpen(false);
    setForm(getDefaultForm());
    clearKolFormDraft();
  }

  function openCreateDialog() {
    const draft = loadKolFormDraft();

    setEditingId(draft?.editingId ?? null);
    setForm(draft?.form ?? getDefaultForm());
    setIsDialogOpen(true);
  }

  function editKol(kol: KolRecord) {
    setEditingId(kol.id);
    setForm({
      accounts: kol.accounts.map((account) => ({
        handle: account.handle,
        platform: account.platform,
      })),
      actualPostRate: toRateInput(kol.actualRateCard?.post.suggested),
      actualReelRate: toRateInput(kol.actualRateCard?.reel.suggested),
      actualStoryRate: toRateInput(kol.actualRateCard?.story.suggested),
      displayName: kol.displayName,
      keywords: kol.keywords,
    });
    setIsDialogOpen(true);
  }

  useEffect(() => {
    if (!isDialogOpen) {
      return;
    }

    saveKolFormDraft({ editingId, form });
  }, [editingId, form, isDialogOpen]);

  const displayNames = useMemo(() => {
    return Array.from(
      new Set(filteredKols.map((kol) => kol.displayName))
    );
  }, [filteredKols]);

  useEffect(() => {
    const previousBodyBackground = document.body.style.backgroundColor;
    const previousHtmlBackground = document.documentElement.style.backgroundColor;

    document.body.style.backgroundColor = KOLS_COLORS.pageBackground;
    document.documentElement.style.backgroundColor = KOLS_COLORS.pageBackground;

    return () => {
      document.body.style.backgroundColor = previousBodyBackground;
      document.documentElement.style.backgroundColor = previousHtmlBackground;
    };
  }, []);


  function submit() {
    const actualRateCard = buildActualRateCard(form);
    if (actualRateCard === undefined) {
      toast.error("Actual rate harus angka positif. Isi Post, Story, dan Reels sekaligus atau kosongkan semuanya.");
      return;
    }

    const duplicateMessage = getDuplicateAccountMessage(form.accounts);
    if (duplicateMessage) {
      toast.error(duplicateMessage);
      return;
    }

    const existingAccount = form.accounts.find((account) => {
      const key = getNormalizedAccountKey(account);
      return kols.some((kol) =>
        kol.id !== editingId &&
        kol.accounts.some((existing) => getNormalizedAccountKey(existing) === key),
      );
    });

    if (existingAccount) {
      toast.error(`Akun ${existingAccount.platform} @${existingAccount.handle.replace(/^@/, "").trim()} sudah ada di database.`);
      return;
    }

    if (editingId) {
      updateKol.mutate({
        actualRateCard,
        id: editingId,
        ...form,
      });
      return;
    }

    const payload = { ...form, actualRateCard };
    resetForm();
    createKol.mutate(payload);
  }

  // spreadsheet import
  const [importPreview, setImportPreview] =
    useState<KolFormState[]>([]);

  const [importResult, setImportResult] =
    useState<any>(null);

  const [
    isImportResultDialogOpen,
    setIsImportResultDialogOpen,
  ] = useState(false);

  const [isImportDialogOpen, setIsImportDialogOpen] =
    useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importKol = useMutation({
    mutationFn: (input: KolFormState[]) =>
      client.kol.bulkImport(input),

    onSuccess: (result) => {
      toast.success(
        `Import selesai • ${result.summary.success} sukses • ${result.summary.skipped} skip • ${result.summary.failed} gagal`,
      );

      kolQuery.refetch();

      setImportResult(result);

      setIsImportDialogOpen(false);

      setIsImportResultDialogOpen(true);

      setImportPreview([]);
    },

    onError: (error) => {
      toast.error(
        getKolErrorMessage(
          error,
          "Import spreadsheet gagal",
        ),
      );
    },
  });


function parseSocialUrl(url: string): {
  platform: SocialPlatform;
  handle: string;
} | null {
  if (!url?.trim()) return null;

  try {
    const parsed = new URL(url.trim());

    const hostname = parsed.hostname.toLowerCase();

    const segments = parsed.pathname
      .split("/")
      .filter(Boolean);

    // TikTok
    if (hostname.includes("tiktok.com")) {
      const handleSegment = segments.find((s) =>
        s.startsWith("@"),
      );

      if (!handleSegment) return null;

      return {
        platform: "tiktok",
        handle: handleSegment.replace("@", "").trim(),
      };
    }

    // Instagram
    if (hostname.includes("instagram.com")) {
      const handle = segments[0];

      if (!handle) return null;

      return {
        platform: "instagram",
        handle: handle.trim(),
      };
    }

    return null;
  } catch {
    return null;
  }
}

function parsePlainSocialHandle(value: string, platform: string): {
  platform: SocialPlatform;
  handle: string;
} | null {
  const cleanHandle = value.trim().replace(/^@/, "");
  const normalizedPlatform = platform.trim().toLowerCase();

  if (!cleanHandle) return null;

  return {
    handle: cleanHandle,
    platform: normalizedPlatform === "tiktok" ? "tiktok" : "instagram",
  };
}

function mergeKeywords(
    existing: string,
    incoming?: string,
  ) {
    const set = new Set<string>();

    existing
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean)
      .forEach((k) => set.add(k));

    (incoming ?? "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean)
      .forEach((k) => set.add(k));

    return Array.from(set).join(",");
  }

  async function handleImportFile(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();

      const workbook = XLSX.read(buffer);

      const rows: RawExcelRow[] = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet =
          workbook.Sheets[sheetName];

        const parsedRows =
          XLSX.utils.sheet_to_json<RawExcelRow>(
            sheet,
          );

        rows.push(...parsedRows);
      }

      const kolMap: Record<
        string,
        KolFormState
      > = {};

      for (const row of rows) {
        const normalizedRow = Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key.trim().toLowerCase(),
            String(value ?? "").trim(),
          ]),
        );

        const nama =
          normalizedRow["nama"] ?? "";

        const username =
          normalizedRow["username"] ?? "";

        const persona =
          normalizedRow["persona kreator"] ?? "";

        const platform =
          normalizedRow["platform"] ?? "";

        // stop if all empty
        if (!nama && !username && !persona && !platform) {
          break;
        }

        // username required
        if (!username) {
          continue;
        }

        const displayName = nama || username.replace(/^@/, "");
        const key = displayName.toLowerCase();

        // create empty KOL
        if (!kolMap[key]) {
          kolMap[key] = {
            displayName,
            keywords: "",
            accounts: [],
          };
        }

        const kol = kolMap[key];

        // parse social account
        const social =
          parseSocialUrl(username) ??
          parseSocialUrl(nama) ??
          parsePlainSocialHandle(username, platform);

        if (social) {
          const exists = kol.accounts.some(
            (acc) =>
              acc.platform === social.platform &&
              acc.handle.toLowerCase() ===
                social.handle.toLowerCase(),
          );

          if (!exists) {
            kol.accounts.push(social);
          }
        }

        // merge keywords
        kol.keywords = mergeKeywords(
          kol.keywords,
          persona,
        );
      }

      const parsed =
        Object.values(kolMap);

      if (!parsed.length) {
        toast.error(
          "Tidak ada data valid ditemukan",
        );
        return;
      }

      setImportPreview(parsed);
      setIsImportDialogOpen(true);
    } catch {
      toast.error(
        "Gagal membaca spreadsheet",
      );
    } finally {
      event.target.value = "";
    }
  }

  function downloadImportTemplate() {
    const rows: RawExcelRow[] = [
      {
        Nama: "Contoh Nama KOL",
        Platform: "instagram",
        username: "@contohhandle",
        "Persona kreator": "beauty, lifestyle",
      },
    ];
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "Template KOL");
    XLSX.writeFile(workbook, "template-import-kol.xlsx");
  }


  return (
    <>
      <div
        className="h-full overflow-y-auto overflow-x-hidden bg-gradient-to-b from-background via-[#fff6f8] to-background py-6"

      >
        <div
          className="container mx-auto max-w-6xl space-y-5 px-4 lg:py-2"
          style={{ color: KOLS_COLORS.text }}
        >
          <section
            className="space-y-4 rounded-none border border-[#b43c39]/15 bg-white p-5 shadow-[8px_8px_0_rgba(152,46,65,0.10)]"
          >
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#B43C39]">KOL</p>
              <h1 className="font-goldman text-3xl font-bold uppercase tracking-wide text-[#2b1418] md:text-4xl">Daftar KOL</h1>
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-none border border-[#B43C39] bg-white px-4 text-[13px] font-medium text-[#B43C39] hover:bg-[#fff3d8] hover:text-[#8f2e2c]"
                onClick={downloadImportTemplate}
              >
                <Download className="mr-2 size-4" />
                Download Template
              </Button>

              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-none border border-[#B43C39] bg-white px-4 text-[13px] font-medium text-[#B43C39] hover:bg-[#fff3d8] hover:text-[#8f2e2c]"
                disabled={syncDueKols.isPending}
                onClick={() => syncDueKols.mutate()}
              >
                {syncDueKols.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCcw className="mr-2 size-4" />}
                {syncDueKols.isPending ? "Menyinkronkan..." : "Sinkronkan KOL terjadwal"}
              </Button>

              <Button
                type="button"
                onClick={openCreateDialog}
                className="h-8 rounded-none border border-[#B43C39] bg-[#B43C39] px-4 text-[13px] font-medium text-white hover:bg-[#8f2e2c]"
              >
                <Plus className="mr-2 size-4" />
                Tambah KOL
              </Button>

              <Button
                type="button"
                className="h-8 rounded-none border border-[#B43C39] bg-[#B43C39] px-4 text-[13px] font-medium text-white hover:bg-[#8f2e2c]"
                onClick={() =>
                  fileInputRef.current?.click()
                }
                disabled={importKol.isPending}
              >
                {importKol.isPending
                  ? "Mengimport..."
                  : "Import Spreadsheet"}
              </Button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleImportFile}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px_220px]">
            <Label className="grid gap-2 text-sm">
              <span>Cari</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#982E41]" />
                <Input
                  className="pl-9"
                  placeholder="itb1920"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </Label>
            <Label className="grid gap-2 text-sm">
              <span>Platform</span>
              <SearchableSelect
                className="border-[#b43c39]/20 bg-white text-[#2b1418] focus-visible:border-[#B43C39] focus-visible:ring-[#B43C39]/15"
                value={platformFilter}
                onValueChange={(value) => setPlatformFilter(value as typeof platformFilter)}
                options={[...PLATFORM_OPTIONS]}
                placeholder="Pilih platform"
                searchPlaceholder="Cari platform"
              />
            </Label>
            <Label className="grid gap-2 text-sm">
              <span>Tier</span>
              <SearchableSelect
                className="border-[#b43c39]/20 bg-white text-[#2b1418] focus-visible:border-[#B43C39] focus-visible:ring-[#B43C39]/15"
                value={tierFilter}
                onValueChange={setTierFilter}
                options={[{ label: "Semua tier", value: "all" }, ...tierOptions.map((tier) => ({ label: tier, value: tier }))]}
                placeholder="Pilih tier"
                searchPlaceholder="Cari tier"
              />
            </Label>
            <Label className="grid gap-2 text-sm">
              <span>Keyword</span>
              <SearchableSelect
                className="border-[#b43c39]/20 bg-white text-[#2b1418] focus-visible:border-[#B43C39] focus-visible:ring-[#B43C39]/15"
                value={keywordFilter}
                onValueChange={setKeywordFilter}
                options={[{ label: "Semua keyword", value: "all" }, ...keywordOptions.map((keyword) => ({ label: keyword, value: keyword }))]}
                placeholder="Pilih keyword"
                searchPlaceholder="Cari keyword"
              />
            </Label>
          </div>

          <div className="border border-dashed border-[#b43c39]/15" />

          <div className="space-y-5">
            {kolQuery.isLoading ? (
              <KolListSkeleton />
            ) : paginatedKols.map((kol) => (
              <div
                key={kol.id}
                className="space-y-4 rounded-none border border-[#b43c39]/15 bg-white p-4 shadow-[6px_6px_0_rgba(152,46,65,0.08)]"
              >
                {(() => {
                  const initials =
                    kol.displayName
                      .split(" ")
                      .slice(0, 2)
                      .map((part) => part[0]?.toUpperCase() ?? "")
                      .join("") || "K";
                  const avatarUrl = kol.accounts
                    .map((account) => getAccountMetadata(account.metadata)?.avatarUrl)
                    .find((url): url is string => Boolean(url));

                  return (
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    {avatarUrl ? (
                      <img
                        src={getAvatarSrc(avatarUrl)}
                        alt={kol.displayName}
                        className="size-12 shrink-0 border border-[#b43c39]/15 object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex size-12 shrink-0 items-center justify-center border border-[#b43c39]/15 bg-[#fff3d8] text-[14px] font-medium">
                        {initials}
                      </div>
                    )}
                    <div className="min-w-0">
                      <Link
                        to="/kols/$kolId"
                        params={{ kolId: String(kol.id) }}
                        className="text-[18px] font-semibold text-[#1D1114] hover:underline"
                      >
                        {kol.displayName}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <span className="border border-[#982E41]/20 bg-[#FFF8F9] px-2 py-1 text-[12px] font-medium text-[#722331]">
                          {formatFollowerTier(kol.followerTier)}
                        </span>
                        <span className="border border-[#982E41]/20 bg-white px-2 py-1 text-[12px] font-medium text-[#722331]">
                          {kol.accounts.length} Sosial Media
                        </span>
                      </div>
                      {kol.keywords && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {parseKeywordSegments(kol.keywords).map((keyword) => (
                            <span key={keyword} className="border border-[#982E41]/20 bg-white px-2 py-0.5 text-[12px] text-[#722331]">
                              {keyword}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-start gap-2 md:items-end">
                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          setSyncingKolId(kol.id);
                          const toastId = toast.loading(`Sinkronisasi ${kol.displayName} berjalan...`);

                          try {
                            await syncKol.mutateAsync({ id: kol.id });
                          } finally {
                            toast.dismiss(toastId);
                            setSyncingKolId((current) => (current === kol.id ? null : current));
                          }
                        }}
                        disabled={syncKol.isPending || kol.syncStatus === "pending"}
                        className={KOL_ACTION_BUTTON_CLASS}
                      >
                        {syncingKolId === kol.id || kol.syncStatus === "pending" ? (
                          <Loader2 className="mr-1 size-3.5 animate-spin" />
                        ) : (
                          <RefreshCcw className="mr-1 size-3.5" />
                        )}
                        {syncingKolId === kol.id || kol.syncStatus === "pending" ? "Menyinkronkan..." : "Sinkronkan"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => editKol(kol)}
                        className={KOL_ACTION_BUTTON_CLASS}
                      >
                        <PencilLine className="mr-1 size-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteTargetId(kol.id)}
                        aria-label={`Hapus ${kol.displayName}`}
                        title="Hapus"
                        className={KOL_ACTION_BUTTON_CLASS}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>

                    <p className="text-[13px]" style={{ color: KOLS_COLORS.darkText }}>
                      Sync: {(syncingKolId === kol.id || kol.syncStatus === "pending") && <Loader2 className="mr-1 inline size-3 animate-spin" />}
                      {kol.syncStatus} • {formatDateTime(kol.lastSyncedAt)}
                    </p>
                  </div>
                </div>
                  );
                })()}

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" style={{ color: KOLS_COLORS.darkText }}>
                  <MetricBox isLoading={kol.syncStatus === "pending"} label="Total followers" value={formatNumber(kol.totalFollowers)} />
                  <MetricBox isLoading={kol.syncStatus === "pending"} label="Avg likes" value={formatNumber(kol.averageLikes)} />
                  <MetricBox isLoading={kol.syncStatus === "pending"} label="Avg views" value={formatNumber(kol.averageViews)} />
                  <MetricBox isLoading={kol.syncStatus === "pending"} label="Engagement" value={kol.engagementRate || "-"} />
                </div>

                <div className="grid gap-1 text-[13px] md:grid-cols-2" style={{ color: KOLS_COLORS.text }}>
                  <p><span className="font-bold uppercase">Tier:</span> {formatFollowerTier(kol.followerTier)}</p>
                  <p><span className="font-medium">Post:</span> {formatRateWithEstimate(kol.actualRateCard?.post.suggested, kol.estimatedRateCard?.post.suggested)}</p>
                  <p><span className="font-medium">Story:</span> {formatRateWithEstimate(kol.actualRateCard?.story.suggested, kol.estimatedRateCard?.story.suggested)}</p>
                  <p><span className="font-medium">Reels:</span> {formatRateWithEstimate(kol.actualRateCard?.reel.suggested, kol.estimatedRateCard?.reel.suggested)}</p>
                </div>

                {kol.syncMessage && (
                  <p
                    className="wrap-break-word border px-3 py-2 text-[13px]"
                    style={{
                      borderColor: `${KOLS_COLORS.stroke}66`,
                      color: KOLS_COLORS.mutedText,
                    }}
                  >
                    {kol.syncMessage}
                  </p>
                )}

                <details className="group border border-[#b43c39]/15 bg-[#fff6f8] p-3">
                  <summary className="flex cursor-pointer items-center justify-between gap-3 text-[13px] font-semibold text-[#2b1418]">
                    <span className="inline-flex items-center gap-2">
                      <ChevronDown className="size-4 -rotate-90 text-[#982E41] transition-transform group-open:rotate-0" />
                      Sosial Media
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-normal text-[#722331]">
                      {kol.accounts.length} Sosial Media
                    </span>
                  </summary>
                  <div className="mt-3 grid gap-5">
                    {kol.accounts.map((account) => (
                    <div
                      key={account.id}
                      className="grid gap-3 border border-[#b43c39]/15 bg-[#fff6f8] p-3"
                    >
                      {(() => {
                        const metadata = getAccountMetadata(account.metadata);
                        const accountDisplayName = metadata?.fullName && metadata.fullName !== account.handle
                          ? metadata.fullName
                          : account.handle;

                        return (
                          <>
                            <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div className="flex min-w-0 items-start gap-3">
                                {metadata?.avatarUrl ? (
                                  <img
                                    src={getAvatarSrc(metadata.avatarUrl)}
                                    alt={`@${account.handle}`}
                                    className="size-14 shrink-0 border object-cover"
                                    style={{ borderColor: `${KOLS_COLORS.stroke}66` }}
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div
                                    className="flex size-14 shrink-0 items-center justify-center border text-[14px] font-medium uppercase"
                                    style={{
                                      backgroundColor: "#F8EAED",
                                      borderColor: `${KOLS_COLORS.stroke}66`,
                                    }}
                                  >
                                    {account.handle.slice(0, 2) || account.platform.slice(0, 2)}
                                  </div>
                                )}

                                <div className="min-w-0 space-y-1">
                                  <a
                                    href={getSocialUrl(account.platform, account.handle)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-2 text-[16px] font-bold uppercase leading-none text-[#1D1114] underline-offset-2 hover:underline"
                                  >
                                    <SocialPlatformIcon platform={account.platform} />
                                    {accountDisplayName}
                                  </a>
                                  <a
                                    href={getSocialUrl(account.platform, account.handle)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex wrap-break-word items-center gap-1 text-[13px] underline-offset-2 hover:underline"
                                    style={{ color: KOLS_COLORS.mutedText }}
                                  >
                                    @{account.handle}
                                  </a>
                                  <div className="flex flex-wrap gap-2 text-[12px]">
                                    {metadata?.verified && <MetaBadge>Verified</MetaBadge>}
                                    {metadata?.isBusinessAccount && <MetaBadge>Business</MetaBadge>}
                                    {metadata?.isPrivate && <MetaBadge>Private</MetaBadge>}
                                    {metadata?.category && <MetaBadge>{metadata.category}</MetaBadge>}
                                  </div>
                                  {metadata?.website && (
                                    <a
                                      href={metadata.website}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[13px] underline underline-offset-2"
                                      style={{ color: "#7C2536" }}
                                    >
                                      {metadata.website}
                                    </a>
                                  )}
                                </div>
                              </div>

                              <div className="grid gap-1 text-[13px] md:text-right" style={{ color: KOLS_COLORS.text }}>
                                <p><span className="font-medium">Status:</span> {account.syncStatus}</p>
                                <p><span className="font-medium">Last Sync:</span> {formatDateTime(account.lastSyncedAt)}</p>
                              </div>
                            </div>

                            <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6" style={{ color: KOLS_COLORS.darkText }}>
                              <MetricInline label="Followers" value={formatNumber(account.followers)} />
                              <MetricInline label="Following" value={formatNumber(metadata?.followingCount ?? 0)} />
                              <MetricInline label="Posts" value={formatNumber(metadata?.postsCount ?? 0)} />
                              <MetricInline label="Avg likes" value={formatNumber(account.averageLikes)} />
                              <MetricInline label="Avg views" value={formatNumber(account.averageViews)} />
                              <MetricInline label="ER" value={account.engagementRate || "-"} />
                            </div>

                            <RecentAccountPosts metadata={account.metadata} />

                            {account.syncMessage && (
                              <p
                                className="wrap-break-word border px-3 py-2 text-[13px]"
                                style={{
                                  borderColor: `${KOLS_COLORS.stroke}66`,
                                  color: KOLS_COLORS.mutedText,
                                }}
                              >
                                {account.syncMessage}
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    ))}
                  </div>
                </details>

                <details className="group border border-[#b43c39]/15 bg-white p-3">
                  <summary className="flex cursor-pointer items-center justify-between gap-3 text-[13px] font-semibold text-[#2b1418]">
                    <span className="inline-flex items-center gap-2">
                      <ChevronDown className="size-4 -rotate-90 text-[#982E41] transition-transform group-open:rotate-0" />
                      Post tersimpan
                    </span>
                    <span className="text-xs font-normal text-[#722331]">{kol.contents.length} post</span>
                  </summary>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {kol.contents.length ? kol.contents.map((content) => (
                      <a
                        key={content.id}
                        href={content.contentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="grid gap-3 border border-[#b43c39]/15 bg-[#fff6f8] p-3 text-[13px] text-[#2b1418] underline-offset-2 hover:bg-white"
                      >
                        {content.thumbnailUrl ? (
                          <img src={getAvatarSrc(content.thumbnailUrl)} alt={content.title || "Post"} className="aspect-video w-full border border-[#982E41]/15 object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="flex aspect-video w-full items-center justify-center border border-dashed border-[#982E41]/25 bg-white text-xs uppercase tracking-[0.14em] text-[#982E41]">
                            Post
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="mb-2 flex items-center gap-2 font-semibold uppercase tracking-[0.14em] text-[#982E41]">
                            <SocialPlatformIcon platform={content.platform} className="size-4" />
                            {getSocialPlatformLabel(content.platform)}
                          </div>
                          <p className="line-clamp-2 font-semibold">{getPostDisplayTitle(content)}</p>
                          <p className="mt-1 text-muted-foreground">
                            {content.campaignName ? `${content.campaignName} · ` : ""}
                            {formatDateTime(content.postedAt)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">Last sync: {formatDateTime(content.syncedAt)}</p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {formatNumber(content.viewCount)} views · {formatNumber(content.likeCount)} likes · {formatNumber(content.commentCount)} komentar · {formatNumber(content.shareCount)} shares
                          </p>
                        </div>
                      </a>
                    )) : (
                      <p className="text-[13px] text-muted-foreground">Belum ada post KOL ini yang tersimpan di database.</p>
                    )}
                  </div>
                </details>
              </div>
            ))}

            {!kolQuery.isLoading && !filteredKols.length && (
              <p className="text-[13px]" style={{ color: KOLS_COLORS.mutedText }}>
                Belum ada KOL yang tersimpan.
              </p>
            )}

            {!kolQuery.isLoading && filteredKols.length > 0 && (
              <PaginationControls
                page={kolPage}
                pageSize={KOL_PAGE_SIZE}
                totalItems={filteredKols.length}
                totalPages={totalKolPages}
                onPageChange={setKolPage}
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
        <DialogContent className="max-h-[92vh] max-w-6xl text-[#2b1418]" initialFocus={false}>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit KOL" : "Tambah KOL"}</DialogTitle>
          </DialogHeader>

          <form
            className="grid max-h-[calc(92vh-88px)] gap-5 overflow-y-auto overflow-x-hidden bg-white px-4 py-4 sm:px-6 sm:py-6"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="grid gap-5">
              <section className="grid gap-5 border border-[#982E41]/20 bg-white p-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: KOLS_COLORS.stroke }}>Profil KOL</p>
              </div>
              <DisplayNameInput
                label="Display name"
                value={form.displayName}
                options={displayNames}
                onChange={(value) => setForm((current) => ({ ...current, displayName: value }))}
              />
              <KeywordTokenInput
                label="Keywords"
                suggestions={keywordOptions}
                value={form.keywords}
                onChange={(value) => setForm((current) => ({ ...current, keywords: value }))}
              />
              </section>

              <section className="grid gap-3 border border-[#982E41]/20 bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-[15px] font-medium">Akun sosial</h2>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 rounded-none !border-2 !border-[#B43C39] !bg-[#B43C39] px-3 !text-[13px] !font-medium !text-white shadow-[0_0_0_1px_rgba(152,46,65,0.08)] transition-colors hover:!bg-[#8f2e2c] hover:!text-white focus-visible:!ring-2 focus-visible:!ring-[#B43C39]/15"
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
                  className="grid min-w-0 items-end gap-4 border border-[#982E41]/40 bg-white p-3 md:grid-cols-2 xl:grid-cols-[0.8fr_1fr_auto]"
                >
                  <PlatformSelect
                    value={account.platform}
                    onChange={(platform) => {
                      setForm((current) => ({
                        ...current,
                        accounts: current.accounts.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, platform } : item,
                        ),
                      }));
                    }}
                  />

                  <FormInput
                    label="Handle"
                    placeholder="digi.wonder"
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

                  <div className="flex items-center xl:justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-[#982E41] hover:bg-[#982E41]/10 hover:text-[#982E41]"
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
            </section>

              <section className="grid gap-3 border border-[#982E41]/20 bg-white p-4">
                <div>
                  <h2 className="text-[15px] font-medium">Rate</h2>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <FormInput
                    label="Post"
                    placeholder="Rp0"
                    value={formatRupiahInput(form.actualPostRate)}
                    onChange={(actualPostRate) => setForm((current) => ({ ...current, actualPostRate: sanitizeIntegerInput(actualPostRate) }))}
                  />
                  <FormInput
                    label="Story"
                    placeholder="Rp0"
                    value={formatRupiahInput(form.actualStoryRate)}
                    onChange={(actualStoryRate) => setForm((current) => ({ ...current, actualStoryRate: sanitizeIntegerInput(actualStoryRate) }))}
                  />
                  <FormInput
                    label="Reels"
                    placeholder="Rp0"
                    value={formatRupiahInput(form.actualReelRate)}
                    onChange={(actualReelRate) => setForm((current) => ({ ...current, actualReelRate: sanitizeIntegerInput(actualReelRate) }))}
                  />
                </div>
              </section>
            </div>

            <DialogFooter className="static shadow-none">
              {editingId && (
                <Button
                  type="button"
                  variant="outline"
                  className="border-[#982E41] text-[#982E41] hover:bg-[#982E41]/10 hover:text-[#982E41]"
                  onClick={resetForm}
                >
                  Batal edit
                </Button>
              )}
              <Button
                type="submit"
                disabled={createKol.isPending || updateKol.isPending}
                className="border border-[#982E41] bg-[#982E41] text-white hover:bg-[#7E2334]"
              >
                {(editingId ? updateKol.isPending : createKol.isPending) && <Loader2 className="mr-2 size-4 animate-spin" />}
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

      <Dialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTargetId(null);
          }
        }}
      >
        <DialogContent
          className="max-w-md"
          style={{
            backgroundColor: KOLS_COLORS.surface,
            borderColor: KOLS_COLORS.stroke,
            color: KOLS_COLORS.text,
          }}
        >
          <DialogHeader>
            <DialogTitle>Konfirmasi Hapus KOL</DialogTitle>
          </DialogHeader>
          <p className="text-[13px]" style={{ color: KOLS_COLORS.mutedText }}>
            Apakah Anda yakin ingin menghapus KOL ini? Semua data akun dan riwayat campaign terkait juga akan dihapus. Tindakan ini tidak dapat dibatalkan.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-[#982E41] text-[#982E41] hover:bg-[#982E41]/10 hover:text-[#982E41]"
              onClick={() => setDeleteTargetId(null)}
            >
              Batal
            </Button>
            <Button
              disabled={deleteKol.isPending}
              className="border border-[#982E41] bg-[#982E41] text-white hover:bg-[#7E2334]"
              onClick={() => {
                if (deleteTargetId !== null) {
                  deleteKol.mutate({ id: deleteTargetId });
                }
              }}
            >
              {deleteKol.isPending ? "Menghapus..." : "Hapus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* import dialog */}
      <Dialog
        open={isImportDialogOpen}
        onOpenChange={(open) => {
          setIsImportDialogOpen(open);

          if (!open) {
            setImportPreview([]);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-5xl text-[#2b1418]">
          <DialogHeader>
            <DialogTitle>Preview Import Spreadsheet</DialogTitle>
          </DialogHeader>

          <div className="px-4 pb-4 sm:px-6">
            <div
              className="mb-4 border px-3 py-2 text-[13px]"
              style={{
                borderColor: `${KOLS_COLORS.stroke}66`,
                backgroundColor: "#FFF8F9",
              }}
            >
              {importPreview.length} KOL siap diimport
            </div>

            <div
              className="max-h-[60vh] overflow-auto border"
              style={{
                borderColor: `${KOLS_COLORS.stroke}66`,
              }}
            >
              <Table className="text-[13px]">
                <TableHeader
                  className="sticky top-0"
                  style={{
                    backgroundColor: "#F8EAED",
                  }}
                >
                  <TableRow>
                    <TableHead>
                      Display Name
                    </TableHead>

                    <TableHead>
                      Accounts
                    </TableHead>

                    <TableHead>
                      Keywords
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {importPreview.map((kol, index) => (
                    <TableRow
                      key={`${kol.displayName}-${index}`}
                      className="align-top"
                    >
                      <TableCell className="font-medium">
                        {kol.displayName}
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {kol.accounts.map((account) => (
                            <div
                              key={`${account.platform}-${account.handle}`}
                            >
                              <span className="font-medium uppercase">
                                {account.platform}
                              </span>
                              {" — "}
                              @{account.handle}
                            </div>
                          ))}
                        </div>
                      </TableCell>

                      <TableCell>
                        {kol.keywords || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <DialogFooter className="mt-4">
              <Button
                variant="outline"
                className="border-[#982E41] text-[#982E41] hover:bg-[#982E41]/10 hover:text-[#982E41]"
                onClick={() => {
                  setIsImportDialogOpen(false);
                  setImportPreview([]);
                }}
              >
                Cancel
              </Button>

              <Button
                disabled={
                  importKol.isPending ||
                  importPreview.length === 0
                }
                className="border border-[#982E41] bg-[#982E41] text-white hover:bg-[#7E2334]"
                onClick={() => {
                  importKol.mutate(importPreview);
                }}
              >
                {importKol.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {importKol.isPending ? "Importing..." : `Import ${importPreview.length} KOL`}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={isImportResultDialogOpen}
        onOpenChange={(open) => {
          setIsImportResultDialogOpen(open);

          if (!open) {
            setImportResult(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-5xl text-[#2b1418]">
          <DialogHeader>
            <DialogTitle>Hasil Import Spreadsheet</DialogTitle>
          </DialogHeader>

          {importResult && (
            <div className="px-4 pb-4 sm:px-6">
              {/* summary */}
              <div className="grid gap-3 md:grid-cols-4">
                <div
                  className="border p-3"
                  style={{
                    borderColor: `${KOLS_COLORS.stroke}66`,
                    backgroundColor: "#FFF8F9",
                  }}
                >
                  <p
                    className="text-[12px] uppercase tracking-[0.2em]"
                    style={{
                      color: KOLS_COLORS.stroke,
                    }}
                  >
                    Total
                  </p>

                  <p className="mt-1 text-[24px] font-semibold">
                    {importResult.summary.total}
                  </p>
                </div>

                <div
                  className="border p-3"
                  style={{
                    borderColor: `${KOLS_COLORS.stroke}66`,
                    backgroundColor: "#FFF8F9",
                  }}
                >
                  <p
                    className="text-[12px] uppercase tracking-[0.2em]"
                    style={{
                      color: KOLS_COLORS.stroke,
                    }}
                  >
                    Success
                  </p>

                  <p className="mt-1 text-[24px] font-semibold">
                    {importResult.summary.success}
                  </p>
                </div>

                <div
                  className="border p-3"
                  style={{
                    borderColor: `${KOLS_COLORS.stroke}66`,
                    backgroundColor: "#FFF8F9",
                  }}
                >
                  <p
                    className="text-[12px] uppercase tracking-[0.2em]"
                    style={{
                      color: KOLS_COLORS.stroke,
                    }}
                  >
                    Skipped
                  </p>

                  <p className="mt-1 text-[24px] font-semibold">
                    {importResult.summary.skipped}
                  </p>
                </div>

                <div
                  className="border p-3"
                  style={{
                    borderColor: `${KOLS_COLORS.stroke}66`,
                    backgroundColor: "#FFF8F9",
                  }}
                >
                  <p
                    className="text-[12px] uppercase tracking-[0.2em]"
                    style={{
                      color: KOLS_COLORS.stroke,
                    }}
                  >
                    Failed
                  </p>

                  <p className="mt-1 text-[24px] font-semibold">
                    {importResult.summary.failed}
                  </p>
                </div>
              </div>

              {/* skipped */}
              {importResult.skipped.length > 0 && (
                <div className="mt-5">
                  <div
                    className="mb-2 border-b pb-2"
                    style={{
                      borderColor: `${KOLS_COLORS.stroke}66`,
                    }}
                  >
                    <h3 className="text-[14px] font-semibold">
                      Skipped
                    </h3>

                    <p
                      className="text-[12px]"
                      style={{
                        color: KOLS_COLORS.mutedText,
                      }}
                    >
                      KOL sudah ada di database
                    </p>
                  </div>

                  <div
                    className="max-h-[220px] overflow-auto border"
                    style={{
                      borderColor: `${KOLS_COLORS.stroke}66`,
                    }}
                  >
                    <table className="w-full border-collapse text-[13px]">
                      <thead
                        className="sticky top-0"
                        style={{
                          backgroundColor: "#F8EAED",
                        }}
                      >
                        <tr>
                          <th className="border-b px-3 py-2 text-left">
                            Display Name
                          </th>

                          <th className="border-b px-3 py-2 text-left">
                            Reason
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {importResult.skipped.map(
                          (item: any, index: number) => (
                            <tr key={index}>
                              <td className="border-b px-3 py-2 font-medium">
                                {item.displayName}
                              </td>

                              <td className="border-b px-3 py-2">
                                {item.reason}
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* failed */}
              {importResult.failed.length > 0 && (
                <div className="mt-5">
                  <div
                    className="mb-2 border-b pb-2"
                    style={{
                      borderColor: `${KOLS_COLORS.stroke}66`,
                    }}
                  >
                    <h3 className="text-[14px] font-semibold">
                      Failed
                    </h3>

                    <p
                      className="text-[12px]"
                      style={{
                        color: KOLS_COLORS.mutedText,
                      }}
                    >
                      KOL gagal divalidasi atau akun tidak ditemukan
                    </p>
                  </div>

                  <div
                    className="max-h-[220px] overflow-auto border"
                    style={{
                      borderColor: `${KOLS_COLORS.stroke}66`,
                    }}
                  >
                    <table className="w-full border-collapse text-[13px]">
                      <thead
                        className="sticky top-0"
                        style={{
                          backgroundColor: "#F8EAED",
                        }}
                      >
                        <tr>
                          <th className="border-b px-3 py-2 text-left">
                            Display Name
                          </th>

                          <th className="border-b px-3 py-2 text-left">
                            Reason
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {importResult.failed.map(
                          (item: any, index: number) => (
                            <tr key={index}>
                              <td className="border-b px-3 py-2 font-medium">
                                {item.displayName}
                              </td>

                              <td className="border-b px-3 py-2">
                                {item.reason}
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <DialogFooter className="mt-5">
                <Button
                  className="border border-[#982E41] bg-[#982E41] text-white hover:bg-[#7E2334]"
                  onClick={() => {
                    setIsImportResultDialogOpen(false);
                    setImportResult(null);
                  }}
                >
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DisplayNameInput({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  const [open, setOpen] = useState(false);

  const filtered = options.filter((opt) =>
    opt.toLowerCase().includes(value.toLowerCase())
  );

  return (
    <div className="relative">
      <Label className="grid gap-2">
        <span>{label}</span>

        <Input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setTimeout(() => setOpen(false), 100);
          }}
          className="border-[#b43c39]/20 bg-white text-[#2b1418] placeholder:text-[#A16A75] focus-visible:border-[#B43C39] focus-visible:ring-[#B43C39]/15"
        />
      </Label>

      {open && filtered.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-28 w-full overflow-y-auto border border-[#982E41]/80 bg-gradient-to-b from-background via-[#fff6f8] to-background shadow-lg">
          {filtered.map((opt) => (
            <div
              key={opt}
              className="cursor-pointer px-3 py-2 text-[#2b1418] hover:bg-[#F4DCE1]"
              onMouseDown={() => {
                onChange(opt);
                setOpen(false);
              }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FormInput({
  label,
  onChange,
  placeholder,
  type = "text",
  value,
  onKeyDown,
  ghost,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  value: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  ghost?: string;
}) {
  return (
    <Label className="grid min-w-0 gap-2">
      {label ? <span>{label}</span> : <span aria-hidden="true">&nbsp;</span>}

      <div className="relative">
        {ghost && (
          <div className="pointer-events-none absolute inset-0 flex items-center">
            <span className="w-full px-3 pb-0.25 text-transparent">
              {value}
              <span className="text-[#B16A77]">{ghost}</span>
            </span>
          </div>
        )}

        <Input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          required={!placeholder}
          className={`
            relative w-full rounded-none
            border-[#b43c39]/20 bg-white text-[#2b1418] placeholder:text-[#A16A75]
            focus-visible:border-[#B43C39] focus-visible:ring-[#B43C39]/15
            ${ghost ? "bg-transparent" : ""}
          `}
        />
      </div>
    </Label>
  );
}

function PlatformSelect({ onChange, value }: { onChange: (value: SocialPlatform) => void; value: SocialPlatform }) {
  return (
    <Label className="grid gap-2">
      <span className="sr-only">Platform</span>
      <div className="relative">
        <SocialPlatformIcon
          platform={value}
          className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-[#982E41]"
        />
        <SearchableSelect
          aria-label="Platform"
          className="pl-9 text-[12px]"
          value={value}
          onValueChange={(nextValue) => onChange(nextValue as SocialPlatform)}
          options={[...SOCIAL_PLATFORM_OPTIONS]}
          placeholder="Pilih platform"
          searchPlaceholder="Cari platform"
        />
      </div>
    </Label>
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
  const tokens = parseKeywordSegments(value);
  const [draft, setDraft] = useState("");
  const normalizedDraft = draft.trim().replace(/^#+/, "").toLowerCase();
  const visibleSuggestions = suggestions
    .filter((suggestion) => !tokens.some((token) => token.toLowerCase() === suggestion.toLowerCase()))
    .filter((suggestion) => !normalizedDraft || suggestion.toLowerCase().includes(normalizedDraft))
    .slice(0, 8);

  function commitDraft(rawDraft = draft) {
    const nextTokens = parseKeywordSegments(rawDraft);
    if (!nextTokens.length) {
      setDraft("");
      return;
    }

    onChange(encodeKeywordSegments([...tokens, ...nextTokens]));
    setDraft("");
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
            onClick={() => onChange(encodeKeywordSegments(tokens.filter((item) => item !== token)))}
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
              onChange(encodeKeywordSegments(tokens.slice(0, -1)));
            }
          }}
          placeholder={tokens.length ? "Tambah lalu tekan spasi" : "Ketik keyword lalu tekan spasi"}
        />
      </div>
      {visibleSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {visibleSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="border border-[#982E41]/20 bg-white px-2 py-1 text-xs text-[#982E41] hover:bg-[#FFF8F9]"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onChange(encodeKeywordSegments([...tokens, suggestion]))}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PaginationControls({
  onPageChange,
  page,
  pageSize,
  totalItems,
  totalPages,
}: {
  onPageChange: (page: number) => void;
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
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={KOL_ACTION_BUTTON_CLASS}
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          Sebelumnya
        </Button>
        <Input
          aria-label="Halaman KOL"
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
          className={KOL_ACTION_BUTTON_CLASS}
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        >
          Berikutnya
        </Button>
      </div>
    </div>
  );
}

function MetricBox({ isLoading = false, label, value }: { isLoading?: boolean; label: string; value: string }) {
  return (
    <div className="grid gap-1 border border-[#b43c39]/15 bg-white/70 px-3 py-2">
      <p className="text-[13px] uppercase tracking-[0.22em]" style={{ color: KOLS_COLORS.stroke }}>{label}</p>
      {isLoading ? <Skeleton className="h-5 w-20 bg-[#b43c39]/10" /> : <p className="text-[19px] font-[560] leading-none tracking-[0.04em]">{value}</p>}
    </div>
  );
}

function MetricInline({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-[0.22em]" style={{ color: KOLS_COLORS.darkText }}>{label}</p>
      <p className="truncate text-[17px] font-[500] leading-none tracking-[0.04em]">{value}</p>
    </div>
  );
}

function MetaBadge({ children }: { children: string }) {
  //badge metadata (Verified/Business/dll).
  return <span className="border border-[#982E41] bg-[#B33C39] px-2 py-1 text-[12px] leading-none text-white">{children}</span>;
}

function RecentAccountPosts({ metadata }: { metadata: Record<string, unknown> | null }) {
  const posts = getRecentAccountPosts(metadata, 3);

  if (!posts.length) {
    return null;
  }

  return (
    <div className="grid gap-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: KOLS_COLORS.stroke }}>
        Recent post dari Sosial Media
      </p>
      <div className="grid gap-2 md:grid-cols-3">
        {posts.map((post, index) => {
          const body = (
            <>
              {post.thumbnailUrl ? (
                <img
                  src={getAvatarSrc(post.thumbnailUrl)}
                  alt={post.title}
                  className="aspect-video w-full border border-[#982E41]/15 object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center border border-dashed border-[#982E41]/25 bg-white text-xs uppercase tracking-[0.14em] text-[#982E41]">
                  Post
                </div>
              )}
              <div className="min-w-0 space-y-1">
                <p className="line-clamp-2 text-[12px] font-semibold text-[#2b1418]">{post.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatNumber(post.viewCount)} views · {formatNumber(post.likeCount)} likes · {formatNumber(post.commentCount)} komentar · {formatNumber(post.shareCount)} shares
                </p>
              </div>
            </>
          );

          return post.contentUrl ? (
            <a
              key={`${post.contentUrl}-${index}`}
              href={post.contentUrl}
              target="_blank"
              rel="noreferrer"
              className="grid gap-2 border border-[#b43c39]/15 bg-white p-2 underline-offset-2 hover:bg-[#fff6f8]"
            >
              {body}
            </a>
          ) : (
            <div key={index} className="grid gap-2 border border-[#b43c39]/15 bg-white p-2">
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}


function KolListSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="space-y-4 rounded-none border border-[#b43c39]/15 bg-white p-4 shadow-[6px_6px_0_rgba(152,46,65,0.08)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <Skeleton className="size-12 shrink-0" />
              <div className="min-w-0 space-y-2">
                <Skeleton className="h-5 w-48 max-w-full" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-72 max-w-full" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-20" />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, metricIndex) => (
              <div key={metricIndex} className="border border-[#b43c39]/15 bg-white/70 px-3 py-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2 h-5 w-20" />
              </div>
            ))}
          </div>

          <div className="grid gap-1 text-[13px] md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, detailIndex) => (
              <Skeleton key={detailIndex} className="h-4 w-full max-w-56" />
            ))}
          </div>

          <div className="grid gap-5">
            {Array.from({ length: 2 }).map((_, accountIndex) => (
              <div key={accountIndex} className="grid gap-3 border border-[#b43c39]/15 bg-[#fff6f8] p-3">
                <div className="flex min-w-0 items-start gap-3">
                  <Skeleton className="size-14 shrink-0" />
                  <div className="min-w-0 space-y-2">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-4 w-40 max-w-full" />
                    <div className="flex gap-2">
                      <Skeleton className="h-6 w-16" />
                      <Skeleton className="h-6 w-20" />
                    </div>
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
                  {Array.from({ length: 6 }).map((_, metricIndex) => (
                    <Skeleton key={metricIndex} className="h-9 w-full" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

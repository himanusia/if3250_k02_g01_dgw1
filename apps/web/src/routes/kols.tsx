import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { PencilLine, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, useRef  } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import type { KolRecord, SocialPlatform } from "@/lib/app-types";
import { formatCurrencyIdr, formatDateTime, formatNumber, getAccountMetadata, getAvatarSrc } from "@/lib/kol-utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type KolFormState = {
  accounts: KolAccountFormState[];
  displayName: string;
  keywords: string;
};

type RawExcelRow = {
  Nama?: string;
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
    displayName: "",
    keywords: "",
  };
}

function parseKeywordSegments(keywords: string | null | undefined): string[] {
  const raw = keywords?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
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
  "h-7 rounded-none !border !border-[#982E41] !bg-[#F7E7EB] px-2.5 !text-[12px] !font-normal !text-[#982E41] transition-colors hover:!bg-[#982E41] hover:!text-[#ffffff]";
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
});

function RouteComponent() {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<KolFormState>(getDefaultForm());
  const kolQuery = useQuery(orpc.kol.list.queryOptions());
  const kols = (kolQuery.data as KolRecord[] | undefined) ?? [];
  const filteredKols = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return kols;
    }

    return kols.filter((kol) => {
      const haystack = [
        kol.displayName,
        kol.keywords,
        ...kol.accounts.map((account) => account.biography ?? ""),
        ...kol.accounts.map((account) => `${account.platform} ${account.handle}`),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [kols, search]);

  const createKol = useMutation({
    mutationFn: (input: KolFormState) => client.kol.create(input),
    onSuccess: () => {
      toast.success("KOL berhasil ditambahkan ke database");
      kolQuery.refetch();
      resetForm();
    },
    onError: (error) => {
      toast.error(getKolErrorMessage(error, "Gagal menambahkan KOL"));
    },
  });

  const updateKol = useMutation({
    mutationFn: (input: KolFormState & { id: number }) => client.kol.update(input),
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
    onSuccess: () => {
      toast.success("Data KOL berhasil disinkronkan");
      kolQuery.refetch();
    },
    onError: (error) => {
      toast.error(getKolErrorMessage(error, "Sinkronisasi KOL gagal"));
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
      accounts: kol.accounts.map((account) => ({
        handle: account.handle,
        platform: account.platform,
      })),
      displayName: kol.displayName,
      keywords: kol.keywords,
    });
    setIsDialogOpen(true);
  }

  const allKeywords = useMemo(() => {
    return Array.from(
      new Set(filteredKols.flatMap((kol) => parseKeywordSegments(kol.keywords))),
    );
  }, [filteredKols]);

  const displayNames = useMemo(() => {
    return Array.from(
      new Set(filteredKols.map((kol) => kol.displayName))
    );
  }, [filteredKols]);

  const getBestMatch = (input: string) => {
    const parts = input.split(",");
    const lastRaw = parts[parts.length - 1];
    const last = lastRaw.trim().toLowerCase();

    if (!last) return "";

    const matches = allKeywords.filter((k) =>
      k.toLowerCase().startsWith(last)
    );

    if (matches.length === 0) return "";

    matches.sort((a, b) => {
      const aRemain = a.length - last.length;
      const bRemain = b.length - last.length;
      return aRemain - bRemain;
    });

    const best = matches[0];

    return best.slice(last.length);
  };

  const suggestion = getBestMatch(form.keywords);

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
    if (editingId) {
      updateKol.mutate({
        id: editingId,
        ...form,
      });
      return;
    }

    createKol.mutate(form);
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

        // stop if all empty
        if (!nama && !username && !persona) {
          break;
        }

        // username required
        if (!username) {
          continue;
        }

        const key = username.toLowerCase();

        // create empty KOL
        if (!kolMap[key]) {
          kolMap[key] = {
            displayName: username,
            keywords: "",
            accounts: [],
          };
        }

        const kol = kolMap[key];

        // parse social account
        const social = parseSocialUrl(nama);

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
    } catch (error) {
      console.error(error);

      toast.error(
        "Gagal membaca spreadsheet",
      );
    } finally {
      event.target.value = "";
    }
  }


  return (
    <>
      <div
        className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] min-h-screen w-screen py-6"
        style={{ backgroundColor: KOLS_COLORS.pageBackground }}
      >
        <div
          className="mx-auto w-[98vw] max-w-[1700px] space-y-6 px-[10px] md:px-[14px] [font-family:var(--font-poppins)] font-normal"
          style={{ color: KOLS_COLORS.text }}
        >
          <section
            className="space-y-4 border p-4"
            style={{
              backgroundColor: "#FFFFFF",
              borderColor: `${KOLS_COLORS.stroke}80`,
            }}
          >
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <h1 className="text-[22px] font-bold uppercase tracking-tight md:text-[32px]">Daftar KOL</h1>
            <Button
              type="button"
              onClick={openCreateDialog}
              className="h-8 rounded-full border border-[#DDAEB8] bg-[#EEDDE1] px-4 text-[13px] font-medium text-[#982E41] hover:bg-[#E4CBD2]"
            >
              <Plus className="mr-2 size-4" />
              Tambah KOL
            </Button>

            <Button
              type="button"
              className="h-8 rounded-full border border-[#DDAEB8] bg-[#EEDDE1] px-4 text-[13px] font-medium text-[#982E41] hover:bg-[#E4CBD2]"
              onClick={() =>
                fileInputRef.current?.click()
              }
              disabled={importKol.isPending}
            >
              {importKol.isPending
                ? "Mengimport..."
                : "Import Spreadsheet"}
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleImportFile}
            />
          </div>

          <div className="max-w-md">
            <FormInput label="Search" value={search} onChange={setSearch} placeholder="Cari Nama, Handle, Keyword" />
          </div>

          <div className="border-[1.2px] border-dashed" style={{ borderColor: `${KOLS_COLORS.stroke}80` }} />

          <div className="space-y-5">
            {filteredKols.map((kol) => (
              <div
                key={kol.id}
                className="space-y-4 border-[1.6px] bg-white p-4"
                style={{ borderColor: `${KOLS_COLORS.stroke}66` }}
              >
                {(() => {
                  const primaryAccount = kol.accounts[0];
                  const biography = kol.accounts.find((account) => account.biography)?.biography;
                  const primaryMetadata = primaryAccount ? getAccountMetadata(primaryAccount.metadata) : null;
                  const initials =
                    kol.displayName
                      .split(" ")
                      .slice(0, 2)
                      .map((part) => part[0]?.toUpperCase() ?? "")
                      .join("") || "K";

                  return (
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    {primaryMetadata?.avatarUrl ? (
                      <img
                        src={getAvatarSrc(primaryMetadata.avatarUrl)}
                        alt={kol.displayName}
                        className="size-12 shrink-0 border object-cover"
                        style={{ borderColor: `${KOLS_COLORS.stroke}66` }}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div
                        className="flex size-12 shrink-0 items-center justify-center border text-[14px] font-medium"
                        style={{
                          backgroundColor: "#F8EAED",
                          borderColor: `${KOLS_COLORS.stroke}66`,
                        }}
                      >
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
                      <p className="text-[13px]" style={{ color: KOLS_COLORS.text }}>
                        {kol.accounts.length} akun terhubung
                      </p>
                      {primaryMetadata?.category && (
                        <p className="text-[13px]" style={{ color: KOLS_COLORS.mutedText }}>
                          {primaryMetadata.category}
                        </p>
                      )}
                      {biography && (
                        <p className="mt-1 text-[13px] wrap-break-word" style={{ color: KOLS_COLORS.mutedText }}>
                          {biography}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-start gap-2 md:items-end">
                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        className={KOL_ACTION_BUTTON_CLASS}
                        onClick={() => {
                          toast.info("masih dummy");
                        }}
                      >
                        Atur Sinkronisasi
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => syncKol.mutate({ id: kol.id })}
                        disabled={syncKol.isPending}
                        className={KOL_ACTION_BUTTON_CLASS}
                      >
                        <RefreshCcw className="mr-1 size-3.5" />
                        Sinkronkan
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
                        className={KOL_ACTION_BUTTON_CLASS}
                      >
                        <Trash2 className="mr-1 size-3.5" />
                        Hapus
                      </Button>
                    </div>

                    <p className="text-[13px]" style={{ color: KOLS_COLORS.darkText }}>
                      Auto Sinkron: -
                    </p>
                  </div>
                </div>
                  );
                })()}

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4 text-[6px]" style={{ color: KOLS_COLORS.darkText }}>
                  <MetricBox label="Total followers" value={formatNumber(kol.totalFollowers)} />
                  <MetricBox label="Avg likes" value={formatNumber(kol.averageLikes)} />
                  <MetricBox label="Avg views" value={formatNumber(kol.averageViews)} />
                  <MetricBox label="Engagement" value={kol.engagementRate || "-"} />
                </div>

                <div className="grid gap-1 text-[13px] md:grid-cols-2" style={{ color: KOLS_COLORS.text }}>
                  <p><span className="font-bold uppercase">Tier:</span> {kol.followerTier}</p>
                  <p><span className="font-medium">Status sync:</span> {kol.syncStatus}</p>
                  <p><span className="font-bold">Last Sync:</span> {formatDateTime(kol.lastSyncedAt)}</p>
                  <p><span className="font-medium">Est. post:</span> {formatCurrencyIdr(kol.estimatedRateCard?.post.suggested)}</p>
                  <p><span className="font-medium">Actual post:</span> {formatCurrencyIdr(kol.actualRateCard?.post.suggested)}</p>
                  <p><span className="font-medium">Est. story:</span> {formatCurrencyIdr(kol.estimatedRateCard?.story.suggested)}</p>
                  <p><span className="font-medium">Actual story:</span> {formatCurrencyIdr(kol.actualRateCard?.story.suggested)}</p>
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

                <div className="grid gap-5">
                  {kol.accounts.map((account) => (
                    <div
                      key={account.id}
                      className="grid gap-3 border-[1.6px] bg-[#FFF5F7] p-3"
                      style={{ borderColor: `${KOLS_COLORS.darkText}66` }}
                    >
                      {(() => {
                        const metadata = getAccountMetadata(account.metadata);

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
                                  <p className="text-[16px] font-bold uppercase leading-none">{account.platform}</p>
                                  <p className="wrap-break-word text-[13px]" style={{ color: KOLS_COLORS.mutedText }}>
                                    @{account.handle}
                                  </p>
                                  {metadata?.fullName && metadata.fullName !== account.handle && (
                                    <p className="text-[13px]">{metadata.fullName}</p>
                                  )}
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

                {kol.keywords && (
                  <p className="text-[13px]" style={{ color: KOLS_COLORS.text }}>
                    <span className="font-semibold">Keywords:</span> {kol.keywords}
                  </p>
                )}
              </div>
            ))}

            {!filteredKols.length && (
              <p className="text-[13px]" style={{ color: KOLS_COLORS.mutedText }}>
                Belum ada KOL yang tersimpan.
              </p>
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
        <DialogContent
          className="max-h-[92vh] max-w-6xl overflow-y-auto border p-0"
          style={{
            backgroundColor: "#FFFFFF",
            borderColor: KOLS_COLORS.stroke,
            color: KOLS_COLORS.text,
          }}
        >
          <DialogHeader>
            <div className="border-b px-4 py-4 sm:px-6" style={{ borderColor: `${KOLS_COLORS.stroke}66` }}>
              <DialogTitle>{editingId ? "Edit KOL" : "Tambah KOL"}</DialogTitle>
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
              <DisplayNameInput
                label="Display name"
                value={form.displayName}
                options={displayNames}
                onChange={(value) => setForm((current) => ({ ...current, displayName: value }))}
              />
              <FormInput
                label="Keywords"
                value={form.keywords}
                onChange={(value) => {setForm((current) => ({ ...current, keywords: value }));}}
                ghost={suggestion}
                onKeyDown={(e) => {
                  if (e.key === "Tab" && suggestion) {
                    e.preventDefault();

                    const parts = form.keywords.split(",");
                    const last = parts.pop() ?? "";

                    const trimmed = last.trim();
                    const completed = trimmed + suggestion;

                    parts.push(" " + completed);

                    const newValue = parts.join(",").replace(/^ /, "");

                    setForm((current) => ({
                      ...current,
                      keywords: newValue,
                    }));
                  }
                }}
              />
            </div>

            <div className="grid gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-[15px] font-medium">Akun</h2>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 rounded-none !border-2 !border-[#982E41] !bg-[#F3D7DE] px-3 !text-[13px] !font-medium !text-[#7A2233] shadow-[0_0_0_1px_rgba(152,46,65,0.08)] transition-colors hover:!bg-[#982E41] hover:!text-white focus-visible:!ring-2 focus-visible:!ring-[#982E41]/30"
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
                  className="grid min-w-0 gap-4 border bg-white/50 p-3 md:grid-cols-2 xl:grid-cols-[0.8fr_1fr_auto]"
                  style={{ borderColor: `${KOLS_COLORS.stroke}66` }}
                >
                  <Label className="grid gap-2">
                    <span>Platform</span>
                    <select
                      className="min-h-10 w-full min-w-0 rounded-none border border-[#982E41]/60 bg-white/80 px-3 text-[12px] outline-none focus-visible:border-[#982E41] focus-visible:ring-1 focus-visible:ring-[#982E41]/30"
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

                  <div className="flex items-end xl:justify-end">
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
            </div>

            <DialogFooter className="border-t pt-4" style={{ borderColor: `${KOLS_COLORS.stroke}66` }}>
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
          className="border"
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
        <DialogContent
          className="max-h-[90vh] max-w-5xl overflow-hidden border p-0"
          style={{
            backgroundColor: "#FFFFFF",
            borderColor: KOLS_COLORS.stroke,
            color: KOLS_COLORS.text,
          }}
        >
          <DialogHeader>
            <div
              className="border-b px-4 py-4 sm:px-6"
              style={{
                borderColor: `${KOLS_COLORS.stroke}66`,
              }}
            >
              <DialogTitle>
                Preview Import Spreadsheet
              </DialogTitle>
            </div>
          </DialogHeader>

          <div className="px-4 pb-4 sm:px-6">
            <div
              className="mb-4 rounded border px-3 py-2 text-[13px]"
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
                      Accounts
                    </th>

                    <th className="border-b px-3 py-2 text-left">
                      Keywords
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {importPreview.map((kol, index) => (
                    <tr
                      key={`${kol.displayName}-${index}`}
                      className="align-top"
                    >
                      <td className="border-b px-3 py-2 font-medium">
                        {kol.displayName}
                      </td>

                      <td className="border-b px-3 py-2">
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
                      </td>

                      <td className="border-b px-3 py-2">
                        {kol.keywords || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <DialogFooter className="mt-4">
              <Button
                variant="outline"
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
                {importKol.isPending
                  ? "Importing..."
                  : `Import ${importPreview.length} KOL`}
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
        <DialogContent
          className="max-h-[90vh] max-w-5xl overflow-hidden border p-0"
          style={{
            backgroundColor: "#FFFFFF",
            borderColor: KOLS_COLORS.stroke,
            color: KOLS_COLORS.text,
          }}
        >
          <DialogHeader>
            <div
              className="border-b px-4 py-4 sm:px-6"
              style={{
                borderColor: `${KOLS_COLORS.stroke}66`,
              }}
            >
              <DialogTitle>
                Hasil Import Spreadsheet
              </DialogTitle>
            </div>
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

              <DialogFooter className="mt-5 border-t pt-4">
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
      <label className="grid gap-2">
        <span>{label}</span>

        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setTimeout(() => setOpen(false), 100);
          }}
          className="w-full rounded-[6px] border border-[#982E41]/70 bg-white px-3 py-2 text-[#2B1418] outline-none focus:border-[#982E41]"
        />
      </label>

      {open && filtered.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-28 w-full overflow-y-auto border border-[#982E41]/80 bg-[#FFF8F9] shadow-lg">
          {filtered.map((opt) => (
            <div
              key={opt}
              className="cursor-pointer px-3 py-2 text-[#2B1418] hover:bg-[#F4DCE1]"
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
  value,
  onKeyDown,
  ghost,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  ghost?: string;
}) {
  return (
    <Label className="grid min-w-0 gap-2">
      <span>{label}</span>

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
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          required={!placeholder}
          className={`
            relative w-full rounded-[6px]
            border-[#982E41]/70 bg-white text-[#2B1418] placeholder:text-[#A16A75]
            focus-visible:border-[#982E41] focus-visible:ring-[#982E41]/30
            ${ghost ? "bg-transparent" : ""}
          `}
        />
      </div>
    </Label>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-[1.6px] bg-white/70 px-3 py-2" style={{ borderColor: `${KOLS_COLORS.stroke}80` }}>
      <p className="text-[13px] uppercase tracking-[0.22em]" style={{ color: KOLS_COLORS.stroke }}>{label}</p>
      <p className="text-[19px] font-[560] leading-none tracking-[0.04em]">{value}</p>
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

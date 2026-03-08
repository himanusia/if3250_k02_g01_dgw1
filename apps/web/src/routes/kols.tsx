import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PencilLine, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import type { KolRecord, SocialPlatform } from "@/lib/app-types";

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

export const Route = createFileRoute("/kols")({
  component: RouteComponent,
});

function RouteComponent() {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
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
      toast.error(error instanceof Error ? error.message : "Gagal menambahkan KOL");
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
      toast.error(error instanceof Error ? error.message : "Gagal memperbarui KOL");
    },
  });

  const syncKol = useMutation({
    mutationFn: ({ id }: { id: number }) => client.kol.syncMetrics({ id }),
    onSuccess: () => {
      toast.success("Data KOL berhasil disinkronkan");
      kolQuery.refetch();
    },
    onError: () => {
      toast.error("Sinkronisasi KOL gagal");
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

  return (
    <>
      <div className="container mx-auto space-y-6 px-4 py-6">
        <section className="bg-card ring-foreground/10 space-y-4 p-4 ring-1">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <h1 className="text-2xl font-semibold">Daftar KOL</h1>
            <Button type="button" onClick={openCreateDialog}>
              <Plus className="mr-2 size-4" />
              Tambah KOL
            </Button>
          </div>

          <div className="max-w-md">
            <FormInput label="Search" value={search} onChange={setSearch} placeholder="Cari nama, handle, keyword" />
          </div>

          <div className="space-y-3">
            {filteredKols.map((kol) => (
              <div key={kol.id} className="border-border space-y-4 border p-4">
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
                        src={primaryMetadata.avatarUrl}
                        alt={kol.displayName}
                        className="border-border size-12 shrink-0 border object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="bg-muted text-foreground flex size-12 shrink-0 items-center justify-center border text-sm font-medium">
                        {initials}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-medium">{kol.displayName}</p>
                      <p className="text-muted-foreground text-sm">{kol.accounts.length} akun terhubung</p>
                      {primaryMetadata?.category && (
                        <p className="text-muted-foreground text-sm">{primaryMetadata.category}</p>
                      )}
                      {biography && <p className="text-muted-foreground mt-1 text-sm wrap-break-word">{biography}</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => syncKol.mutate({ id: kol.id })}
                      disabled={syncKol.isPending}
                    >
                      <RefreshCcw className="mr-1 size-4" />
                      Sinkronkan
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => editKol(kol)}>
                      <PencilLine className="mr-1 size-4" />
                      Edit
                    </Button>
                  </div>
                </div>
                  );
                })()}

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricBox label="Total followers" value={formatNumber(kol.totalFollowers)} />
                  <MetricBox label="Avg likes" value={formatNumber(kol.averageLikes)} />
                  <MetricBox label="Avg views" value={formatNumber(kol.averageViews)} />
                  <MetricBox label="Engagement" value={kol.engagementRate || "-"} />
                </div>

                <div className="text-muted-foreground grid gap-1 text-sm md:grid-cols-2">
                  <p>Tier: {kol.followerTier}</p>
                  <p>Status sync: {kol.syncStatus}</p>
                  <p>Last sync: {formatDateTime(kol.lastSyncedAt)}</p>
                </div>

                {kol.syncMessage && (
                  <p className="text-muted-foreground border-border wrap-break-word border px-3 py-2 text-sm">
                    {kol.syncMessage}
                  </p>
                )}

                <div className="grid gap-2">
                  {kol.accounts.map((account) => (
                    <div key={account.id} className="border-border grid gap-3 border p-3">
                      {(() => {
                        const metadata = getAccountMetadata(account.metadata);

                        return (
                          <>
                            <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div className="flex min-w-0 items-start gap-3">
                                {metadata?.avatarUrl ? (
                                  <img
                                    src={metadata.avatarUrl}
                                    alt={`@${account.handle}`}
                                    className="border-border size-14 shrink-0 border object-cover"
                                  />
                                ) : (
                                  <div className="bg-muted text-foreground flex size-14 shrink-0 items-center justify-center border text-sm font-medium uppercase">
                                    {account.handle.slice(0, 2) || account.platform.slice(0, 2)}
                                  </div>
                                )}

                                <div className="min-w-0 space-y-1">
                                  <p className="font-medium capitalize">{account.platform}</p>
                                  <p className="text-muted-foreground wrap-break-word text-sm">@{account.handle}</p>
                                  {metadata?.fullName && metadata.fullName !== account.handle && (
                                    <p className="text-sm">{metadata.fullName}</p>
                                  )}
                                  <div className="flex flex-wrap gap-2 text-xs">
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
                                      className="text-sm underline underline-offset-2"
                                    >
                                      {metadata.website}
                                    </a>
                                  )}
                                </div>
                              </div>

                              <div className="text-muted-foreground grid gap-1 text-sm md:text-right">
                                <p>Status: {account.syncStatus}</p>
                                <p>Last sync: {formatDateTime(account.lastSyncedAt)}</p>
                              </div>
                            </div>

                            <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
                              <MetricInline label="Followers" value={formatNumber(account.followers)} />
                              <MetricInline label="Following" value={formatNumber(metadata?.followingCount ?? 0)} />
                              <MetricInline label="Posts" value={formatNumber(metadata?.postsCount ?? 0)} />
                              <MetricInline label="Avg likes" value={formatNumber(account.averageLikes)} />
                              <MetricInline label="Avg views" value={formatNumber(account.averageViews)} />
                              <MetricInline label="ER" value={account.engagementRate || "-"} />
                            </div>

                            {account.syncMessage && (
                              <p className="text-muted-foreground border-border wrap-break-word border px-3 py-2 text-sm">
                                {account.syncMessage}
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  ))}
                </div>

                {kol.keywords && <p className="text-muted-foreground text-sm">Keywords: {kol.keywords}</p>}
              </div>
            ))}

            {!filteredKols.length && (
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
        <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto p-0">
          <DialogHeader>
            <div className="border-border border-b px-4 py-4 sm:px-6">
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
              <FormInput
                label="Display name"
                value={form.displayName}
                onChange={(value) => setForm((current) => ({ ...current, displayName: value }))}
              />
              <FormInput
                label="Keywords"
                value={form.keywords}
                onChange={(value) => setForm((current) => ({ ...current, keywords: value }))}
                placeholder="Pisahkan dengan koma"
              />
            </div>

            <div className="grid gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-base font-medium">Akun</h2>
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
                  className="border-border grid min-w-0 gap-4 border p-3 md:grid-cols-2 xl:grid-cols-[0.8fr_1fr_auto]"
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

                  <div className="flex items-end xl:justify-end">
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

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border bg-muted/30 grid gap-1 border px-3 py-2">
      <p className="text-muted-foreground text-[11px] uppercase tracking-[0.18em]">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function MetricInline({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-[11px] uppercase tracking-[0.18em]">{label}</p>
      <p className="truncate text-sm">{value}</p>
    </div>
  );
}

function MetaBadge({ children }: { children: string }) {
  return <span className="bg-muted border-border border px-2 py-1">{children}</span>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  if (typeof value === "string") {
    const normalized = value.replace(/[^\d.-]/g, "");
    const parsed = Number(normalized);

    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.round(parsed));
    }
  }

  return 0;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&#38;/gi, "&")
    .replace(/&#x26;/gi, "&");
}

function asUrlText(value: unknown) {
  const text = asText(value);

  return text ? decodeHtmlEntities(text) : "";
}

function getValue(record: Record<string, unknown> | null, ...keys: string[]) {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    if (key in record) {
      return record[key];
    }

    if (key.includes(".")) {
      const value = key.split(".").reduce<unknown>((current, part) => {
        if (typeof current === "object" && current !== null && part in (current as Record<string, unknown>)) {
          return (current as Record<string, unknown>)[part];
        }

        return undefined;
      }, record);

      if (value !== undefined) {
        return value;
      }
    }
  }

  return undefined;
}

function getAccountMetadata(metadata: Record<string, unknown> | null) {
  if (!isRecord(metadata)) {
    return null;
  }

  const avatarUrl =
    asUrlText(
    getValue(
      metadata,
      "profilePicUrlHD",
      "profilePicUrlHd",
      "profilePicUrl",
      "avatarUrl",
      "avatarUrlHD",
      "profile_pic_url_hd",
      "profile_pic_url",
      "authorMeta.avatar",
      "authorMeta.originalAvatarUrl",
    ),
  ) ||
    null;
  const category =
    asText(getValue(metadata, "businessCategoryName", "category", "authorMeta.commerceUserInfo.category")) || null;
  const website =
    asText(getValue(metadata, "externalUrl", "authorMeta.bioLink")) ||
    (Array.isArray(metadata.externalUrls)
      ? asText((metadata.externalUrls.find((item) => isRecord(item) && asText(item.url)) as Record<string, unknown> | undefined)?.url)
      : "") ||
    null;

  return {
    avatarUrl,
    category,
    fullName: asText(getValue(metadata, "fullName", "authorMeta.nickName", "authorMeta.name")) || null,
    followingCount: asNumber(getValue(metadata, "followsCount", "followingCount", "authorMeta.following")),
    isBusinessAccount: asBoolean(getValue(metadata, "isBusinessAccount", "authorMeta.commerceUserInfo.commerceUser")),
    isPrivate: asBoolean(getValue(metadata, "private", "isPrivate", "authorMeta.privateAccount")),
    postsCount: asNumber(getValue(metadata, "postsCount", "authorMeta.video")),
    verified: asBoolean(getValue(metadata, "verified", "authorMeta.verified")),
    website,
  };
}

function formatNumber(value: number) {
  return value.toLocaleString("id-ID");
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

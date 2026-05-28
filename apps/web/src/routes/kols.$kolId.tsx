import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { KolRecord, RateCardValue, SocialPlatform } from "@/lib/app-types";
import { formatCurrencyIdr, formatDateTime, formatNumber, getAccountMetadata, getAvatarSrc, getPostDisplayTitle, getRecentAccountPosts } from "@/lib/kol-utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { client, orpc } from "@/utils/orpc";

const SOCIAL_PLATFORM_OPTIONS = [
  { label: "Instagram", value: "instagram" },
  { label: "TikTok", value: "tiktok" },
] as const;

export const Route = createFileRoute("/kols/$kolId")({
  component: RouteComponent,
});

type HistoryFormState = {
  brand: string;
  campaignName: string;
  endedAt: string;
  notes: string;
  platform: SocialPlatform;
  startedAt: string;
};

type RateCardFormState = {
  postMax: string;
  postMin: string;
  postSuggested: string;
  reason: string;
  reelMax: string;
  reelMin: string;
  reelSuggested: string;
  storyMax: string;
  storyMin: string;
  storySuggested: string;
};

function getDefaultHistoryForm(): HistoryFormState {
  return {
    brand: "",
    campaignName: "",
    endedAt: "",
    notes: "",
    platform: "instagram",
    startedAt: "",
  };
}

function toRateInput(value: number | null | undefined) {
  return value && Number.isFinite(value) ? String(Math.round(value)) : "";
}

function getDefaultRateCardForm(kol: KolRecord | null | undefined): RateCardFormState {
  const rateCard = kol?.actualRateCard ?? kol?.estimatedRateCard;

  return {
    postMax: toRateInput(rateCard?.post.max),
    postMin: toRateInput(rateCard?.post.min),
    postSuggested: toRateInput(rateCard?.post.suggested),
    reason: "",
    reelMax: toRateInput(rateCard?.reel.max),
    reelMin: toRateInput(rateCard?.reel.min),
    reelSuggested: toRateInput(rateCard?.reel.suggested),
    storyMax: toRateInput(rateCard?.story.max),
    storyMin: toRateInput(rateCard?.story.min),
    storySuggested: toRateInput(rateCard?.story.suggested),
  };
}

function parsePositiveInt(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed);
}

function buildRateCardValue(form: RateCardFormState): RateCardValue | null {
  const postMin = parsePositiveInt(form.postMin);
  const postSuggested = parsePositiveInt(form.postSuggested);
  const postMax = parsePositiveInt(form.postMax);
  const storyMin = parsePositiveInt(form.storyMin);
  const storySuggested = parsePositiveInt(form.storySuggested);
  const storyMax = parsePositiveInt(form.storyMax);
  const reelMin = parsePositiveInt(form.reelMin);
  const reelSuggested = parsePositiveInt(form.reelSuggested);
  const reelMax = parsePositiveInt(form.reelMax);

  if (!postMin || !postSuggested || !postMax || !storyMin || !storySuggested || !storyMax || !reelMin || !reelSuggested || !reelMax) {
    return null;
  }

  const isRangeValid =
    postMin <= postSuggested &&
    postSuggested <= postMax &&
    storyMin <= storySuggested &&
    storySuggested <= storyMax &&
    reelMin <= reelSuggested &&
    reelSuggested <= reelMax;

  if (!isRangeValid) {
    return null;
  }

  return {
    currency: "IDR",
    post: { max: postMax, min: postMin, suggested: postSuggested },
    reel: { max: reelMax, min: reelMin, suggested: reelSuggested },
    story: { max: storyMax, min: storyMin, suggested: storySuggested },
  };
}

function RouteComponent() {
  const { kolId } = Route.useParams();
  const navigate = useNavigate();
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [historyForm, setHistoryForm] = useState<HistoryFormState>(getDefaultHistoryForm());
  const [rateCardForm, setRateCardForm] = useState<RateCardFormState>(getDefaultRateCardForm(null));

  const kolQuery = useQuery(orpc.kol.getById.queryOptions({ input: { id: Number(kolId) } }));
  const kol = kolQuery.data as KolRecord | null | undefined;

  const syncKol = useMutation({
    mutationFn: () => client.kol.syncMetrics({ id: Number(kolId) }),
    onSuccess: () => {
      toast.success("Data KOL berhasil disinkronkan");
      kolQuery.refetch();
    },
    onError: () => {
      toast.error("Sinkronisasi KOL gagal");
    },
  });

  const deleteKol = useMutation({
    mutationFn: () => client.kol.delete({ id: Number(kolId) }),
    onSuccess: () => {
      toast.success("KOL berhasil dihapus");
      navigate({ to: "/kols" });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal menghapus KOL");
      setIsDeleteDialogOpen(false);
    },
  });

  const addHistory = useMutation({
    mutationFn: (input: HistoryFormState & { kolId: number }) => client.kol.addHistory(input),
    onSuccess: () => {
      toast.success("Riwayat campaign berhasil ditambahkan");
      kolQuery.refetch();
      setIsHistoryDialogOpen(false);
      setHistoryForm(getDefaultHistoryForm());
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal menambahkan riwayat");
    },
  });

  const deleteHistory = useMutation({
    mutationFn: ({ id }: { id: number }) => client.kol.deleteHistory({ id }),
    onSuccess: () => {
      toast.success("Riwayat campaign berhasil dihapus");
      kolQuery.refetch();
    },
    onError: () => {
      toast.error("Gagal menghapus riwayat campaign");
    },
  });

  const updateActualRateCard = useMutation({
    mutationFn: (input: { actualRateCard: RateCardValue; kolId: number; reason: string }) =>
      client.kol.updateActualRateCard(input),
    onSuccess: () => {
      toast.success("Rate card aktual berhasil diperbarui");
      kolQuery.refetch();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal memperbarui rate card aktual");
    },
  });

  useEffect(() => {
    if (!kol) {
      return;
    }

    setRateCardForm(getDefaultRateCardForm(kol));
  }, [kol]);

  if (kolQuery.isLoading) {
    return <KolDetailSkeleton />;
  }

  if (!kol) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="container mx-auto space-y-4 px-4 py-6">
          <p className="text-muted-foreground">KOL tidak ditemukan.</p>
          <Link to="/kols" className="text-sm underline underline-offset-2">
            Kembali ke daftar KOL
          </Link>
        </div>
      </div>
    );
  }

  const avatarUrl = kol.accounts
    .map((account) => getAccountMetadata(account.metadata)?.avatarUrl)
    .find((url): url is string => Boolean(url));
  const initials =
    kol.displayName
      .split(" ")
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "K";

  return (
    <>
      <div className="h-full overflow-y-auto">
        <div className="container mx-auto space-y-6 px-4 py-6">
          <Link to="/kols" className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline">
          <ArrowLeft className="size-4" />
          Kembali ke daftar KOL
        </Link>

        <section className="bg-card ring-foreground/10 space-y-4 p-4 ring-1">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              {avatarUrl ? (
                <img
                  src={getAvatarSrc(avatarUrl)}
                  alt={kol.displayName}
                  className="border-border size-16 shrink-0 border object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="bg-muted text-foreground flex size-16 shrink-0 items-center justify-center border text-lg font-medium">
                  {initials}
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold">{kol.displayName}</h1>
                <p className="text-muted-foreground text-sm">{kol.accounts.length} akun terhubung</p>
                {kol.keywords && <p className="text-muted-foreground mt-1 text-sm">Keywords: {kol.keywords}</p>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncKol.mutate()}
                disabled={syncKol.isPending}
              >
                <RefreshCcw className="mr-1 size-4" />
                Sinkronkan
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                <Trash2 className="mr-1 size-4" />
                Hapus
              </Button>
            </div>
          </div>

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
        </section>

        <section className="bg-card ring-foreground/10 space-y-4 p-4 ring-1">
          <h2 className="text-lg font-medium">Rate Card</h2>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            <MetricBox
              label="Estimated post (suggested)"
              value={formatCurrencyIdr(kol.estimatedRateCard?.post.suggested)}
            />
            <MetricBox
              label="Estimated story (suggested)"
              value={formatCurrencyIdr(kol.estimatedRateCard?.story.suggested)}
            />
            <MetricBox
              label="Estimated reel (suggested)"
              value={formatCurrencyIdr(kol.estimatedRateCard?.reel.suggested)}
            />
          </div>

          <div className="text-muted-foreground grid gap-1 text-sm md:grid-cols-2">
            <p>Source: {kol.rateCardMetadata?.source ?? "-"}</p>
            <p>Model: {kol.rateCardMetadata?.modelVersion ?? "-"}</p>
            <p>Confidence: {kol.rateCardMetadata ? `${Math.round(kol.rateCardMetadata.confidence * 100)}%` : "-"}</p>
            <p>Computed at: {formatDateTime(kol.rateCardMetadata?.lastComputedAt ?? null)}</p>
          </div>

          <form
            className="grid gap-4 border p-3"
            onSubmit={(event) => {
              event.preventDefault();

              const nextRateCard = buildRateCardValue(rateCardForm);

              if (!nextRateCard) {
                toast.error("Input rate card tidak valid. Pastikan min <= suggested <= max untuk semua format.");
                return;
              }

              updateActualRateCard.mutate({
                actualRateCard: nextRateCard,
                kolId: Number(kolId),
                reason: rateCardForm.reason,
              });
            }}
          >
            <h3 className="text-sm font-medium">Update rate card aktual</h3>

            <div className="grid gap-3 md:grid-cols-3">
              <RateCardInputs
                label="Post"
                min={rateCardForm.postMin}
                suggested={rateCardForm.postSuggested}
                max={rateCardForm.postMax}
                onChange={(next) => setRateCardForm((current) => ({ ...current, ...next }))}
                minField="postMin"
                suggestedField="postSuggested"
                maxField="postMax"
              />
              <RateCardInputs
                label="Story"
                min={rateCardForm.storyMin}
                suggested={rateCardForm.storySuggested}
                max={rateCardForm.storyMax}
                onChange={(next) => setRateCardForm((current) => ({ ...current, ...next }))}
                minField="storyMin"
                suggestedField="storySuggested"
                maxField="storyMax"
              />
              <RateCardInputs
                label="Reel"
                min={rateCardForm.reelMin}
                suggested={rateCardForm.reelSuggested}
                max={rateCardForm.reelMax}
                onChange={(next) => setRateCardForm((current) => ({ ...current, ...next }))}
                minField="reelMin"
                suggestedField="reelSuggested"
                maxField="reelMax"
              />
            </div>

            <Label className="grid gap-2">
              <span>Alasan perubahan (opsional)</span>
              <Input
                value={rateCardForm.reason}
                onChange={(event) => setRateCardForm((current) => ({ ...current, reason: event.target.value }))}
                placeholder="Contoh: konfirmasi rate resmi dari KOL"
              />
            </Label>

            <DialogFooter>
              <Button type="submit" disabled={updateActualRateCard.isPending}>
                {updateActualRateCard.isPending ? "Menyimpan..." : "Simpan rate card aktual"}
              </Button>
            </DialogFooter>
          </form>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Riwayat perubahan rate card aktual</h3>
            {kol.rateCardHistory.slice(0, 5).map((item) => (
              <div key={item.id} className="border-border text-muted-foreground grid gap-1 border p-2 text-sm">
                <p>Waktu: {formatDateTime(item.createdAt)}</p>
                <p>Alasan: {item.reason || "-"}</p>
                <p>
                  Suggested post: {formatCurrencyIdr(item.oldActualRateCard?.post.suggested)} -&gt; {formatCurrencyIdr(item.newActualRateCard?.post.suggested)}
                </p>
              </div>
            ))}
            {!kol.rateCardHistory.length && (
              <p className="text-muted-foreground text-sm">Belum ada riwayat perubahan rate card.</p>
            )}
          </div>
        </section>

        <section className="bg-card ring-foreground/10 space-y-4 p-4 ring-1">
          <h2 className="text-lg font-medium">Akun platform</h2>
          <div className="grid gap-3">
            {kol.accounts.map((account) => {
              const metadata = getAccountMetadata(account.metadata);
              const accountDisplayName = metadata?.fullName && metadata.fullName !== account.handle
                ? metadata.fullName
                : account.handle;

              return (
                <div key={account.id} className="border-border grid gap-3 border p-3">
                  <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      {metadata?.avatarUrl ? (
                        <img
                          src={getAvatarSrc(metadata.avatarUrl)}
                          alt={`@${account.handle}`}
                          className="border-border size-14 shrink-0 border object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="bg-muted text-foreground flex size-14 shrink-0 items-center justify-center border text-sm font-medium uppercase">
                          {account.handle.slice(0, 2) || account.platform.slice(0, 2)}
                        </div>
                      )}

                      <div className="min-w-0 space-y-1">
                        <p className="font-medium">{accountDisplayName}</p>
                        <p className="text-muted-foreground wrap-break-word text-sm">@{account.handle}</p>
                        <div className="flex flex-wrap gap-2 text-xs">
                          {metadata?.verified && <MetaBadge>Verified</MetaBadge>}
                          {metadata?.isBusinessAccount && <MetaBadge>Business</MetaBadge>}
                          {metadata?.isPrivate && <MetaBadge>Private</MetaBadge>}
                          {metadata?.category && <MetaBadge>{metadata.category}</MetaBadge>}
                        </div>
                        {account.biography && (
                          <p className="text-muted-foreground mt-1 text-sm wrap-break-word">{account.biography}</p>
                        )}
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

                  <RecentAccountPosts metadata={account.metadata} />
                </div>
              );
            })}
          </div>
        </section>

        <section className="bg-card ring-foreground/10 space-y-4 p-4 ring-1">
          <h2 className="text-lg font-medium">Post tersimpan</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {kol.contents.length ? kol.contents.map((content) => (
              <a
                key={content.id}
                href={content.contentUrl}
                target="_blank"
                rel="noreferrer"
                className="grid gap-3 border-border bg-muted/20 border p-3 text-sm underline-offset-2 hover:bg-muted/30"
              >
                {content.thumbnailUrl ? (
                  <img
                    src={getAvatarSrc(content.thumbnailUrl)}
                    alt={getPostDisplayTitle(content)}
                    className="aspect-video w-full border-border border object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="bg-muted text-muted-foreground flex aspect-video w-full items-center justify-center border border-dashed text-xs uppercase tracking-[0.14em]">
                    Post
                  </div>
                )}
                <div className="min-w-0 space-y-1">
                  <p className="line-clamp-2 font-semibold">{getPostDisplayTitle(content)}</p>
                  <p className="text-muted-foreground">
                    {content.campaignName ? `${content.campaignName} · ` : ""}
                    {formatDateTime(content.postedAt)}
                  </p>
                  <p className="text-muted-foreground text-xs">Last sync: {formatDateTime(content.syncedAt)}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatNumber(content.viewCount)} views · {formatNumber(content.likeCount)} likes · {formatNumber(content.commentCount)} komentar · {formatNumber(content.shareCount)} shares
                  </p>
                </div>
              </a>
            )) : (
              <p className="text-muted-foreground text-sm">Belum ada post KOL ini yang tersimpan di database.</p>
            )}
          </div>
        </section>

        <section className="bg-card ring-foreground/10 space-y-4 p-4 ring-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-medium">Riwayat campaign</h2>
            <Button variant="outline" size="sm" onClick={() => setIsHistoryDialogOpen(true)}>
              <Plus className="mr-1 size-4" />
              Tambah riwayat
            </Button>
          </div>

          <div className="space-y-2">
            {kol.history.map((item) => (
              <div key={item.id} className="border-border flex items-start justify-between gap-3 border p-3">
                <div className="text-sm">
                  <p className="font-medium">{item.campaignName}</p>
                  <p className="text-muted-foreground">{item.brand} &bull; {item.platform}</p>
                  {(item.startedAt || item.endedAt) && (
                    <p className="text-muted-foreground">
                      {item.startedAt ?? "?"} &rarr; {item.endedAt ?? "?"}
                    </p>
                  )}
                  {item.notes && <p className="text-muted-foreground mt-1">{item.notes}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteHistory.mutate({ id: item.id })}
                  disabled={deleteHistory.isPending}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}

            {!kol.history.length && (
              <p className="text-muted-foreground text-sm">Belum ada riwayat campaign.</p>
            )}
          </div>
        </section>
        </div>
      </div>

      <Dialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!open) setIsDeleteDialogOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konfirmasi Hapus KOL</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            Apakah Anda yakin ingin menghapus KOL &ldquo;{kol.displayName}&rdquo;? Semua data akun dan riwayat campaign terkait juga akan dihapus. Tindakan ini tidak dapat dibatalkan.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              disabled={deleteKol.isPending}
              onClick={() => deleteKol.mutate()}
            >
              {deleteKol.isPending ? "Menghapus..." : "Hapus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isHistoryDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsHistoryDialogOpen(false);
            setHistoryForm(getDefaultHistoryForm());
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tambah Riwayat Campaign</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              addHistory.mutate({ ...historyForm, kolId: Number(kolId) });
            }}
          >
            <FormInput
              label="Nama campaign"
              value={historyForm.campaignName}
              onChange={(value) => setHistoryForm((c) => ({ ...c, campaignName: value }))}
            />
            <FormInput
              label="Brand"
              value={historyForm.brand}
              onChange={(value) => setHistoryForm((c) => ({ ...c, brand: value }))}
            />
            <Label className="grid gap-2">
              <span>Platform</span>
              <SearchableSelect
                className="text-xs"
                value={historyForm.platform}
                onValueChange={(value) =>
                  setHistoryForm((c) => ({ ...c, platform: value as SocialPlatform }))
                }
                options={[...SOCIAL_PLATFORM_OPTIONS]}
                placeholder="Pilih platform"
                searchPlaceholder="Cari platform"
              />
            </Label>
            <div className="grid gap-4 md:grid-cols-2">
              <Label className="grid gap-2">
                <span>Mulai</span>
                <Input
                  type="date"
                  value={historyForm.startedAt}
                  onChange={(event) => setHistoryForm((c) => ({ ...c, startedAt: event.target.value }))}
                />
              </Label>
              <Label className="grid gap-2">
                <span>Selesai</span>
                <Input
                  type="date"
                  value={historyForm.endedAt}
                  onChange={(event) => setHistoryForm((c) => ({ ...c, endedAt: event.target.value }))}
                />
              </Label>
            </div>
            <FormInput
              label="Catatan"
              value={historyForm.notes}
              onChange={(value) => setHistoryForm((c) => ({ ...c, notes: value }))}
              placeholder="Opsional"
            />
            <DialogFooter>
              <Button type="submit" disabled={addHistory.isPending}>
                {addHistory.isPending ? "Menyimpan..." : "Simpan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function KolDetailSkeleton() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="container mx-auto space-y-6 px-4 py-6">
        <Skeleton className="h-5 w-36" />
        <section className="bg-card ring-foreground/10 space-y-4 p-4 ring-1">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <Skeleton className="size-16 shrink-0" />
              <div className="min-w-0 space-y-2">
                <Skeleton className="h-7 w-56 max-w-full" />
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-48" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-9 w-28" />
              <Skeleton className="h-9 w-24" />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="border-border bg-muted/30 grid gap-2 border px-3 py-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </section>
        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="bg-card ring-foreground/10 p-4 ring-1">
            <Skeleton className="h-6 w-36" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="border-border border p-3">
                  <Skeleton className="h-5 w-44" />
                  <Skeleton className="mt-2 h-4 w-64 max-w-full" />
                </div>
              ))}
            </div>
          </div>
          <div className="bg-card ring-foreground/10 p-4 ring-1">
            <Skeleton className="h-6 w-32" />
            <div className="mt-4 grid gap-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-b-0">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-28" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
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

function RecentAccountPosts({ metadata }: { metadata: Record<string, unknown> | null }) {
  const posts = getRecentAccountPosts(metadata, 3);

  if (!posts.length) {
    return null;
  }

  return (
    <div className="grid gap-2">
      <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.18em]">
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
                  className="aspect-video w-full border-border border object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="bg-muted text-muted-foreground flex aspect-video w-full items-center justify-center border border-dashed text-xs uppercase tracking-[0.14em]">
                  Post
                </div>
              )}
              <div className="min-w-0 space-y-1">
                <p className="line-clamp-2 text-sm font-medium">{post.title}</p>
                <p className="text-muted-foreground text-xs">
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
              className="grid gap-2 border-border bg-muted/20 border p-2 underline-offset-2 hover:bg-muted/30"
            >
              {body}
            </a>
          ) : (
            <div key={index} className="grid gap-2 border-border bg-muted/20 border p-2">
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RateCardInputs<T extends string>({
  label,
  min,
  suggested,
  max,
  onChange,
  minField,
  suggestedField,
  maxField,
}: {
  label: string;
  max: string;
  maxField: T;
  min: string;
  minField: T;
  onChange: (next: Record<T, string>) => void;
  suggested: string;
  suggestedField: T;
}) {
  return (
    <div className="grid gap-2 border p-2">
      <p className="text-sm font-medium">{label}</p>
      <Label className="grid gap-1 text-xs">
        <span>Min (IDR)</span>
        <Input
          type="number"
          min={1}
          step={1000}
          value={min}
          onChange={(event) => onChange({ [minField]: event.target.value } as Record<T, string>)}
        />
      </Label>
      <Label className="grid gap-1 text-xs">
        <span>Suggested (IDR)</span>
        <Input
          type="number"
          min={1}
          step={1000}
          value={suggested}
          onChange={(event) => onChange({ [suggestedField]: event.target.value } as Record<T, string>)}
        />
      </Label>
      <Label className="grid gap-1 text-xs">
        <span>Max (IDR)</span>
        <Input
          type="number"
          min={1}
          step={1000}
          value={max}
          onChange={(event) => onChange({ [maxField]: event.target.value } as Record<T, string>)}
        />
      </Label>
    </div>
  );
}

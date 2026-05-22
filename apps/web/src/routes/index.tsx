import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, RefreshCcw, Target } from "lucide-react";
import type React from "react";

import type { CampaignDashboardRecord } from "@/lib/app-types";
import { formatObjectiveSummary, getProgressPercent } from "@/lib/campaign-objective";
import { sortCampaignsByManagementPriority } from "@/lib/campaign-progress";
import { formatDateTime, formatNumber } from "@/lib/kol-utils";
import { Button } from "@/components/ui/button";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  const dashboardQuery = useQuery(orpc.campaign.dashboard.queryOptions());
  const campaigns = sortCampaignsByManagementPriority((dashboardQuery.data as CampaignDashboardRecord[] | undefined) ?? []);
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === "active");
  const campaignsWithContent = campaigns.filter((campaign) => campaign.contentCount > 0);
  const totalViews = campaigns.reduce((sum, campaign) => sum + campaign.viewCount, 0);
  const totalInteractions = campaigns.reduce((sum, campaign) => sum + campaign.actualInteractions, 0);
  const staleCampaigns = campaigns.filter((campaign) => campaign.syncHealth !== "fresh" && campaign.status === "active");
  const syncCoverage = campaignsWithContent.length
    ? getProgressPercent(
        campaignsWithContent.reduce((sum, campaign) => sum + campaign.syncedContentCount, 0),
        campaignsWithContent.reduce((sum, campaign) => sum + campaign.contentCount, 0),
      )
    : 0;

  return (
    <div className="h-full overflow-y-auto">
      <main className="container mx-auto space-y-6 px-4 py-6">
        <section className="bg-card ring-foreground/10 p-5 ring-1">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl space-y-2">
              <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">Campaign management</p>
              <h1 className="text-2xl font-semibold">Dashboard progress campaign</h1>
              <p className="text-muted-foreground text-sm">
                Ringkasan inti: progress target, status sync/scrap, konten, KOL, dan campaign yang perlu ditindaklanjuti.
              </p>
            </div>
            <Button render={<Link to="/campaigns" />} className="hover:bg-primary-hover">
              Kelola campaign
            </Button>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <MetricCard icon={<Target className="size-4" />} label="Campaign aktif" value={activeCampaigns.length.toLocaleString("id-ID")} detail={`${campaigns.length.toLocaleString("id-ID")} total campaign`} />
          <MetricCard icon={<CheckCircle2 className="size-4" />} label="Sync coverage" value={`${syncCoverage}%`} detail={`${campaignsWithContent.length.toLocaleString("id-ID")} campaign punya konten`} />
          <MetricCard icon={<Clock3 className="size-4" />} label="Total views" value={formatNumber(totalViews)} detail={`${formatNumber(totalInteractions)} interaksi`} />
          <MetricCard icon={<AlertTriangle className="size-4" />} label="Butuh perhatian" value={staleCampaigns.length.toLocaleString("id-ID")} detail="Active campaign belum fresh sync" />
        </section>

        {dashboardQuery.isLoading ? (
          <section className="bg-card ring-foreground/10 p-6 text-sm text-muted-foreground ring-1">Memuat dashboard...</section>
        ) : campaigns.length === 0 ? (
          <section className="bg-card ring-foreground/10 p-6 ring-1">
            <h2 className="font-semibold">Belum ada campaign</h2>
            <p className="text-muted-foreground mt-1 text-sm">Buat campaign pertama untuk mulai tracking target dan sync konten.</p>
          </section>
        ) : (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Progress campaign</h2>
              <p className="text-muted-foreground text-xs">Urut: aktif, draft, completed, lalu update terakhir.</p>
            </div>
            <div className="grid gap-3">
              {campaigns.map((campaign) => (
                <CampaignProgressCard key={campaign.id} campaign={campaign} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function MetricCard({ detail, icon, label, value }: { detail: string; icon: React.ReactNode; label: string; value: string }) {
  return (
    <article className="bg-card ring-foreground/10 p-4 ring-1">
      <div className="text-muted-foreground flex items-center gap-2 text-xs uppercase tracking-[0.16em]">{icon}{label}</div>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
      <p className="text-muted-foreground mt-1 text-xs">{detail}</p>
    </article>
  );
}

function CampaignProgressCard({ campaign }: { campaign: ReturnType<typeof sortCampaignsByManagementPriority>[number] }) {
  const syncLabel = campaign.syncHealth === "fresh" ? "Fresh" : campaign.syncHealth === "stale" ? "Stale" : "Belum sync";

  return (
    <article className="bg-card ring-foreground/10 p-4 ring-1">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-[0.16em]">{campaign.brand}</p>
              <h3 className="text-lg font-semibold">{campaign.name}</h3>
              <p className="text-muted-foreground text-sm">{formatObjectiveSummary(campaign.objective)}</p>
            </div>
            <span className="border-border w-fit border px-2 py-1 text-xs uppercase tracking-[0.14em]">{campaign.status}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <ProgressLine label="Views" value={campaign.viewProgressPercent} detail={`${formatNumber(campaign.viewCount)} terkumpul`} />
            <ProgressLine label="Interaksi" value={campaign.interactionProgressPercent} detail={`${formatNumber(campaign.actualInteractions)} terkumpul`} />
            <ProgressLine label="Waktu campaign" value={campaign.periodProgressPercent} detail={campaign.daysLeft === null ? "Tanggal belum valid" : `${campaign.daysLeft} hari tersisa`} />
            <ProgressLine label="Konten synced" value={getProgressPercent(campaign.syncedContentCount, campaign.contentCount)} detail={`${campaign.syncedContentCount}/${campaign.contentCount} konten`} />
          </div>
        </div>
        <div className="grid gap-2 text-sm">
          <InfoRow icon={<CalendarClock className="size-4" />} label="Periode" value={`${campaign.periodStart} → ${campaign.periodEnd}`} />
          <InfoRow icon={<RefreshCcw className="size-4" />} label="Sync terakhir" value={campaign.lastSyncedAt ? formatDateTime(campaign.lastSyncedAt) : "Belum ada"} />
          <InfoRow icon={<RefreshCcw className="size-4" />} label="Scrap terakhir" value={campaign.lastScrapedAt ? formatDateTime(campaign.lastScrapedAt) : "Belum ada"} />
          <InfoRow label="KOL / konten" value={`${campaign.kolCount} KOL • ${campaign.contentCount} konten`} />
          <InfoRow label="Status sync" value={`${syncLabel} • ${campaign.failedSyncCount} gagal • ${campaign.pendingSyncCount} pending`} />
          <Button render={<Link to="/campaigns" />} variant="outline" className="mt-2 justify-center">
            Buka detail
          </Button>
        </div>
      </div>
    </article>
  );
}

function ProgressLine({ detail, label, value }: { detail: string; label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{value}%</span>
      </div>
      <div className="bg-muted h-2 overflow-hidden">
        <div className="bg-primary h-full" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <p className="text-muted-foreground text-xs">{detail}</p>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="border-border flex items-start justify-between gap-3 border-b pb-2 last:border-b-0">
      <span className="text-muted-foreground flex items-center gap-2">{icon}{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

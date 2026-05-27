import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock, ClipboardList, Eye, Heart, MessageCircle, Share2, Target } from "lucide-react";
import type React from "react";
import { useEffect } from "react";

import type { CampaignDashboardRecord } from "@/lib/app-types";
import { sortCampaignsByManagementPriority } from "@/lib/campaign-progress";
import { formatNumber } from "@/lib/kol-utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  useEffect(() => {
    document.documentElement.classList.add("digiTheme");
    document.body.classList.add("digiTheme");

    return () => {
      document.documentElement.classList.remove("digiTheme");
      document.body.classList.remove("digiTheme");
    };
  }, []);

  const dashboardQuery = useQuery(orpc.campaign.dashboard.queryOptions());
  const campaigns = sortCampaignsByManagementPriority((dashboardQuery.data as CampaignDashboardRecord[] | undefined) ?? []);
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === "active");
  const activeContentCount = activeCampaigns.reduce((sum, campaign) => sum + campaign.contentCount, 0);
  const campaignsEndingSoon = activeCampaigns.filter((campaign) => campaign.daysLeft !== null && campaign.daysLeft <= 7).length;
  const campaignsWithoutContent = activeCampaigns.filter((campaign) => campaign.contentCount === 0).length;

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-background via-[#fff6f8] to-background">
      <main className="container mx-auto max-w-6xl space-y-5 px-4 py-6 lg:py-8">
        <section className="rounded-none border border-[#b43c39]/15 bg-white p-5 shadow-[8px_8px_0_rgba(152,46,65,0.10)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#B43C39]">Campaign management</p>
              <h1 className="font-goldman text-3xl font-bold uppercase tracking-wide text-[#2b1418] md:text-4xl">Dashboard progress</h1>
            </div>
            <Button render={<Link to="/campaigns" />} className="rounded-none bg-[#B43C39] font-semibold text-white hover:bg-[#8f2e2c]">
              Kelola campaign
            </Button>
          </div>
        </section>

        {dashboardQuery.isLoading ? (
          <DashboardSkeleton />
        ) : (
          <>
            <section className="grid gap-3 md:grid-cols-4">
              <MetricCard icon={<Target className="size-4" />} label="Campaign aktif" value={activeCampaigns.length.toLocaleString("id-ID")} detail={`${campaigns.length.toLocaleString("id-ID")} total campaign`} />
              <MetricCard icon={<ClipboardList className="size-4" />} label="Konten aktif" value={formatNumber(activeContentCount)} detail={`${campaignsWithoutContent.toLocaleString("id-ID")} campaign belum punya konten`} />
              <MetricCard icon={<Eye className="size-4" />} label="Views aktif" value={formatNumber(activeCampaigns.reduce((sum, campaign) => sum + campaign.viewCount, 0))} detail="Akumulasi konten aktif" />
              <MetricCard icon={<CalendarClock className="size-4" />} label="Deadline dekat" value={campaignsEndingSoon.toLocaleString("id-ID")} detail="Campaign aktif selesai dalam 7 hari" />
            </section>

            {campaigns.length === 0 ? (
              <section className="rounded-none border border-[#b43c39]/15 bg-white p-6 shadow-[8px_8px_0_rgba(152,46,65,0.08)]">
                <h2 className="font-semibold text-[#2b1418]">Belum ada campaign</h2>
                <p className="text-muted-foreground mt-1 text-sm">Buat campaign pertama untuk mulai tracking target dan sync konten.</p>
              </section>
            ) : (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-[#2b1418]">Campaign aktif</h2>
                </div>
                <div className="grid gap-3">
                  {(activeCampaigns.length ? activeCampaigns : campaigns).map((campaign) => (
                    <CampaignProgressCard key={campaign.id} campaign={campaign} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <section className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <article key={index} className="rounded-none border border-[#b43c39]/15 bg-white p-4 shadow-[6px_6px_0_rgba(152,46,65,0.08)]">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="mt-3 h-8 w-20" />
            <Skeleton className="mt-2 h-3 w-40 max-w-full" />
          </article>
        ))}
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-3 w-48" />
        </div>
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <article key={index} className="rounded-none border border-[#b43c39]/15 bg-white p-4 shadow-[6px_6px_0_rgba(152,46,65,0.08)]">
              <div className="space-y-3">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-6 w-64 max-w-full" />
                <Skeleton className="h-3 w-80 max-w-full" />
                <Skeleton className="h-2 w-full" />
                <div className="flex justify-between gap-3">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function MetricCard({ detail, icon, label, value }: { detail: string; icon: React.ReactNode; label: string; value: string }) {
  return (
    <article className="rounded-none border border-[#b43c39]/15 bg-white p-4 shadow-[6px_6px_0_rgba(152,46,65,0.08)]">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#7B204C]">{icon}{label}</div>
      <p className="mt-3 text-2xl font-semibold text-[#2b1418]">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </article>
  );
}

function CampaignProgressCard({ campaign }: { campaign: ReturnType<typeof sortCampaignsByManagementPriority>[number] }) {
  const syncLabel = campaign.syncHealth === "fresh" ? "Fresh" : campaign.syncHealth === "stale" ? "Stale" : "Belum";

  return (
    <Link
      to="/campaigns"
      className="block rounded-none border border-[#b43c39]/15 bg-white p-4 shadow-[6px_6px_0_rgba(152,46,65,0.08)] transition hover:-translate-y-0.5 hover:shadow-[8px_8px_0_rgba(152,46,65,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B43C39]"
    >
      <article className="space-y-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#B43C39]">{campaign.brand}</p>
            <h3 className="text-lg font-semibold text-[#2b1418]">{campaign.name}</h3>
            <p className="text-sm text-muted-foreground">{campaign.contentCount} konten • {formatNumber(campaign.viewCount)} views</p>
          </div>
          <span className="w-fit border border-[#b43c39]/20 bg-[#fff3d8] px-2 py-1 text-xs uppercase tracking-[0.14em] text-[#7B204C]">{formatCampaignStatus(campaign.status)}</span>
        </div>
        <div>
          <div className="flex items-end justify-between gap-3">
            <span className="text-sm font-medium text-[#2b1418]">Progress waktu</span>
            <span className="text-2xl font-semibold text-[#2b1418]">{campaign.periodProgressPercent}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden bg-[#f7e7eb]">
            <div className="h-full bg-[#B43C39]" style={{ width: `${campaign.periodProgressPercent}%` }} />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <MiniMetric icon={<Eye className="size-3.5" />} label="Views" value={campaign.viewCount} />
          <MiniMetric icon={<Heart className="size-3.5" />} label="Likes" value={campaign.likeCount} />
          <MiniMetric icon={<MessageCircle className="size-3.5" />} label="Comments" value={campaign.commentCount} />
          <MiniMetric icon={<Share2 className="size-3.5" />} label="Shares" value={campaign.shareCount} />
        </div>
        <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
          <span>{campaign.daysLeft === null ? "Tanggal belum valid" : `${campaign.daysLeft} hari tersisa`}</span>
          <span>{syncLabel} sync · {campaign.contentCount} konten</span>
        </div>
      </article>
    </Link>
  );
}

function MiniMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="border border-[#b43c39]/15 bg-[#fff8f9] px-3 py-2 text-xs text-[#2b1418]">
      <span className="inline-flex items-center gap-1 text-muted-foreground">{icon}{label}</span>
      <p className="mt-1 font-semibold">{formatNumber(value)}</p>
    </div>
  );
}

function formatCampaignStatus(status: CampaignDashboardRecord["status"]) {
  if (status === "active") return "Berjalan";
  if (status === "completed" || status === "archived") return "Selesai";
  return "Belum mulai";
}

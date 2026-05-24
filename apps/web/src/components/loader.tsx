import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";

export default function Loader() {
  const pathname = typeof window === "undefined" ? "" : window.location.pathname;

  if (pathname.startsWith("/campaigns")) {
    return <CampaignsRouteFallback />;
  }

  if (pathname.startsWith("/brand")) {
    return <TwoPanelRouteFallback titleWidth="w-48" />;
  }

  if (pathname.startsWith("/compare-kols")) {
    return <CompareRouteFallback />;
  }

  if (pathname.startsWith("/settings")) {
    return <SettingsRouteFallback />;
  }

  if (pathname === "/") {
    return <DashboardRouteFallback />;
  }

  return <GenericSkeletonFallback />;
}

function PageShell({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="h-full overflow-y-auto bg-background" role="status" aria-label={label}>
      <main className="container mx-auto max-w-6xl space-y-5 px-4 py-6 lg:py-8">{children}</main>
    </div>
  );
}

function HeaderBlock({ action = false, titleWidth = "w-80" }: { action?: boolean; titleWidth?: string }) {
  return (
    <section className="border border-[#b43c39]/15 bg-white p-5 shadow-[8px_8px_0_rgba(152,46,65,0.10)]">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className={`h-10 ${titleWidth} max-w-full`} />
          <Skeleton className="h-4 w-[32rem] max-w-full" />
        </div>
        {action && <Skeleton className="h-10 w-40" />}
      </div>
    </section>
  );
}

function CampaignsRouteFallback() {
  return (
    <PageShell label="Loading campaign page">
      <HeaderBlock action />
      <section className="grid gap-3 border border-[#982E41]/15 bg-white p-3 md:grid-cols-[minmax(0,1fr)_220px]">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </section>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <article key={index} className="border border-[#b43c39]/15 bg-white p-4 shadow-[6px_6px_0_rgba(152,46,65,0.08)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-6 w-72 max-w-full" />
                <Skeleton className="h-4 w-96 max-w-full" />
              </div>
              <Skeleton className="h-7 w-24" />
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </article>
        ))}
      </div>
    </PageShell>
  );
}

function DashboardRouteFallback() {
  return (
    <PageShell label="Loading dashboard page">
      <HeaderBlock titleWidth="w-72" />
      <section className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28 w-full" />)}
      </section>
      <section className="space-y-3">
        <Skeleton className="h-6 w-44" />
        {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-36 w-full" />)}
      </section>
    </PageShell>
  );
}

function TwoPanelRouteFallback({ titleWidth = "w-72" }: { titleWidth?: string }) {
  return (
    <PageShell label="Loading page">
      <HeaderBlock titleWidth={titleWidth} />
      <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-3 border border-[#b43c39]/15 bg-white p-5 shadow-[8px_8px_0_rgba(152,46,65,0.10)]">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}
        </div>
        <div className="space-y-3 border border-[#b43c39]/15 bg-white p-5 shadow-[8px_8px_0_rgba(152,46,65,0.10)]">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </section>
    </PageShell>
  );
}

function CompareRouteFallback() {
  return <TwoPanelRouteFallback titleWidth="w-96" />;
}

function SettingsRouteFallback() {
  return (
    <PageShell label="Loading settings page">
      <section className="border border-[#b43c39]/15 bg-white p-5 shadow-[8px_8px_0_rgba(152,46,65,0.10)]">
        <Skeleton className="mb-4 h-10 w-56" />
        <Skeleton className="h-12 w-full" />
        <div className="mt-3 grid gap-3 sm:grid-cols-[140px_180px_120px]">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </section>
      <section className="grid gap-5">
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-80 w-full" />
      </section>
    </PageShell>
  );
}

function GenericSkeletonFallback() {
  return (
    <PageShell label="Loading page">
      <HeaderBlock />
      <section className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-28 w-full" />)}
      </section>
    </PageShell>
  );
}

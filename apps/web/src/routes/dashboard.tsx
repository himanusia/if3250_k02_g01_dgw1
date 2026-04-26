import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import type { CampaignRecord, KolRecord } from "@/lib/app-types";

import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard")({
  component: RouteComponent,
});

function RouteComponent() {
  const privateData = useQuery(orpc.privateData.queryOptions());
  const campaignsQuery = useQuery(orpc.campaign.list.queryOptions());
  const kolsQuery = useQuery(orpc.kol.list.queryOptions());
  const campaigns = (campaignsQuery.data as CampaignRecord[] | undefined) ?? [];
  const kols = (kolsQuery.data as KolRecord[] | undefined) ?? [];

  const tierBreakdown = useMemo(() => {
    const counts = { nano: 0, micro: 0, macro: 0, mega: 0 };
    for (const kol of kols) {
      counts[kol.followerTier] += 1;
    }
    return counts;
  }, [kols]);

  return (
    <div className="container mx-auto grid gap-6 px-4 py-6">
      <section className="grid gap-2">
        <p className="text-muted-foreground text-sm uppercase tracking-[0.2em]">Dashboard</p>
        <h1 className="text-3xl font-semibold">Selamat datang, {privateData.data?.user?.name}</h1>
        <p className="text-muted-foreground max-w-2xl">Ringkasan data utama.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="bg-card ring-foreground/10 space-y-2 p-4 ring-1">
          <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">Campaign</p>
          <p className="text-3xl font-semibold">{campaigns.length}</p>
          <p className="text-muted-foreground">Total campaign.</p>
        </div>
        <div className="bg-card ring-foreground/10 space-y-2 p-4 ring-1">
          <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">KOL</p>
          <p className="text-3xl font-semibold">{kols.length}</p>
          <p className="text-muted-foreground">Total KOL.</p>
        </div>
        <div className="bg-card ring-foreground/10 space-y-2 p-4 ring-1">
          <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">Access</p>
          <p className="text-3xl font-semibold">{privateData.data?.access?.role ?? "user"}</p>
          <p className="text-muted-foreground">Role aktif.</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="bg-card ring-foreground/10 space-y-2 p-4 ring-1">
          <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">Nano</p>
          <p className="text-2xl font-semibold">{tierBreakdown.nano}</p>
          <p className="text-muted-foreground text-sm">&lt; 10K followers</p>
        </div>
        <div className="bg-card ring-foreground/10 space-y-2 p-4 ring-1">
          <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">Micro</p>
          <p className="text-2xl font-semibold">{tierBreakdown.micro}</p>
          <p className="text-muted-foreground text-sm">10K - 100K followers</p>
        </div>
        <div className="bg-card ring-foreground/10 space-y-2 p-4 ring-1">
          <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">Macro</p>
          <p className="text-2xl font-semibold">{tierBreakdown.macro}</p>
          <p className="text-muted-foreground text-sm">100K - 1M followers</p>
        </div>
        <div className="bg-card ring-foreground/10 space-y-2 p-4 ring-1">
          <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">Mega</p>
          <p className="text-2xl font-semibold">{tierBreakdown.mega}</p>
          <p className="text-muted-foreground text-sm">&gt; 1M followers</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="bg-card ring-foreground/10 space-y-4 p-4 ring-1">
          <div>
            <h2 className="text-lg font-medium">Menu utama</h2>
            <p className="text-muted-foreground">Akses halaman utama.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <LinkCard href="/kols" title="Lihat KOL" description="Kelola daftar KOL dan akun platformnya." />
            <LinkCard
              href="/compare-kols"
              title="Bandingkan KOL"
              description="Cari, filter, dan pilih akun terbaik."
            />
            <LinkCard
              href="/campaigns"
              title="Lihat Campaign"
              description="Susun brief lalu hubungkan dengan KOL terpilih."
            />
          </div>
        </div>

        <div className="bg-card ring-foreground/10 space-y-3 p-4 ring-1">
          <div>
            <h2 className="text-lg font-medium">Campaign terbaru</h2>
            <p className="text-muted-foreground">Data terbaru.</p>
          </div>
          <div className="space-y-3">
            {campaigns.slice(0, 3).map((campaign) => (
              <div key={campaign.id} className="border-border space-y-1 border p-3">
                <p className="font-medium">{campaign.name}</p>
                <p className="text-muted-foreground text-sm">{campaign.brand}</p>
                <p className="text-muted-foreground text-sm">
                  {campaign.kols.length} KOL • {campaign.status}
                </p>
              </div>
            ))}
            {!campaigns.length && (
              <p className="text-muted-foreground text-sm">Belum ada campaign yang tersimpan.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function LinkCard({
  description,
  href,
  title,
}: {
  description: string;
  href: "/campaigns" | "/compare-kols" | "/kols";
  title: string;
}) {
  return (
    <Link to={href} className="border-border hover:bg-muted/50 space-y-1 border p-3 transition-colors">
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground text-sm">{description}</p>
    </Link>
  );
}

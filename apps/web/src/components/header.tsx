import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { orpc } from "@/utils/orpc";

import { authClient } from "@/lib/auth-client";

import UserMenu from "./user-menu";
import { Button } from "./ui/button";

export default function Header() {
  const { data: session } = authClient.useSession();
  const privateDataQuery = useQuery({
    ...orpc.privateData.queryOptions(),
    enabled: Boolean(session),
  });

  const isAdmin = privateDataQuery.data?.whitelist?.role === "admin";
  const links = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/campaigns", label: "Campaigns" },
    { to: "/kols", label: "KOL" },
    { to: "/compare-kols", label: "CompareKOL" },
  ] as const;
  const adminLinks = isAdmin ? ([{ to: "/whitelist", label: "Whitelist" }] as const) : [];
  const visibleLinks = [...links, ...adminLinks];

  return (
    <div className="sticky top-0 z-40 flex w-full items-center justify-between gap-3 bg-gradient-to-r from-[#B43C39] to-[#7B204C] px-4 py-3 shadow-md sm:px-6 lg:px-12">
      {/* Logo & Tulisan */}
      <Link
        to="/dashboard"
        aria-label="Ke dashboard DigiWonder"
        className="flex min-w-0 items-center gap-3 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#B43C39]"
      >
        {/* LOGO PLACEHOLDER`public/images/logo.png` */}
        <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-white md:size-14">
          <img 
            src="/images/logo-placeholder.svg" 
            alt="Digi Wonder Logo" 
            className="h-full w-full object-cover"
          />
        </div>
        {/* goldman font*/}
        <span className="hidden font-goldman text-2xl font-bold uppercase tracking-widest text-white lg:inline">
          Digi Wonder
        </span>
      </Link>

      {/* Navigasi Menu & User Menu */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-4 lg:gap-8">
        <nav className="hidden lg:flex items-center gap-6 font-poppins text-[15px]">
          {visibleLinks.map(({ to, label }) => {
            return (
              <Link 
                key={to} 
                to={to}
                className="text-white/90 hover:text-white transition-colors pb-1 border-b-2 border-transparent"
                activeProps={{
                  className: "!text-white font-semibold !border-white"
                }}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="lg:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label="Buka menu navigasi"
                  className="border-0 bg-black/25 px-3 text-white shadow-none hover:bg-black/40 hover:text-white"
                />
              }
            >
              <Menu className="size-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-white text-black">
              {visibleLinks.map(({ to, label }) => (
                <DropdownMenuItem key={to} render={<Link to={to} />}>
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* user dropdown */}
        <div className="font-poppins">
          <UserMenu />
        </div>
      </div>
    </div>
  );
}

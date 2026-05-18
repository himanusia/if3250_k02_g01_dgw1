import { Link } from "@tanstack/react-router";

import UserMenu from "./user-menu";

export default function Header() {
  const links = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/campaigns", label: "Campaigns" },
    { to: "/kols", label: "KOL" },
    { to: "/compare-kols", label: "CompareKOL" },
    { to: "/whitelist", label: "Whitelist" },
  ] as const;

  return (
    <div className="w-full bg-gradient-to-r from-[#B43C39] to-[#7B204C] shadow-md py-4 px-6 sm:px-12 flex flex-col md:flex-row items-center justify-between gap-4">
      {/* Logo & Tulisan */}
      <div className="flex items-center gap-4">
        {/* LOGO PLACEHOLDER`public/images/logo.png` */}
        <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shrink-0 overflow-hidden border-2 border-white">
          <img 
            src="/images/logo-placeholder.svg" 
            alt="Digi Wonder Logo" 
            className="w-full h-full object-cover" 
          />
        </div>
        {/* goldman font*/}
        <span className="font-goldman text-white text-2xl font-bold tracking-widest uppercase mt-1">
          Digi Wonder
        </span>
      </div>

      {/* Navigasi Menu & User Menu */}
      <div className="flex items-center gap-8">
        <nav className="hidden md:flex items-center gap-6 font-poppins text-[15px]">
          {links.map(({ to, label }) => {
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

        {/* user dropdown */}
        <div className="font-poppins">
          <UserMenu />
        </div>
      </div>
    </div>
  );
}

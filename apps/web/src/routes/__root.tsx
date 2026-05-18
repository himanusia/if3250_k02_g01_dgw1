import type { QueryClient } from "@tanstack/react-query";

import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  redirect,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import type { orpc } from "@/utils/orpc";

import { Toaster } from "@/components/ui/sonner";
import { getAuthState } from "../functions/get-auth-state";
import { loadAuthStateSafely } from "../lib/auth-state";

import Header from "../components/header";
import appCss from "../index.css?url";
export interface RouterAppContext {
  orpc: typeof orpc;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  beforeLoad: async ({ location }) => {
    const isApiRoute = location.pathname.startsWith("/api/");

    if (isApiRoute) {
      return;
    }

    const isPublicRoute = ["/login", "/unauthorized"].includes(location.pathname);
    const authState = await loadAuthStateSafely(getAuthState);

    if (!authState.session && !isPublicRoute) {
      throw redirect({
        to: "/login",
      });
    }

    if (authState.session && !authState.whitelist && location.pathname !== "/unauthorized") {
      throw redirect({
        to: "/unauthorized",
      });
    }

    if (authState.session && authState.whitelist && isPublicRoute) {
      throw redirect({
        to: "/dashboard",
      });
    }

    return authState;
  },
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "DigiWonder | KOL Campaign Dashboard",
      },
      {
        name: "description",
        content:
          "DigiWonder is a private campaign dashboard for managing KOL profiles, campaign planning, and social-content performance.",
      },
      {
        name: "robots",
        content: "noindex, nofollow",
      },
      {
        name: "theme-color",
        content: "#020617",
      },
      {
        property: "og:site_name",
        content: "DigiWonder",
      },
      {
        property: "og:title",
        content: "DigiWonder | KOL Campaign Dashboard",
      },
      {
        property: "og:description",
        content:
          "Private campaign dashboard for KOL profiles, campaign planning, and social-content performance.",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:image",
        content: "/images/logo-placeholder.svg",
      },
      {
        name: "twitter:card",
        content: "summary",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "manifest",
        href: "/site.webmanifest",
      },
      {
        rel: "icon",
        href: "/favicon.ico",
      },
      {
        rel: "apple-touch-icon",
        href: "/images/logo-placeholder.svg",
      },
    ],
  }),

  component: RootDocument,
});

function RootDocument() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const showHeader = pathname !== "/login";

  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="grid h-svh grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
          {showHeader && <Header />}
          <main className="min-h-0 overflow-hidden">
            <Outlet />
          </main>
        </div>
        <Toaster richColors />
        <TanStackRouterDevtools position="bottom-left" />
        <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
        <Scripts />
      </body>
    </html>
  );
}

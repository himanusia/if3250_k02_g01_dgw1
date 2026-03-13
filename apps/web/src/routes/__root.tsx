import type { QueryClient } from "@tanstack/react-query";

import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  redirect,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import type { orpc } from "@/utils/orpc";

import { Toaster } from "@/components/ui/sonner";
import { getAuthState } from "../functions/get-auth-state";

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
    const authState = await getAuthState();

    if (!authState.session && !isPublicRoute) {
      throw redirect({
        to: "/login",
      });
    }

    if (authState.session && !authState.access && location.pathname !== "/unauthorized") {
      throw redirect({
        to: "/unauthorized",
      });
    }

    if (authState.session && authState.access && isPublicRoute) {
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
        title: "DigiWonder",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),

  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="grid h-svh grid-rows-[auto_1fr]">
          <Header />
          <Outlet />
        </div>
        <Toaster richColors />
        <TanStackRouterDevtools position="bottom-left" />
        <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
        <Scripts />
      </body>
    </html>
  );
}

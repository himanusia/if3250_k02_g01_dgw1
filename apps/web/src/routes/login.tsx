import { createFileRoute } from "@tanstack/react-router";

import GoogleSignInCard from "@/components/google-sign-in-card";
import { redirectIfAuthenticated } from "@/lib/auth-guard";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    await redirectIfAuthenticated();
  },
  component: RouteComponent,
});

function RouteComponent() {
  return <GoogleSignInCard />;
}

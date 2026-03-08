import { createFileRoute } from "@tanstack/react-router";

import GoogleSignInCard from "@/components/google-sign-in-card";

export const Route = createFileRoute("/login")({
  component: RouteComponent,
});

function RouteComponent() {
  return <GoogleSignInCard />;
}

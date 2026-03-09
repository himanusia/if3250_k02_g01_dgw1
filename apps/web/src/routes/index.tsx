import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    throw redirect({
      to: "/dashboard",
    });
  },
  component: RouteComponent,
});

function RouteComponent() {
  return null;
}

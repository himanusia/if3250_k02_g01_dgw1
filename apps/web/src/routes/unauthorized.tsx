import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/unauthorized")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();

  return (
    <div className="flex h-full overflow-y-auto px-4 py-10">
      <div className="mx-auto flex min-h-full w-full max-w-xl items-center">
        <div className="bg-card ring-foreground/10 w-full space-y-4 p-6 text-center ring-1">
        <div className="mx-auto flex size-12 items-center justify-center border">
          <ShieldAlert className="size-5" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Akses belum diberikan</h1>
          <p className="text-muted-foreground">
            Email Google ini belum diberi akses aplikasi. Minta administrator untuk menambahkan email kamu dulu.
          </p>
        </div>
        <div className="flex justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => {
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    navigate({
                      to: "/login",
                    });
                  },
                },
              });
            }}
          >
            Keluar
          </Button>
          <Button onClick={() => navigate({ to: "/login" })}>Kembali ke login</Button>
        </div>
        </div>
      </div>
    </div>
  );
}

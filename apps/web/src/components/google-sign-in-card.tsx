import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

export default function GoogleSignInCard() {
  const navigate = useNavigate();
  const { isPending: isSessionPending } = authClient.useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);

    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/dashboard",
      errorCallbackURL: "/login",
    });

    if (error) {
      setIsSubmitting(false);
      toast.error(error.message || "Google sign in failed");
      return;
    }

    navigate({
      to: "/dashboard",
    });
  };

  const isLoading = isSessionPending || isSubmitting;

  return (
    <div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-3xl font-semibold">Masuk ke DigiWonder</CardTitle>
          <CardDescription>
            Login sekarang pakai akun Google untuk lanjut ke dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" size="lg" onClick={handleGoogleSignIn} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Mengarahkan ke Google...
              </>
            ) : (
              "Lanjut dengan Google"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
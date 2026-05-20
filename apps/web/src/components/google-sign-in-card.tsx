import { AlertTriangle, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { getLoginErrorMessage } from "@/lib/login-error-message";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

export default function GoogleSignInCard() {
  const { isPending: isSessionPending } = authClient.useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);

    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/dashboard",
        errorCallbackURL: "/login",
        disableRedirect: true,
      });

      if (result.error) {
        setIsSubmitting(false);
        toast.error(result.error.message || "Google sign in failed");
        return;
      }

      const redirectUrl =
        typeof result.data === "object" &&
        result.data !== null &&
        "url" in result.data &&
        typeof result.data.url === "string"
          ? result.data.url
          : null;

      if (!redirectUrl) {
        setIsSubmitting(false);
        toast.error("URL login Google tidak ditemukan.");
        return;
      }

      window.location.assign(redirectUrl);
    } catch (error) {
      setIsSubmitting(false);
      toast.error(error instanceof Error ? error.message : "Google sign in failed");
    }
  };

  const isLoading = isSessionPending || isSubmitting;
  const loginErrorMessage = getLoginErrorMessage(
    typeof window === "undefined" ? "" : window.location.search
  );

  return (
    <div className="flex h-svh min-h-0 items-center justify-center overflow-y-auto bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-md">
        <Card className="w-full">
          <CardHeader className="space-y-2 text-center">
            <CardTitle className="text-3xl font-semibold">Masuk ke DigiWonder</CardTitle>
            <CardDescription>
              Login sekarang pakai akun Google untuk lanjut ke dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loginErrorMessage && (
              <div
                className="flex items-start gap-3 border border-destructive/35 bg-destructive/10 p-3 text-left text-destructive"
                role="alert"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p className="text-sm leading-relaxed">{loginErrorMessage}</p>
              </div>
            )}
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
    </div>
  );
}
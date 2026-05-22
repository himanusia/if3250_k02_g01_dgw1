import { AlertTriangle, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { getLoginErrorMessage } from "@/lib/login-error-message";

import { Button } from "./ui/button";

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
    <div className="min-h-svh bg-[#f7f5f2] px-6 py-8 text-[#171312]">
      <div className="mx-auto grid min-h-[calc(100svh-4rem)] w-full max-w-6xl items-center gap-10 lg:grid-cols-[1fr_0.88fr]">
        <section className="flex flex-col items-center justify-center text-center lg:items-start lg:text-left">
          <div className="relative flex size-40 items-center justify-center rounded-[2.5rem] bg-white p-7 shadow-[0_28px_90px_rgba(23,19,18,0.12)] ring-1 ring-black/5 sm:size-52 sm:rounded-[3rem] sm:p-9 lg:size-72 lg:rounded-[4rem] lg:p-12">
            <div className="pointer-events-none absolute inset-4 rounded-[inherit] bg-gradient-to-br from-[#B43C39]/8 via-transparent to-[#7B204C]/10" />
            <img src="/images/logo-placeholder.svg" alt="Digi Wonder" className="relative h-full w-full object-contain" />
          </div>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.32em] text-[#7B204C]/65">
            Digi Wonder
          </p>
        </section>

        <section className="mx-auto w-full max-w-md rounded-[2rem] border border-black/5 bg-white/80 p-6 shadow-[0_28px_90px_rgba(23,19,18,0.10)] backdrop-blur md:p-8">
          <div className="space-y-2">
            <p className="text-sm font-medium text-[#B43C39]">Welcome back</p>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[#171312] md:text-4xl">
              Sign in
            </h1>
            <p className="text-sm leading-6 text-[#706866]">
              Masuk pakai akun Google yang sudah terdaftar.
            </p>
          </div>

          {loginErrorMessage && (
            <div
              className="mt-6 flex items-start gap-3 rounded-2xl border border-destructive/25 bg-destructive/8 p-4 text-left text-destructive"
              role="alert"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p className="text-sm leading-relaxed">{loginErrorMessage}</p>
            </div>
          )}

          <Button
            className="mt-8 h-13 w-full rounded-2xl border border-black/10 bg-[#171312] text-sm font-semibold text-white shadow-[0_18px_45px_rgba(23,19,18,0.18)] transition hover:-translate-y-0.5 hover:bg-[#2b2421] hover:shadow-[0_24px_60px_rgba(23,19,18,0.22)]"
            size="lg"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            aria-label="Masuk dengan Google"
          >
            {isLoading ? <Loader2 className="size-5 animate-spin" /> : <GoogleIcon className="size-5" />}
          </Button>
        </section>
      </div>
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

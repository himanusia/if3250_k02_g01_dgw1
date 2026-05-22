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
    <div className="h-svh overflow-y-auto bg-[#fff8f9] text-[#2b1418]">
      <div className="grid min-h-full lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative flex min-h-[42vh] flex-col justify-between overflow-hidden bg-gradient-to-br from-[#B43C39] via-[#8d2948] to-[#3f1231] p-6 text-white md:p-10 lg:min-h-full">
          <div className="pointer-events-none absolute -left-24 top-16 size-72 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 right-0 size-96 translate-x-1/4 translate-y-1/4 rounded-full bg-[#ffd66b]/25 blur-3xl" />
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex size-12 items-center justify-center overflow-hidden rounded-2xl bg-white p-1.5 shadow-lg shadow-black/20">
              <img src="/images/logo-placeholder.svg" alt="Digi Wonder" className="h-full w-full object-cover" />
            </div>
            <div>
              <p className="font-goldman text-xl font-bold uppercase tracking-[0.18em]">Digi Wonder</p>
              <p className="text-xs uppercase tracking-[0.28em] text-white/70">Campaign OS</p>
            </div>
          </div>

          <div className="relative z-10 mx-auto flex w-full max-w-xl flex-col items-center py-8 text-center lg:py-16">
            <div className="mb-8 hidden size-52 items-center justify-center rounded-[3rem] bg-white p-8 shadow-[0_28px_100px_rgba(0,0,0,0.28)] ring-1 ring-white/40 lg:flex xl:size-64">
              <img src="/images/logo-placeholder.svg" alt="Digi Wonder logo besar" className="h-full w-full object-contain" />
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[#ffd66b]">Private brand command center</p>
            <h1 className="mt-4 font-goldman text-4xl font-bold uppercase leading-tight tracking-wide md:text-5xl xl:text-6xl">
              Kelola KOL campaign tanpa spreadsheet chaos.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-white/78 md:text-lg">
              Login untuk masuk ke dashboard brand, campaign, KOL, whitelist, dan arsip konten dalam satu tempat.
            </p>
          </div>

          <div className="relative z-10 grid gap-3 text-sm text-white/80 sm:grid-cols-3">
            <LoginPill label="Brand" value="Workspace" />
            <LoginPill label="KOL" value="Selection" />
            <LoginPill label="Content" value="Archive" />
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-8 md:px-10 lg:py-12">
          <div className="w-full max-w-md space-y-8">
            <div className="space-y-3">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#B43C39]">Secure login</p>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Masuk ke workspace</h2>
              <p className="text-muted-foreground">
                Gunakan akun Google yang sudah masuk whitelist Digi Wonder. Kalau belum terdaftar,
                minta admin menambahkan email kamu dulu.
              </p>
            </div>

            {loginErrorMessage && (
              <div
                className="flex items-start gap-3 rounded-2xl border border-destructive/35 bg-destructive/10 p-4 text-left text-destructive"
                role="alert"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p className="text-sm leading-relaxed">{loginErrorMessage}</p>
              </div>
            )}

            <div className="rounded-[2rem] border border-[#b43c39]/15 bg-white p-5 shadow-[0_20px_70px_rgba(123,32,76,0.12)] md:p-6">
              <Button
                className="h-13 w-full rounded-2xl bg-[#2b1418] text-base font-semibold text-white shadow-sm transition hover:bg-[#7B204C]"
                size="lg"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Mengarahkan ke Google...
                  </>
                ) : (
                  "Lanjut dengan Google"
                )}
              </Button>
              <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
                Akses dibatasi untuk email yang ada di whitelist. Login gagal akan diarahkan kembali ke halaman ini.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function LoginPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-white/55">{label}</p>
      <p className="mt-1 font-semibold text-white">{value}</p>
    </div>
  );
}

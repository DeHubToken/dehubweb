import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import { NebulaBackground } from "@/components/ui/NebulaBackground";

type ConfirmState = "verifying" | "confirmed" | "error";

/**
 * Branded confirmation landing for auth emails.
 *
 * This page verifies the one-time link with an isolated auth client that does
 * not persist a session in the browser that clicked the email link. It only
 * broadcasts the verified session back to the browser that requested the magic
 * link, then shows a success screen.
 */
export default function AuthConfirm() {
  const [params] = useSearchParams();
  const [state, setState] = useState<ConfirmState>("verifying");
  const [error, setError] = useState("");
  const hasVerifiedRef = useRef(false);

  const authVerifier = useMemo(() => {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

    if (!url || !key) return null;

    return createClient(url, key, {
      auth: {
        storageKey: "dehub-auth-confirm-verifier",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }, []);

  useEffect(() => {
    if (hasVerifiedRef.current) return;

    const tokenHash = params.get("token_hash");
    const type = params.get("type") as
      | "signup"
      | "magiclink"
      | "recovery"
      | "invite"
      | "email_change"
      | "email"
      | null;
    const sync = params.get("sync");

    if (!authVerifier) {
      setError("This confirmation page is not ready. Try requesting a new link.");
      setState("error");
      return;
    }

    if (!tokenHash || !type) {
      setError("This link is missing information. Try requesting a new one.");
      setState("error");
      return;
    }

    hasVerifiedRef.current = true;

    (async () => {
      const { data, error: verifyError } = await authVerifier.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as any,
      });

      if (verifyError) {
        setError(verifyError.message || "This link is invalid or has expired.");
        setState("error");
        return;
      }

      const accessToken = data.session?.access_token;
      const refreshToken = data.session?.refresh_token;

      if (sync && accessToken && refreshToken) {
        try {
          const channel = authVerifier.channel(`auth-sync-${sync}`, {
            config: { broadcast: { self: false, ack: true } },
          });

          await new Promise<void>((resolve) => {
            let done = false;
            const finish = () => {
              if (!done) {
                done = true;
                resolve();
              }
            };

            channel.subscribe(async (status) => {
              if (status !== "SUBSCRIBED") return;

              try {
                await channel.send({
                  type: "broadcast",
                  event: "session",
                  payload: {
                    access_token: accessToken,
                    refresh_token: refreshToken,
                  },
                });
              } catch {
                // Best effort: the clicked browser should still show confirmed.
              }

              finish();
            });

            window.setTimeout(finish, 2500);
          });

          try {
            await authVerifier.removeChannel(channel);
          } catch {
            // ignore cleanup errors
          }
        } catch (err) {
          console.warn("Cross-device magic-link sync broadcast failed:", err);
        }
      }

      // Do not call signOut here: even with persistSession disabled, Supabase
      // logout revokes the just-verified refresh token before the original
      // browser can hydrate it from the realtime broadcast.
      setState("confirmed");
    })();
  }, [params, authVerifier]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <div aria-hidden="true" className="absolute inset-0 opacity-90">
        <NebulaBackground />
      </div>
      <div className="absolute inset-0 bg-black/35" aria-hidden="true" />
      <section className="relative z-10 flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md space-y-5 rounded-2xl border border-white/10 bg-black/60 px-8 py-10 text-center shadow-2xl backdrop-blur-[24px]">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur-xl">
            {state === "verifying" && (
              <div className="h-full w-full rounded-full border-2 border-white/20 border-t-white animate-spin" />
            )}
            {state === "confirmed" && (
              <div className="h-4 w-4 rounded-full bg-white shadow-[0_0_28px_rgba(255,255,255,0.42)]" />
            )}
            {state === "error" && <div className="h-4 w-4 rounded-full bg-white/35" />}
          </div>

          <h1 className="text-3xl font-semibold tracking-tight">
            {state === "verifying" ? "Confirming…" : state === "confirmed" ? "Confirmed" : "Link problem"}
          </h1>

          <p className="text-sm leading-6 text-white/70">
            {state === "verifying"
              ? "Hang tight while we confirm your DeHub link."
              : state === "confirmed"
                ? "You can close this window now."
                : error}
          </p>
        </div>
      </section>
    </main>
  );
}
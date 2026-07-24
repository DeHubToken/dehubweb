import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const SUPA_LOGIN_PENDING_KEY = "dehub_supa_login_pending";

/**
 * Branded confirmation landing for auth emails.
 *
 * Auth emails send users to `https://dehub.io/auth/confirm?token_hash=…&type=…`
 * instead of the raw Supabase verify URL. We verify the OTP client-side
 * (verifyOtp with token_hash) and then bounce into the app.
 *
 * Cross-device sync: when the originating device passed a `sync` nonce via
 * emailRedirectTo, we broadcast the freshly-minted session tokens on the
 * matching realtime channel so the other browser/device that requested the
 * link also gets signed in automatically.
 */
export default function AuthConfirm() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<"verifying" | "error">("verifying");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const tokenHash = params.get("token_hash");
    const type = params.get("type") as
      | "signup"
      | "magiclink"
      | "recovery"
      | "invite"
      | "email_change"
      | "email"
      | null;
    const next = params.get("next") || "/app";
    const sync = params.get("sync");

    if (!tokenHash || !type) {
      setError("This link is missing information. Try requesting a new one.");
      setState("error");
      return;
    }

    (async () => {
      // Ensure this device also runs the wallet phase (see AuthProvider auth
      // state listener) — SIGNED_IN only fires proceedToWalletPhase when the
      // pending flag is set.
      try { localStorage.setItem(SUPA_LOGIN_PENDING_KEY, "1"); } catch { /* ignore */ }

      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as any,
      });
      if (error) {
        try { localStorage.removeItem(SUPA_LOGIN_PENDING_KEY); } catch { /* ignore */ }
        setError(error.message || "This link is invalid or has expired.");
        setState("error");
        return;
      }

      // Broadcast the session to the originating device (best-effort — never
      // block navigation on it).
      if (sync && data?.session?.access_token && data?.session?.refresh_token) {
        try {
          const channel = supabase.channel(`auth-sync-${sync}`, {
            config: { broadcast: { self: false, ack: true } },
          });
          await new Promise<void>((resolve) => {
            let done = false;
            const finish = () => { if (!done) { done = true; resolve(); } };
            channel.subscribe(async (status) => {
              if (status === "SUBSCRIBED") {
                try {
                  await channel.send({
                    type: "broadcast",
                    event: "session",
                    payload: {
                      access_token: data.session!.access_token,
                      refresh_token: data.session!.refresh_token,
                    },
                  });
                } catch { /* ignore */ }
                finish();
              }
            });
            setTimeout(finish, 2500);
          });
          try { await supabase.removeChannel(channel); } catch { /* ignore */ }
        } catch (err) {
          console.warn("Cross-device magic-link sync broadcast failed:", err);
        }
      }

      // Sanitize `next` to same-origin path only.
      const target = next.startsWith("/") && !next.startsWith("//") ? next : "/app";
      navigate(target, { replace: true });
    })();
  }, [params, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[hsl(var(--paper,0_0%_100%))]">
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {state === "verifying" ? "Signing you in…" : "Link problem"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {state === "verifying"
            ? "Hang tight while we verify your DeHub link."
            : error}
        </p>
        {state === "error" && (
          <button
            onClick={() => navigate("/app")}
            className="inline-flex items-center rounded-xl px-4 py-2 text-sm font-medium bg-foreground text-background"
          >
            Back to DeHub
          </button>
        )}
      </div>
    </div>
  );
}

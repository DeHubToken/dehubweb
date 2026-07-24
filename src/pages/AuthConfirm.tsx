import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Branded confirmation landing for auth emails.
 *
 * Auth emails send users to `https://dehub.io/auth/confirm?token_hash=…&type=…`
 * instead of the raw Supabase verify URL. We verify the OTP client-side
 * (verifyOtp with token_hash) and then bounce into the app.
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

    if (!tokenHash || !type) {
      setError("This link is missing information. Try requesting a new one.");
      setState("error");
      return;
    }

    (async () => {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as any,
      });
      if (error) {
        setError(error.message || "This link is invalid or has expired.");
        setState("error");
        return;
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

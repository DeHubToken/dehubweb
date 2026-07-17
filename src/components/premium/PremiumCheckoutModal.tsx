import { useEffect, useMemo, useState } from "react";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { supabase } from "@/integrations/supabase/client";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export interface PremiumCheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  priceId: string;
  walletAddress: string;
  customerEmail?: string;
}

export function PremiumCheckoutModal({
  open,
  onOpenChange,
  priceId,
  walletAddress,
  customerEmail,
}: PremiumCheckoutModalProps) {
  const [error, setError] = useState<string | null>(null);

  // New session every time the dialog opens for a (priceId, wallet) pair.
  const sessionKey = useMemo(
    () => (open ? `${priceId}:${walletAddress}:${Date.now()}` : ""),
    [open, priceId, walletAddress],
  );

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const fetchClientSecret = async (): Promise<string> => {
    const returnUrl = `${window.location.origin}/premium?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const { data, error: invokeError } = await supabase.functions.invoke(
      "create-checkout",
      {
        body: {
          priceId,
          walletAddress,
          customerEmail,
          returnUrl,
          environment: getStripeEnvironment(),
        },
      },
    );
    if (invokeError || !data?.clientSecret) {
      const msg =
        invokeError?.message ||
        data?.error ||
        "Failed to start checkout. Please try again.";
      setError(msg);
      throw new Error(msg);
    }
    return data.clientSecret as string;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-black/80 backdrop-blur-[24px] border border-white/10 p-0 overflow-hidden">
        <div className="max-h-[85vh] overflow-y-auto">
          {error ? (
            <div className="p-8 text-center text-sm text-red-300">
              {error}
            </div>
          ) : open ? (
            <div className="bg-white">
              <EmbeddedCheckoutProvider
                key={sessionKey}
                stripe={getStripe()}
                options={{ fetchClientSecret }}
              >
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

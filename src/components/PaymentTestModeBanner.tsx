const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as
  | string
  | undefined;

export function PaymentTestModeBanner() {
  if (!clientToken) {
    return (
      <div className="w-full bg-red-900/40 border-b border-red-500/30 px-4 py-2 text-center text-xs text-red-200">
        Production checkout is not configured yet. Complete payments go-live to accept real payments.
      </div>
    );
  }
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="w-full bg-amber-500/15 border-b border-amber-400/30 px-4 py-2 text-center text-xs text-amber-200">
        Payments in the preview are in test mode — use card{" "}
        <span className="font-mono">4242 4242 4242 4242</span> with any future
        expiry and CVC.
      </div>
    );
  }
  return null;
}

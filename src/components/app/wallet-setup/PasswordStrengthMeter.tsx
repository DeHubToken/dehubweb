import { useMemo } from "react";
import { assessLocal } from "@/lib/wallet-core/passwordStrength";

// Live, local-only strength meter. The hard gate (length + breach check) runs
// on submit in the parent; this just gives immediate visual feedback.
const BAR_COLORS = [
  "bg-destructive",
  "bg-destructive",
  "bg-yellow-500",
  "bg-yellow-400",
  "bg-green-500",
] as const;

export function PasswordStrengthMeter({ password }: { password: string }) {
  const a = useMemo(() => assessLocal(password), [password]);
  if (!password) return null;
  return (
    // translate="no": this text changes on every keystroke. If the browser's
    // own page-translate feature (Chrome/Edge auto-translate) has wrapped
    // these text nodes, React's next update tries to remove a node that's no
    // longer where it left it and throws "Failed to execute 'removeChild'".
    // Excluding this subtree from translation stops the browser from
    // touching it at all.
    <div className="space-y-1 notranslate" translate="no" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded ${i < a.score ? BAR_COLORS[a.score] : "bg-muted"}`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {a.label}
        {a.warnings[0] ? ` — ${a.warnings[0]}` : ""}
      </p>
    </div>
  );
}

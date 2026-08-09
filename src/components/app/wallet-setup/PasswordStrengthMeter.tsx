import { useMemo } from "react";
import { Check, X } from "lucide-react";
import { assessLocal, MIN_ACCEPTABLE_SCORE } from "@/lib/wallet-core/passwordStrength";

// Live, local-only strength meter. The breach check still runs on submit in the
// parent; everything the local rules can decide is decided here, while the user
// is still typing.
//
// The rules are rendered as a checklist rather than inferred from a colour,
// because the requirement used to live only in the field's placeholder — which
// disappears the moment you type the first character. What was left was an
// adjective over a coloured bar, and "Fair" with two lit bars reads as good
// enough when submit is about to reject it.
const BAR_COLORS = [
  "bg-destructive",
  "bg-destructive",
  "bg-yellow-500",
  "bg-yellow-400",
  "bg-green-500",
] as const;

export function PasswordStrengthMeter({ password }: { password: string }) {
  const a = useMemo(() => assessLocal(password), [password]);
  const accepted = a.score >= MIN_ACCEPTABLE_SCORE;

  return (
    // translate="no": this text changes on every keystroke. If the browser's
    // own page-translate feature (Chrome/Edge auto-translate) has wrapped
    // these text nodes, React's next update tries to remove a node that's no
    // longer where it left it and throws "Failed to execute 'removeChild'".
    // Excluding this subtree from translation stops the browser from
    // touching it at all.
    <div className="space-y-1.5 notranslate" translate="no" aria-live="polite">
      {password && (
        <>
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded ${i < a.score ? BAR_COLORS[a.score] : "bg-muted"}`}
              />
            ))}
          </div>
          <p className={`text-xs ${accepted ? "text-muted-foreground" : "text-red-400"}`}>
            {accepted ? a.label : `${a.label} — not accepted yet`}
          </p>
        </>
      )}

      {/* Always on screen, typing or not: these are the rules, and the user
          should never have to press a button to discover one of them. */}
      <ul className="space-y-0.5">
        {a.requirements.map((req) => (
          <li
            key={req.label}
            className={`flex items-center gap-1.5 text-xs ${
              req.met ? "text-green-500" : "text-muted-foreground"
            }`}
          >
            {req.met
              ? <Check className="w-3 h-3 shrink-0" aria-hidden />
              : <X className="w-3 h-3 shrink-0 opacity-50" aria-hidden />}
            <span>{req.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

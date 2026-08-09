// Wallet-password strength assessment + Have I Been Pwned (HIBP) breach check.
//
// This is the single highest-leverage control for the password-encrypted seed
// blob: Argon2id slows an offline guesser, but only a strong, un-breached
// password actually keeps a leaked `encrypted_seed` safe. The breach check uses
// HIBP's k-anonymity range API (only the first 5 hex chars of the SHA-1 are
// ever sent), and it FAILS OPEN — a network error never blocks wallet creation.

export const MIN_PASSWORD_LENGTH = 12;

// Past this length, character variety stops carrying useful information: a
// 20-character all-lowercase passphrase has a far bigger search space than
// "Appleboy123!", and the old rule accepted the second while rejecting the
// first. Length alone qualifies here.
export const PASSPHRASE_LENGTH = 20;

// A tiny set of obviously-bad passwords / patterns. Not exhaustive — the HIBP
// check is the real corpus; this just gives instant local feedback.
const COMMON = new Set([
  "password",
  "password1",
  "passw0rd",
  "12345678",
  "123456789",
  "1234567890",
  "qwertyuiop",
  "letmein",
  "iloveyou",
  "admin123",
  "welcome1",
]);

export interface PasswordRequirement {
  label: string;
  met: boolean;
}

export interface PasswordAssessment {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  /** Every reason this password would be rejected, not just the first. */
  warnings: string[];
  classCount: number;
  longEnough: boolean;
  breached: boolean | null; // null = not checked / check failed (fail-open)
  acceptable: boolean;
  /** Live checklist for the meter — the rules, stated up front, always visible. */
  requirements: PasswordRequirement[];
}

// Scores 0–1 are REJECTED, 2–4 are accepted. Keeping the accept threshold at a
// fixed point on the scale is what lets the meter show it: the old scale mixed
// the two, so a 4-character password scored 2/4 with two lit bars and read as
// halfway there, when in fact submit would bounce it.
const LABELS = ["Too weak", "Too weak", "Okay", "Good", "Strong"] as const;
export const MIN_ACCEPTABLE_SCORE = 2;

function classCount(pw: string): number {
  let c = 0;
  if (/[a-z]/.test(pw)) c += 1;
  if (/[A-Z]/.test(pw)) c += 1;
  if (/[0-9]/.test(pw)) c += 1;
  if (/[^a-zA-Z0-9]/.test(pw)) c += 1;
  return c;
}

function looksTrivial(pw: string): boolean {
  const lower = pw.toLowerCase();
  if (COMMON.has(lower)) return true;
  if (/^(.)\1+$/.test(pw)) return true; // all same char
  if (/^(0123456789|1234567890|abcdefghij|qwertyuiop)/.test(lower)) return true;
  return false;
}

/** Synchronous local assessment (no network) — drives the live strength meter. */
export function assessLocal(pw: string): PasswordAssessment {
  const warnings: string[] = [];
  const classes = classCount(pw);
  const longEnough = pw.length >= MIN_PASSWORD_LENGTH;
  const isPassphrase = pw.length >= PASSPHRASE_LENGTH;
  const trivial = looksTrivial(pw);
  const variedEnough = classes >= 2 || isPassphrase;

  const acceptable = !trivial && longEnough && variedEnough;

  // Every blocker, in the order a user would fix them. The old code pushed at
  // most one and rendered only warnings[0], so a password that was both short
  // AND predictable told you about the predictability and hid the length rule.
  if (trivial) warnings.push("This is a common or predictable password");
  if (!longEnough) warnings.push(`Use at least ${MIN_PASSWORD_LENGTH} characters`);
  else if (!variedEnough) {
    warnings.push(`Add a number or symbol, or make it ${PASSPHRASE_LENGTH}+ characters`);
  }

  let score: number;
  if (!acceptable) {
    // Anything that will be rejected stays in the bottom band, whatever else it
    // has going for it. Two lit bars must never appear under a password submit
    // is about to refuse.
    score = pw.length === 0 ? 0 : 1;
  } else {
    score = 2;
    if (pw.length >= 16 || classes >= 3) score = 3;
    if (isPassphrase || (pw.length >= 16 && classes >= 3)) score = 4;
  }

  const clamped = Math.max(0, Math.min(4, score)) as 0 | 1 | 2 | 3 | 4;
  return {
    score: clamped,
    label: LABELS[clamped],
    warnings,
    classCount: classes,
    longEnough,
    breached: null,
    acceptable,
    requirements: [
      { label: `${MIN_PASSWORD_LENGTH} characters or more`, met: longEnough },
      { label: `A number or symbol — or ${PASSPHRASE_LENGTH}+ characters`, met: variedEnough },
    ],
  };
}

async function sha1Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * HIBP k-anonymity breach check. Returns true if the password appears in a
 * known breach, false if it doesn't, and null if the check couldn't run
 * (offline / rate-limited) so callers can fail open.
 */
export async function isBreached(pw: string): Promise<boolean | null> {
  try {
    const hash = await sha1Hex(pw);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
    });
    if (!res.ok) return null;
    const text = await res.text();
    for (const line of text.split("\n")) {
      const [suf, count] = line.trim().split(":");
      if (suf === suffix && Number(count) > 0) return true;
    }
    return false;
  } catch {
    return null;
  }
}

/** Full assessment: local scoring plus a (fail-open) breach check. */
export async function assessPassword(pw: string): Promise<PasswordAssessment> {
  const local = assessLocal(pw);
  const breached = await isBreached(pw);
  // Breach only hard-blocks when the check actually ran and came back positive.
  const acceptable = local.acceptable && breached !== true;
  return {
    ...local,
    breached,
    acceptable,
    // Keep the score honest about the verdict: a breached password is rejected,
    // so it must not keep the "Strong" it earned on length and variety alone.
    score: acceptable ? local.score : (Math.min(local.score, 1) as 0 | 1),
    warnings: breached === true
      ? [...local.warnings, "This password has appeared in a data breach"]
      : local.warnings,
  };
}

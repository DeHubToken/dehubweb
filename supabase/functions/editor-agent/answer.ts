/** Accept complete JSON answers, including fenced operation arrays. */
export function parseAnswer(raw: unknown): { reply?: unknown; ops?: unknown } | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const text = raw.trim().replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const tryParse = (candidate: string) => {
    try {
      const value = JSON.parse(candidate);
      if (Array.isArray(value)) return { reply: "", ops: value };
      return value && typeof value === "object" ? value : null;
    } catch { return null; }
  };
  const direct = tryParse(text);
  if (direct) return direct;
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  return start >= 0 && end > start ? tryParse(text.slice(start, end + 1)) : null;
}

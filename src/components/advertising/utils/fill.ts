/**
 * The docs translator (`useLanguage`) returns a raw string — it has no
 * interpolation of its own. Rather than chop every sentence into prefix and
 * suffix keys, translated strings carry `{name}` placeholders and get filled
 * here, so a translator always sees the whole sentence.
 */
export function fill(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (out, [key, value]) => out.split(`{${key}}`).join(String(value)),
    template,
  );
}

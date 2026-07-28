/**
 * PostgREST filter helpers
 * ========================
 * Supabase's `.or()` takes a filter *expression*, not a bound parameter — the
 * string is parsed as a tree of `column.op.value` clauses separated by commas.
 * Interpolating user input straight into it means a comma in the value splits
 * the clause and the whole request 400s.
 *
 * Verified against the live API: searching `DM, video` unquoted returns HTTP
 * 400; quoted it returns 200 with the right rows. Quoting also covers the other
 * expression metacharacters, so use it for every interpolated value.
 */

/**
 * Wrap a value so PostgREST reads it as a single literal, whatever it contains.
 *
 * @example
 *   const pattern = escapeFilterValue(`%${search}%`);
 *   query.or(`title.ilike.${pattern},description.ilike.${pattern}`);
 */
export function escapeFilterValue(value: string): string {
  return `"${value.replace(/["\\]/g, '\\$&')}"`;
}

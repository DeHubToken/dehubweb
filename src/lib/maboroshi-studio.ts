/** Keep both hosted workflows on the fixed private media origin. */
export function maboroshiStudioUrl(preset?: string, remake = false): string {
  const base = 'https://live.dehub.io/maboroshi/';
  const query: string[] = [];
  if (preset && /^[a-z0-9-]{1,80}$/.test(preset)) query.push(`preset=${encodeURIComponent(preset)}`);
  if (remake) query.push('workflow=remake');
  return query.length ? `${base}?${query.join('&')}` : base;
}

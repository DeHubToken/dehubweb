/** Read every public opt-in, including rows beyond the database response cap. */
export async function readAllPresence<T>(readPage: (offset: number, size: number) => Promise<T[]>): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const page = await readPage(rows.length, 500);
    if (!page.length) return rows;
    rows.push(...page);
  }
}

export function coarsenCoordinate(value: number, precisionKm: number, bound: number): number {
  const degrees = Math.max(0.01, precisionKm / 111);
  return Math.max(-bound, Math.min(bound, Math.round(value / degrees) * degrees));
}

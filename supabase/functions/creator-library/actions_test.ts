import { parseLibraryAction, updateLibraryAssets } from './actions.ts';
function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
function equal(actual: unknown, expected: unknown) { assert(JSON.stringify(actual) === JSON.stringify(expected), `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`); }

Deno.test('selection mutations reject unsupported operations and oversized or unsafe ids', () => {
  for (const body of [{ ids: [], operation: 'hide' }, { ids: ['valid-id'], operation: 'delete' },
    { ids: ['../other'], operation: 'favorite' }, { ids: new Array(101).fill('valid-id'), operation: 'hide' }]) {
    let rejected = false;
    try { parseLibraryAction(body); } catch { rejected = true; }
    assert(rejected);
  }
  equal(parseLibraryAction({ ids: ['valid-id', 'valid-id'], operation: 'favorite' }).ids, ['valid-id']);
});

Deno.test('bulk actions affect only ready assets belonging to the verified owner and remain reversible', async () => {
  const rows = [
    { id: 'owned-asset', wallet_address: 'owner', ready: true, favorite: false, hidden: false, storage_path: 'owner/file' },
    { id: 'other-asset', wallet_address: 'outsider', ready: true, favorite: false, hidden: false, storage_path: 'outsider/file' },
    { id: 'pending-asset', wallet_address: 'owner', ready: false, favorite: false, hidden: false, storage_path: 'owner/pending' },
  ];
  const db = { from: (table: string) => {
    equal(table, 'creator_assets');
    return { update: (patch: Record<string, unknown>) => {
      const filters: Array<[string, unknown]> = []; let ids: string[] = [];
      const query = { eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        in: (key: string, values: string[]) => { equal(key, 'id'); ids = values; return query; },
        select: async () => {
          const selected = rows.filter(row => ids.includes(row.id) && filters.every(([key, value]) => row[key as keyof typeof row] === value));
          for (const row of selected) Object.assign(row, patch);
          return { data: selected.map(row => ({ id: row.id })), error: null };
        } };
      return query;
    } };
  } } as unknown as Parameters<typeof updateLibraryAssets>[0];
  const selection = { ids: rows.map(row => row.id), operation: 'hide' as const };
  equal(await updateLibraryAssets(db, 'owner', selection), { completedIds: ['owned-asset'], incompleteIds: ['other-asset', 'pending-asset'] });
  assert(rows[0].hidden); assert(rows[0].ready); equal(rows[0].storage_path, 'owner/file');
  assert(!rows[1].hidden && !rows[2].hidden);
  await updateLibraryAssets(db, 'owner', { ...selection, operation: 'favorite' });
  await updateLibraryAssets(db, 'owner', { ...selection, operation: 'restore' });
  assert(rows[0].favorite); assert(!rows[0].hidden); equal(rows[0].storage_path, 'owner/file');
});

import type { serviceClient } from '../_shared/auth.ts';
export type LibraryOperation = 'favorite' | 'unfavorite' | 'hide' | 'restore';
const ID = /^[a-zA-Z0-9_-]{6,80}$/;
export function parseLibraryAction(body: Record<string, unknown>): { ids: string[]; operation: LibraryOperation } {
  if (!['favorite', 'unfavorite', 'hide', 'restore'].includes(String(body.operation))
    || !Array.isArray(body.ids) || !body.ids.length || body.ids.length > 100
    || body.ids.some(id => typeof id !== 'string' || !ID.test(id))) throw new Error('Invalid library selection');
  return { ids: [...new Set(body.ids as string[])], operation: body.operation as LibraryOperation };
}
export function libraryActionPatch(operation: LibraryOperation): { favorite?: boolean; hidden?: boolean } {
  return operation === 'favorite' || operation === 'unfavorite'
    ? { favorite: operation === 'favorite' } : { hidden: operation === 'hide' };
}

export async function updateLibraryAssets(db: ReturnType<typeof serviceClient>, wallet: string, selection: ReturnType<typeof parseLibraryAction>) {
  const { data, error } = await db.from('creator_assets').update(libraryActionPatch(selection.operation))
    .eq('wallet_address', wallet).eq('ready', true).in('id', selection.ids).select('id');
  if (error) throw error;
  const completedIds = (data ?? []).map(row => row.id as string);
  return { completedIds, incompleteIds: selection.ids.filter(id => !completedIds.includes(id)) };
}

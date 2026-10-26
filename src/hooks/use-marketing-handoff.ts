import { useMemo } from 'react';
import { accountDraftKey, useStoredDraftState } from './use-draft-state';
import type { GenerationDraft } from '@/lib/editor/generationDraft';
import { generationDraft } from '@/lib/editor/generationDraft';

interface MarketingHandoff { id: string; owner: string | null; draft: GenerationDraft }

/** Preserve the active campaign workspace pointer across reloads for its owner only. */
export function useMarketingHandoff(owner: string | null) {
  const key = accountDraftKey(owner, 'creator:active-campaign:v1') ?? 'guest|creator:active-campaign:v1';
  const [saved, setSaved] = useStoredDraftState<unknown>(key, null);
  const active = useMemo<MarketingHandoff | null>(() => {
    if (!saved || typeof saved !== 'object') return null;
    const value = saved as Partial<MarketingHandoff>;
    if (typeof value.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(value.id)) return null;
    if (value.owner !== owner) return null;
    const draft = generationDraft(value.draft);
    return draft && (draft.kind === 'image' || draft.kind === 'video') ? { id: value.id, owner, draft } : null;
  }, [saved, owner]);
  const prepare = (draft: GenerationDraft) => setSaved({ id: `campaign-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, owner, draft });
  const leave = () => { setSaved(null); setSaved.clear(); };
  return { active, prepare, leave };
}

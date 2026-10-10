import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/contexts/AuthContext', async () => {
  const { createContext } = await import('react');
  return { AuthContext: createContext({ walletAddress: 'alice' }) };
});
import { useDraftConversation } from '../use-draft-conversation';
import { useDraftState } from '../use-draft-state';
import { __resetDraftCacheForTests } from '@/lib/draft-cache';

function useComposer() {
  const session = useDraftConversation();
  const [text, setText] = useDraftState(`assistant:${session.draft}:input`, '');
  return { ...session, text, setText };
}
beforeEach(() => { localStorage.clear(); __resetDraftCacheForTests(); });

it('keeps typing while the first request receives its conversation id, including after reload', () => {
  const first = renderHook(useComposer);
  act(() => first.result.current.setText('  first\n'));
  const draft = first.result.current.draft;
  act(() => first.result.current.assign('server-one'));
  expect(first.result.current.draft).toBe(draft);
  act(() => first.result.current.setText('next unfinished question'));
  first.unmount(); __resetDraftCacheForTests();
  const restored = renderHook(useComposer);
  expect(restored.result.current.id).toBe('server-one');
  expect(restored.result.current.text).toBe('next unfinished question');
});

it('keeps a late first-request response attached to its original draft', () => {
  const field = renderHook(useComposer);
  act(() => field.result.current.setText('first question'));
  const assignFirst = field.result.current.assign;
  act(() => field.result.current.start());
  act(() => field.result.current.setText('second question'));
  act(() => assignFirst('server-one'));
  expect(field.result.current.id).toBeNull();
  expect(field.result.current.text).toBe('second question');
  act(() => field.result.current.select('server-one'));
  expect(field.result.current.text).toBe('first question');
});

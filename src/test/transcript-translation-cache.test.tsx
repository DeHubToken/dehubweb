import type { PropsWithChildren } from 'react';
import { cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { useTranscriptTranslation } from '@/hooks/use-transcript';

const from = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from } }));
afterEach(cleanup);

it('reads a cached regional translation using the server language tag', () => {
  const client = new QueryClient();
  const translation = { status: 'ready', segments: [{ start: 0, end: 2, text: '你好' }], summary: null, chapters: [], error: null };
  client.setQueryData(['transcript-translation', 'transcript', 'zh-tw'], translation);
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useTranscriptTranslation('transcript', 'zh-TW', true), { wrapper });
  expect(result.current.translation).toEqual(translation);
  expect(from).not.toHaveBeenCalled();
});

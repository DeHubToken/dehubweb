import { useCallback, useRef, useState } from 'react';
import { useEngagementWeight } from '@/hooks/use-engagement-weight';
import type { PostReaction } from '@/lib/reactions';
import type { SelfReaction } from '@/components/app/live/LiveReactionFlow';

export function useLiveReaction(streamId: string | undefined, enabled: boolean) {
  const [selfReaction, setSelfReaction] = useState<SelfReaction | null>(null);
  const nonce = useRef(0);
  const weight = useEngagementWeight();
  const sendLiveReaction = useCallback((reaction: PostReaction) => {
    if (!enabled) return;
    setSelfReaction({ type: reaction, weight, nonce: ++nonce.current });
    if (!streamId) return;
    void import('@/lib/api/dehub/stream-presence').then(({ sendStreamReaction }) => {
      sendStreamReaction(streamId, reaction);
    }).catch(() => undefined);
  }, [streamId, enabled, weight]);
  return { selfReaction, sendLiveReaction };
}

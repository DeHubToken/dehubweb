import { useEffect, useState, type RefObject } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { getNFTInfo } from '@/lib/api/dehub';

export type VideoProcessingStatus = 'pending' | 'on' | 'done' | 'failed';
const POLL_MS = 5_000;
const processingKey = (tokenId: number | string) => ['video-processing', String(tokenId)] as const;
const isPending = (status: VideoProcessingStatus | undefined) => status === 'pending' || status === 'on';

export function markVideoProcessing(client: QueryClient, tokenId: number | string) {
  client.setQueryData(processingKey(tokenId), 'pending');
}

/** Follow only visible, unfinished videos. A shared key keeps duplicate cards
 * on the same status without refreshing the feed or moving its scroll position. */
export function useVideoProcessingStatus(
  tokenId: number | string,
  initialStatus: VideoProcessingStatus | undefined,
  enabled: boolean,
  element?: RefObject<HTMLElement>,
) {
  const client = useQueryClient();
  const [visible, setVisible] = useState(!element);
  const [foreground, setForeground] = useState(document.visibilityState === 'visible');
  const canFollow = isPending(initialStatus) || initialStatus === 'failed';
  useEffect(() => {
    const change = () => setForeground(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, []);
  useEffect(() => {
    if (!element || !enabled || !canFollow) return;
    const node = element.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(node);
    return () => observer.disconnect();
  }, [element, enabled, canFollow]);

  const key = processingKey(tokenId);
  const cached = client.getQueryData<VideoProcessingStatus>(key);
  const active = enabled && visible && foreground && canFollow && isPending(cached ?? initialStatus);
  const query = useQuery<VideoProcessingStatus>({
    queryKey: key,
    queryFn: async () => {
      const post = await getNFTInfo(String(tokenId));
      const status = post.transcodingStatus;
      if (!status || !['pending', 'on', 'done', 'failed'].includes(status)) throw new Error('Missing video processing status');
      return status;
    },
    enabled: active,
    staleTime: POLL_MS,
    refetchInterval: q => active && isPending(q.state.data ?? initialStatus) ? POLL_MS : false,
    refetchIntervalInBackground: false,
    retry: false,
  });
  return canFollow ? query.data ?? initialStatus : initialStatus;
}

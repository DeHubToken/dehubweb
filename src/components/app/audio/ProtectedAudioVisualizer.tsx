import { useQuery } from '@tanstack/react-query';
import type { ComponentProps } from 'react';
import { apiCall } from '@/lib/api/dehub';
import { AudioVisualizer } from './AudioVisualizer';
import { useTranslation } from 'react-i18next';

export function ProtectedAudioVisualizer({ requiresAccess, tokenId, viewerKey, ...props }:
  ComponentProps<typeof AudioVisualizer> & { requiresAccess: boolean; tokenId: string; viewerKey?: string | null }) {
  const { t } = useTranslation();
  const access = useQuery({
    queryKey: ['audio-access', tokenId, viewerKey || 'anonymous'],
    queryFn: () => apiCall<{ url: string }>(`/api/nfts/audio/${encodeURIComponent(tokenId)}/access`, { requiresAuth: true }),
    enabled: requiresAccess,
    staleTime: 10 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    gcTime: 24 * 60 * 60 * 1000,
  });
  if (requiresAccess && !access.data?.url) {
    return <div className="w-full h-full flex items-center justify-center" role="status">
      {access.isError && <button type="button" aria-label={t('common.retry')} onClick={(event) => {
        event.stopPropagation(); void access.refetch();
      }}>↻</button>}
    </div>;
  }
  const audioUrl = requiresAccess ? access.data!.url : props.audioUrl;
  return <AudioVisualizer {...props} audioUrl={audioUrl}
    popoutTrack={props.popoutTrack ? { ...props.popoutTrack, audioUrl } : undefined} />;
}

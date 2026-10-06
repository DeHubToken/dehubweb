import { useMediaQuery } from '@/hooks/use-media-query';

/**
 * Phone widths (under 640px), where the dedicated post page uses the "Stage"
 * layout: floating media chrome, one five-tile action bar, comments straight
 * under it, a docked composer and a mini player. Tablets and desktop keep the
 * page they had. Same breakpoint as the phone block at the end of index.css.
 */
export const POST_STAGE_PHONE_QUERY = '(max-width: 639px)';

export function usePostStagePhone(): boolean {
  return useMediaQuery(POST_STAGE_PHONE_QUERY);
}

import { useState } from 'react';
import ExternalLink from "@/components/ui/cut-icons/open-externally";

import { getLinkPreviewFavicon, type LinkPreviewData } from '@/lib/api/link-preview';
import { PredictionDetails } from './PredictionDetails';

/** Shared media and fallback layouts for outside links in posts and chats. */
export function LinkPreviewContent({ preview, chat = false, composer = false }: { preview: LinkPreviewData; chat?: boolean; composer?: boolean }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [loadedFavicon, setLoadedFavicon] = useState<string | null>(null);
  const [failedFavicon, setFailedFavicon] = useState<string | null>(null);
  const showImage = !!preview.image && preview.image !== failedImage;
  const favicon = getLinkPreviewFavicon(preview.url);
  const sourceTile = !showImage && !!favicon && loadedFavicon === favicon && failedFavicon !== favicon;
  let domain = preview.url;
  try { domain = new URL(preview.url).hostname.replace(/^www\./, ''); } catch { /* retain the link label */ }
  const hasTitle = !!preview.title && preview.title !== domain;

  return <div className={composer && showImage ? 'flex' : undefined} data-link-preview-layout={showImage ? 'image' : sourceTile ? 'source-tile' : 'compact'}>
    {showImage && <div className={composer ? 'relative w-32 h-24 shrink-0 bg-white/5 overflow-hidden' : 'relative w-full aspect-[1.91/1] bg-white/5 overflow-hidden'}>
      {chat && <img src={preview.image!} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-40" loading="lazy" />}
      <img
        src={preview.image!}
        alt={preview.title}
        className={`relative w-full h-full ${chat ? 'object-contain' : 'object-cover'}`}
        loading="lazy"
        onError={() => setFailedImage(preview.image)}
      />
    </div>}
    <div className={`relative min-w-0 flex flex-1 items-center gap-3 ${chat ? 'p-2.5' : 'px-3 pb-3 pt-3.5 sm:pt-4'}`}>
      {!showImage && favicon && failedFavicon !== favicon && <div
        aria-hidden="true"
        className={sourceTile
          ? 'flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]'
          : 'absolute h-8 w-8 opacity-0 pointer-events-none'}
      >
        <img
          key={favicon}
          src={favicon}
          alt=""
          className="h-8 w-8 object-contain"
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={() => setLoadedFavicon(favicon)}
          onError={() => setFailedFavicon(favicon)}
        />
      </div>}
      <div className="min-w-0 flex-1">
        <div className={`flex items-center gap-1.5 ${hasTitle ? `text-white/50 mb-1 ${chat ? 'text-[10px]' : 'text-xs'}` : 'text-sm font-medium text-white'}`}>
          <ExternalLink className="w-3 h-3 shrink-0" />
          <span className="truncate">{showImage ? preview.siteName || domain : domain}</span>
        </div>
        {hasTitle && <h4 className={`font-medium text-white mb-0.5 break-words ${chat ? 'text-xs' : 'text-sm'} ${preview.prediction ? '' : showImage ? 'line-clamp-1' : 'line-clamp-2'}`}>
          {preview.title}
        </h4>}
        {preview.description && <p className={`text-white/60 line-clamp-2 break-words ${chat ? 'text-[11px]' : 'text-xs'}`}>{preview.description}</p>}
        <PredictionDetails preview={preview} />
      </div>
    </div>
  </div>;
}

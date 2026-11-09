import { useEffect, useState } from 'react';

/**
 * The image or video attached to a governance proposal, if any. A file that
 * no longer loads (deleted with its account, moved) hides the whole frame
 * instead of leaving an empty box above the tally.
 */
export function ProposalMedia({
  url,
  type,
  alt,
  className = '',
}: {
  url: string | null | undefined;
  type: 'image' | 'video' | null | undefined;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || !type || failed) return null;
  return (
    <div
      className={`overflow-hidden rounded-xl border border-white/[0.08] bg-black/40 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {type === 'video' ? (
        <video src={url} onError={() => setFailed(true)} controls playsInline preload="metadata" className="block w-full max-h-[480px] object-contain" />
      ) : (
        <img src={url} alt={alt} onError={() => setFailed(true)} loading="lazy" decoding="async" className="block w-full max-h-[480px] object-contain" />
      )}
    </div>
  );
}

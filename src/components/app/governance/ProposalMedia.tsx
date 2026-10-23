/**
 * The image or video attached to a governance proposal, if any.
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
  if (!url || !type) return null;
  return (
    <div
      className={`overflow-hidden rounded-xl border border-white/[0.08] bg-black/40 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {type === 'video' ? (
        <video src={url} controls playsInline preload="metadata" className="block w-full max-h-[480px] object-contain" />
      ) : (
        <img src={url} alt={alt} loading="lazy" decoding="async" className="block w-full max-h-[480px] object-contain" />
      )}
    </div>
  );
}

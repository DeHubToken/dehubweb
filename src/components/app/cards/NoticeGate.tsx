import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const TONES = {
  amber: { icon: 'text-amber-300', pill: 'bg-amber-400/15 text-amber-300' },
  rose: { icon: 'text-rose-300', pill: 'bg-rose-400/15 text-rose-300' },
} as const;

interface NoticeGateProps {
  /** Image to blur behind the notice. A plain dark panel is used without one. */
  preview?: string;
  icon: ReactNode;
  /** Short label for the kind of notice, shown as a pill. */
  label: string;
  /** One line saying why the post is covered. */
  description: string;
  action: string;
  onReveal: () => void;
  tone?: keyof typeof TONES;
  className?: string;
}

/**
 * The cover shared by post notices (content warning, mature): blurred media,
 * what kind of notice it is, and one button. Nothing behind it is playable
 * until it is opened, so it carries no player chrome of its own.
 */
export function NoticeGate({ preview, icon, label, description, action, onReveal, tone = 'amber', className }: NoticeGateProps) {
  const colors = TONES[tone];
  return (
    <div data-media-full data-notice-gate className={cn('relative rounded-2xl overflow-hidden bg-zinc-900', className)}>
      {preview ? (
        <img
          src={preview}
          alt=""
          aria-hidden="true"
          className="w-full max-h-[600px] object-cover blur-2xl scale-110"
          loading="lazy"
        />
      ) : (
        <div aria-hidden="true" className="w-full h-full min-h-[14rem] bg-gradient-to-br from-zinc-800 via-zinc-900 to-black" />
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45 px-6 text-center">
        <div className="mb-1 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-black/40 backdrop-blur-[24px] backdrop-saturate-[180%]">
          <span className={cn('flex h-6 w-6 items-center justify-center', colors.icon)}>{icon}</span>
        </div>
        <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em]', colors.pill)}>{label}</span>
        <p className="max-w-xs text-sm font-medium text-white/85">{description}</p>
        <button
          type="button"
          data-no-navigate
          onClick={(e) => {
            // Cards navigate on click; opening the notice must not open the post.
            e.stopPropagation();
            onReveal();
          }}
          className="mt-1 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-white/85"
        >
          {action}
        </button>
      </div>
    </div>
  );
}

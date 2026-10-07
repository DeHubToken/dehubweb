import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Volume2, VolumeX } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MediaControlIcon } from './MediaControlIcon';
import { setDubMix, useDubMix } from '@/lib/dub-mix';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  muted: boolean;
  onToggleMute: (event: React.MouseEvent) => void;
  onUnmute: () => void;
}

export function DubVolumeControl({ open, onOpenChange, muted, onToggleMute, onUnmute }: Props) {
  const { t } = useTranslation();
  const mix = useDubMix();
  const touch = useRef({ x: 0, y: 0, held: false, moved: false, until: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHold = () => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => clearHold, []);
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button type="button" className="h-8 w-8 text-white flex items-center justify-center"
          onTouchStart={(event) => {
            event.stopPropagation();
            clearHold();
            const finger = event.touches[0];
            touch.current = { x: finger.clientX, y: finger.clientY, held: false, moved: false, until: Date.now() + 1500 };
            timer.current = setTimeout(() => { timer.current = null; touch.current.held = true; }, 220);
          }}
          onTouchMove={(event) => {
            const finger = event.touches[0];
            if (Math.hypot(finger.clientX - touch.current.x, finger.clientY - touch.current.y) > 6) {
              clearHold(); touch.current.moved = true;
            }
          }}
          onTouchEnd={(event) => {
            event.stopPropagation(); clearHold(); touch.current.until = Date.now() + 1000;
            if (touch.current.held && !touch.current.moved) onOpenChange(true);
          }}
          onTouchCancel={() => { clearHold(); touch.current.moved = true; }}
          onContextMenu={(event) => { if (Date.now() < touch.current.until) event.preventDefault(); }}
          onClick={(event) => {
            event.stopPropagation();
            if (Date.now() < touch.current.until) {
              event.preventDefault();
              if (!touch.current.held && !touch.current.moved) onToggleMute(event);
            }
          }} aria-label={t('videoPlayer.volume')}>
          <MediaControlIcon icon={muted ? VolumeX : Volume2} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom" sideOffset={6}
        className="w-60 rounded-xl border-white/15 bg-black/90 p-4 text-white backdrop-blur-xl"
        onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
        <div className="space-y-4">
          {(['voice', 'original'] as const).map((track) => {
            const label = t(track === 'voice' ? 'dub.dubbed' : 'dub.original');
            return (
              <label key={track} className="block space-y-2 text-xs font-medium">
                <span className="flex justify-between gap-4"><span>{label}</span><span className="tabular-nums">{Math.round(mix[track] * 100)}%</span></span>
                <input type="range" min={0} max={100} step={1} value={Math.round(mix[track] * 100)}
                  aria-label={label} className="block h-5 w-full cursor-pointer accent-white"
                  onChange={(event) => {
                    const level = Number(event.target.value) / 100;
                    setDubMix({ [track]: level });
                    if (level > 0) onUnmute();
                  }} />
              </label>
            );
          })}
          <button type="button" onClick={onToggleMute} className="flex items-center gap-2 text-xs text-white/80">
            <MediaControlIcon icon={muted ? VolumeX : Volume2} size={16} />
            {t(muted ? 'stages.unmute' : 'stages.mute')}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

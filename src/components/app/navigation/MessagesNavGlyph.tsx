import { useEffect, useId, useRef, useState } from 'react';
import type { LucideProps } from 'lucide-react';
import MessageEnvelope from '@/components/ui/cut-icons/message-envelope';
import './messages-nav-glyph.css';

/**
 * Bottom bar Messages icon. Unread messages show as a small red letter
 * peeking out of the envelope, not a red count chip. On each
 * wake-up (page load, coming back to the tab, a new message) the letter pops
 * out 3 times, then it holds still: one 3.9s CSS run, nothing loops.
 */
export function MessagesNavGlyph({ unread, className, ...props }: LucideProps & { unread: number }) {
  const clipId = `messages-letter-${useId().replace(/:/g, "")}`;
  const [run, setRun] = useState(0);
  const last = useRef(unread);
  useEffect(() => {
    if (unread > last.current) setRun(n => n + 1);
    last.current = unread;
  }, [unread]);
  useEffect(() => {
    const wake = () => { if (!document.hidden) setRun(n => n + 1); };
    document.addEventListener('visibilitychange', wake);
    return () => document.removeEventListener('visibilitychange', wake);
  }, []);
  return (
    <span className="messages-nav-glyph" data-unread={unread > 0}>
      {unread > 0 && (
        <svg key={run} className="messages-nav-glyph__letter" viewBox="0 0 32 32" aria-hidden="true">
          <clipPath id={clipId}><rect x="-4" y="-14" width="40" height="19.2" /></clipPath>
          <g clipPath={`url(#${clipId})`}>
            <g className="messages-nav-glyph__card">
              <rect x="9.2" y="1" width="13.6" height="12" rx="1.8" fill="var(--messages-letter)" />
              <rect x="11.4" y="3.2" width="9.2" height="1.3" rx=".65" fill="var(--messages-letter-line)" />
            </g>
          </g>
        </svg>
      )}
      <MessageEnvelope className={className} {...props} />
    </span>
  );
}

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { NoticeGate } from './NoticeGate';

/** The server's limit (dehub-stream-backend src/nft/content-warning). */
export const CONTENT_WARNING_MAX = 200;

/**
 * Whether a post opens collapsed behind its content warning, and the switch
 * that opens it. Per card and per session, like the mature gate: a warning
 * tells you what is coming, it does not lock anything.
 */
export function useContentWarning(spoilerText?: string) {
  const text = spoilerText?.trim() || '';
  const [revealed, setRevealed] = useState(false);
  const reveal = useCallback(() => setRevealed(true), []);
  return { text, hidden: !!text && !revealed, reveal };
}

/**
 * The warning in place of a post. Covers the body and the media together, the
 * way Mastodon does, so neither gives away what the warning is about. The
 * creator's own line stays behind the cover; the notice only says one exists.
 */
export function ContentWarningGate({ preview, onReveal, className }: { preview?: string; onReveal: () => void; className?: string }) {
  const { t } = useTranslation();
  return (
    <NoticeGate
      preview={preview}
      icon={<AlertTriangle className="h-6 w-6" aria-hidden="true" />}
      label={t('contentWarning.label')}
      description={t('contentWarning.notice', { defaultValue: 'The creator added a warning' })}
      action={t('contentWarning.view', { defaultValue: 'View post' })}
      onReveal={onReveal}
      className={className}
    />
  );
}

import { useEffect, useState } from 'react';
import { Check, Copy, Eye, EyeOff, Loader2, RefreshCw, Radio } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  SETTINGS_FIELD_CLASS,
  SETTINGS_INLINE_ACTION_CLASS,
  SETTINGS_LABEL_CLASS,
} from './SettingsRow';
import {
  getEncoderCredentials,
  rotateEncoderKey,
  setEncoderDefaultTitle,
  type EncoderCredentials,
} from '@/lib/api/dehub/livestream';

/**
 * "Stream key" — the permanent credentials for OBS, a capture app or a console.
 *
 * Everything else about going live is minted per broadcast: the path a stream
 * publishes to IS its playbackId, and its key is the credential for that one
 * path. A browser is handed both at the moment it needs them and shows them to
 * nobody. An encoder cannot work that way — it is configured once, by hand,
 * often with a controller on a TV — so a creator who has to re-key it before
 * every session ends up creating a live post purely to get a key out of it.
 *
 * The pair here never changes. Set the encoder up once, press its own Start
 * button, and the post is created when the broadcast actually arrives: bound
 * to one set up in the app in the last couple of hours if there is one, or
 * published on the spot under the title below.
 *
 * The key is the publish credential, so it is masked by default and rotatable.
 * Rotating leaves the server address alone — the answer to "somebody has my
 * key" is a new secret, not a new address to re-type as well — and never
 * touches a broadcast already running, which publishes with its own stream's
 * key rather than this one.
 */
export function StreamKeySettings() {
  const { t } = useTranslation();

  const [credentials, setCredentials] = useState<EncoderCredentials | null>(null);
  const [title, setTitle] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<'server' | 'key' | null>(null);
  const [rotating, setRotating] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);

  useEffect(() => {
    let alive = true;
    getEncoderCredentials()
      .then(next => {
        if (!alive) return;
        setCredentials(next);
        setTitle(next.defaultTitle);
      })
      .catch(() => alive && setCredentials(null));
    return () => {
      alive = false;
    };
  }, []);

  const copy = async (value: string, which: 'server' | 'key') => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error(t('settings.streamKey.copyFailed', 'Could not copy'));
    }
  };

  const rotate = async () => {
    // A permanent credential that cannot be revoked is a liability, and a
    // rotation silently breaks every encoder it was pasted into — so it is
    // confirmed rather than one click away from a misplaced tap.
    if (!window.confirm(t('settings.streamKey.rotateConfirm', 'Issue a new stream key? Every encoder using the old one will stop working until you paste the new key in.'))) {
      return;
    }
    setRotating(true);
    try {
      const next = await rotateEncoderKey();
      setCredentials(next);
      setRevealed(true);
      toast.success(t('settings.streamKey.rotated', 'New stream key issued'));
    } catch {
      toast.error(t('settings.streamKey.rotateFailed', 'Could not issue a new key'));
    } finally {
      setRotating(false);
    }
  };

  const saveTitle = async () => {
    if (!credentials || title === credentials.defaultTitle) return;
    setSavingTitle(true);
    try {
      const next = await setEncoderDefaultTitle(title);
      setCredentials(next);
      setTitle(next.defaultTitle);
      toast.success(t('settings.streamKey.titleSaved', 'Saved'));
    } catch {
      toast.error(t('settings.streamKey.titleFailed', 'Could not save the title'));
    } finally {
      setSavingTitle(false);
    }
  };

  if (credentials === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('common.loading', 'Loading…')}
      </div>
    );
  }

  if (!credentials.server || !credentials.streamKey) {
    return (
      <p className="text-sm text-zinc-400">
        {t(
          'settings.streamKey.unavailable',
          'Streaming from an encoder is not available on your account right now.',
        )}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 text-sm text-zinc-400">
        <Radio className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {t(
            'settings.streamKey.blurb',
            'Paste these into OBS, your capture app or your console once. They never change — press Start in your encoder and DeHub creates the live post for you.',
          )}
        </span>
      </p>

      <div>
        <label className={SETTINGS_LABEL_CLASS}>{t('settings.streamKey.server', 'Server')}</label>
        <div className="flex gap-2">
          <Input value={credentials.server} readOnly className={`${SETTINGS_FIELD_CLASS} font-mono text-xs`} />
          <Button
            variant="outline"
            className={SETTINGS_INLINE_ACTION_CLASS}
            onClick={() => copy(credentials.server, 'server')}
            aria-label={t('settings.streamKey.copyServer', 'Copy server')}
          >
            {copied === 'server' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div>
        <label className={SETTINGS_LABEL_CLASS}>{t('settings.streamKey.key', 'Stream key')}</label>
        <div className="flex gap-2">
          <Input
            value={credentials.streamKey}
            readOnly
            type={revealed ? 'text' : 'password'}
            className={`${SETTINGS_FIELD_CLASS} font-mono text-xs`}
          />
          <Button
            variant="outline"
            className={SETTINGS_INLINE_ACTION_CLASS}
            onClick={() => setRevealed(v => !v)}
            aria-label={
              revealed
                ? t('settings.streamKey.hide', 'Hide stream key')
                : t('settings.streamKey.reveal', 'Show stream key')
            }
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button
            variant="outline"
            className={SETTINGS_INLINE_ACTION_CLASS}
            onClick={() => copy(credentials.streamKey, 'key')}
            aria-label={t('settings.streamKey.copyKey', 'Copy stream key')}
          >
            {copied === 'key' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-zinc-500">
          {t(
            'settings.streamKey.keyWarning',
            'Anyone holding this key can broadcast as you. Never show it on stream.',
          )}
        </p>
      </div>

      <div>
        <label className={SETTINGS_LABEL_CLASS}>
          {t('settings.streamKey.defaultTitle', 'Default stream title')}
        </label>
        <div className="flex gap-2">
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={saveTitle}
            maxLength={120}
            placeholder={t('settings.streamKey.defaultTitlePlaceholder', 'What your encoder streams are called')}
            className={SETTINGS_FIELD_CLASS}
          />
          <Button
            variant="outline"
            className={SETTINGS_INLINE_ACTION_CLASS}
            onClick={saveTitle}
            disabled={savingTitle || title === credentials.defaultTitle}
          >
            {savingTitle ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.save', 'Save')}
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-zinc-500">
          {t(
            'settings.streamKey.defaultTitleHint',
            'Used when you go live from an encoder without setting a post up first.',
          )}
        </p>
      </div>

      <Button
        variant="outline"
        className={SETTINGS_INLINE_ACTION_CLASS}
        onClick={rotate}
        disabled={rotating}
      >
        {rotating ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="mr-2 h-4 w-4" />
        )}
        {t('settings.streamKey.rotate', 'Reset stream key')}
      </Button>
    </div>
  );
}

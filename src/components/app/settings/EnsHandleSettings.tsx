import { useEffect, useState } from 'react';
import { Check, Copy, Globe, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useAccount, useSignMessage } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SettingsRow } from './SettingsRow';
import {
  getMyEnsLink,
  linkEnsName,
  previewEnsName,
  requestEnsChallenge,
  suggestEnsName,
  unlinkEnsName,
  type EnsChallenge,
  type EnsLink,
  type EnsPreview,
} from '@/lib/api/dehub/ens';

/**
 * "ENS name" — prove you hold a `.eth` name and be reachable at
 * `dehub.io/<name>`.
 *
 * The username is never touched by anything here. This is an alias: linking
 * adds a URL and a line on the profile, unlinking removes them, and the
 * account is called the same thing throughout.
 *
 * **Why there is no "connect wallet" button.** The signature has to come from
 * the wallet the name points at, which is usually NOT the wallet you browse
 * DeHub with. Connecting a second wallet here is not an option: AuthProvider
 * watches wagmi and, on seeing an address that is not the session's, either
 * clears the session outright or silently disconnects the wallet again
 * (CASE B in that file). Either would be worse than the problem it solved.
 *
 * So there are two paths, and the split is deliberate:
 *
 *  - **Already connected with the right wallet** — one click, signed in place.
 *    This is the common case for someone browsing with the MetaMask that holds
 *    their name.
 *  - **Anything else** — copy the message, sign it wherever the name actually
 *    lives, paste the signature back. Clunkier, and the only thing that works
 *    for a hardware wallet, a multisig, or a name parked on a cold address.
 *    The audience for ENS names is comfortable signing a message; being locked
 *    out because the key is offline would be the real failure.
 */
export function EnsHandleSettings() {
  const { t } = useTranslation();
  const { address: connectedAddress } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [link, setLink] = useState<EnsLink | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [preview, setPreview] = useState<EnsPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<EnsChallenge | null>(null);
  const [signature, setSignature] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let alive = true;
    getMyEnsLink()
      .then(current => {
        if (!alive) return;
        setLink(current);
        // Only offer a suggestion when there is nothing to replace. Most people
        // have never set a reverse record, so this is usually null and the box
        // stays empty — it must work perfectly without one.
        if (!current) suggestEnsName().then(s => alive && s && setName(s)).catch(() => {});
      })
      .catch(() => alive && setLink(null));
    return () => {
      alive = false;
    };
  }, []);

  /** Resolve what was typed, and stop if it is not a name we can use. */
  const check = async () => {
    const typed = name.trim();
    if (!typed) return;
    setChecking(true);
    setPreviewError(null);
    setChallenge(null);
    setSignature('');
    try {
      const result = await previewEnsName(typed);
      setPreview(result);
      // The canonical form, not what was typed — so what the user then signs
      // for and what appears in their URL are visibly the same string.
      setName(result.name);
    } catch (e) {
      setPreview(null);
      setPreviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };

  const startChallenge = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      setChallenge(await requestEnsChallenge(preview.name));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (sig: string) => {
    if (!challenge || !sig.trim()) return;
    setBusy(true);
    try {
      const result = await linkEnsName({
        name: challenge.name,
        issuedAt: challenge.issuedAt,
        signature: sig.trim(),
      });
      setLink(result);
      setChallenge(null);
      setPreview(null);
      setSignature('');
      toast.success(t('settings.ensLinked', 'Linked — your profile is now at {{url}}', { url: result.url }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /** The fast path: the connected wallet already is the one the name points at. */
  const signHere = async () => {
    if (!challenge || !connectedAddress) return;
    setBusy(true);
    try {
      // The account is named explicitly rather than left to the connector's
      // idea of "current": this button only appears when the connected wallet
      // IS the name's address, and signing with anything else produces a
      // signature the server will reject with nothing to explain why.
      const sig = await signMessageAsync({ account: connectedAddress, message: challenge.message });
      await submit(sig);
    } catch (e) {
      // A user closing the wallet prompt is not an error worth a red toast.
      const message = e instanceof Error ? e.message : String(e);
      if (!/reject|denied|cancell?ed/i.test(message)) toast.error(message);
      setBusy(false);
    }
  };

  const copyMessage = async () => {
    if (!challenge) return;
    await navigator.clipboard.writeText(challenge.message);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const remove = async () => {
    setBusy(true);
    try {
      await unlinkEnsName();
      setLink(null);
      toast.success(t('settings.ensUnlinked', 'Removed — your username is unchanged'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const loading = link === undefined;
  const holderIsConnected =
    !!challenge && !!connectedAddress &&
    connectedAddress.toLowerCase() === challenge.ensAddress.toLowerCase();

  return (
    <div className="space-y-3">
      <SettingsRow
        icon={<Globe />}
        title={t('settings.ensHandle', 'ENS name')}
        description={
          link
            ? t('settings.ensLinkedDesc', 'You are also at dehub.io/{{name}}', { name: link.name })
            : t(
                'settings.ensHandleDesc',
                'Prove you hold a .eth name to also be reachable at dehub.io/yourname.eth. Your username does not change.',
              )
        }
        action={
          link ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 rounded-xl"
              onClick={remove}
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : t('settings.ensRemove', 'Remove')}
            </Button>
          ) : loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
          ) : null
        }
      />

      {!link && !loading && (
        <div className="space-y-3 pl-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              placeholder="yourname.eth"
              value={name}
              spellCheck={false}
              autoCapitalize="none"
              onChange={e => {
                setName(e.target.value);
                setPreview(null);
                setChallenge(null);
                setPreviewError(null);
              }}
              onKeyDown={e => e.key === 'Enter' && check()}
              className="w-full bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 sm:w-56"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={checking || !name.trim() || !!preview}
              className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 rounded-xl"
              onClick={check}
            >
              {checking ? <Loader2 className="w-3 h-3 animate-spin" /> : t('settings.ensCheck', 'Check')}
            </Button>
          </div>

          {previewError && <p className="text-sm text-red-400">{previewError}</p>}

          {preview && !challenge && (
            <div className="space-y-2">
              <p className="text-sm text-zinc-400">
                {t('settings.ensResolvesTo', '{{name}} points at {{address}}', {
                  name: preview.name,
                  address: `${preview.ensAddress.slice(0, 6)}…${preview.ensAddress.slice(-4)}`,
                })}
              </p>
              {preview.held ? (
                <p className="text-sm text-amber-400">
                  {t(
                    'settings.ensHeld',
                    'Another DeHub account already wears this name. If it has changed hands on-chain since, proving it now takes it back.',
                  )}
                </p>
              ) : null}
              <Button
                size="sm"
                disabled={busy}
                className="rounded-xl"
                onClick={startChallenge}
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : t('settings.ensContinue', 'Continue')}
              </Button>
            </div>
          )}

          {challenge && (
            <div className="space-y-3">
              <p className="text-sm text-zinc-400">
                {t(
                  'settings.ensSignWith',
                  'Sign this with the wallet {{address}} holds — not necessarily the one you are signed in with. It moves no funds.',
                  {
                    address: `${challenge.ensAddress.slice(0, 6)}…${challenge.ensAddress.slice(-4)}`,
                  },
                )}
              </p>

              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-zinc-900 p-3 text-xs leading-5 text-zinc-300">
                {challenge.message}
              </pre>

              <div className="flex flex-wrap items-center gap-2">
                {holderIsConnected && (
                  <Button size="sm" disabled={busy} className="rounded-xl" onClick={signHere}>
                    {busy ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      t('settings.ensSignHere', 'Sign with connected wallet')
                    )}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 rounded-xl"
                  onClick={copyMessage}
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span className="ml-1.5">{t('settings.ensCopy', 'Copy message')}</span>
                </Button>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  placeholder={t('settings.ensPasteSignature', 'Paste signature (0x…)')}
                  value={signature}
                  spellCheck={false}
                  onChange={e => setSignature(e.target.value)}
                  className="w-full bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 sm:w-72"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || !signature.trim()}
                  className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 rounded-xl"
                  onClick={() => submit(signature)}
                >
                  {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : t('settings.ensLink', 'Link')}
                </Button>
              </div>

              <p className="text-xs text-zinc-500">
                {t('settings.ensExpires', 'This expires in 15 minutes. Check the name again to get a fresh one.')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

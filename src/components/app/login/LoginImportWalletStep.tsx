import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { deriveFromSecret } from '@/lib/wallet-core/derive';

export function LoginImportWalletStep({ busy, onImport }: {
  busy: boolean;
  onImport: (privateKey: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const disabled = busy || submitting;
  return (
    <form className="space-y-4" onSubmit={async event => {
      event.preventDefault();
      setError('');
      let privateKey: string;
      try {
        privateKey = deriveFromSecret(secret).ethPrivateKey;
      } catch {
        setError(t('loginModal.invalidImportSecret', 'Enter a valid private key or seed phrase.'));
        return;
      }
      setSubmitting(true);
      try {
        await onImport(privateKey);
        setSecret('');
      } catch {
        setError(t('common.somethingWentWrong'));
      } finally { setSubmitting(false); }
    }}>
      <label htmlFor="wallet-import-secret" className="block text-sm text-white/70">
        {t('copy.0dce083ca6f1')}
      </label>
      <Textarea
        id="wallet-import-secret"
        value={secret}
        onChange={event => { setSecret(event.target.value); setError(''); }}
        placeholder={t('copy.0dce083ca6f1')}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        disabled={disabled}
        className="min-h-28 bg-white/10 border-white/10 text-white rounded-xl"
      />
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <Button type="submit" disabled={disabled || !secret.trim()} className="w-full h-12 rounded-xl">
        {disabled ? t('loginModal.signingIn', 'Signing you in…') : t('copy.a865110e919b')}
      </Button>
    </form>
  );
}

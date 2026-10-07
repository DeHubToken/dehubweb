import { useTranslation } from 'react-i18next';
import { AlertTriangle, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { copyThenClear } from '@/lib/wallet-core/clipboard';

export function PrivateKeyBackup({ privateKey, hasPhrase, onFinished }: {
  privateKey: string;
  hasPhrase: boolean;
  onFinished: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4" data-testid="private-key-backup">
      {!hasPhrase && <p className="text-white/60 text-sm">{t('walletBackup.noPhrase')}</p>}
      <p className="text-white font-medium text-sm">{t('walletBackup.tabPrivateKey')}</p>
      <div className="flex items-start gap-2 rounded-xl border border-red-400/40 bg-red-400/10 p-3 text-sm text-white">
        <AlertTriangle className="w-4 h-4 mt-0.5 text-red-400 shrink-0" />
        <p>{t('walletBackup.keyWarning')}</p>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white break-all select-all">{privateKey}</div>
      <Button
        variant="outline"
        onClick={async () => { await copyThenClear(privateKey); toast.success(t('common.copied', 'Copied')); }}
        className="w-full h-12 bg-transparent hover:bg-white/5 text-white rounded-xl border-white/10"
      >
        <Copy className="w-4 h-4 mr-2" /> {t('settings.exportPkCopy', 'Copy private key')}
      </Button>
      <Button onClick={onFinished} className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl">
        {t('common.done', 'Done')}
      </Button>
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import More from '@/components/ui/cut-icons/more';
import '@/styles/quiet-post-loading.css';

export function QuietPostLoading() {
  const { t } = useTranslation();
  return <div className="post-quiet-loader" role="status" aria-label={t('common.loading', { defaultValue: 'Loading…' })}>
    <More className="h-7 w-7" aria-hidden="true" />
  </div>;
}

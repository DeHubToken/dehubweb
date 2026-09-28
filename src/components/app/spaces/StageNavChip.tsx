import { Headphones } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStage } from '@/contexts/StageContext';

export function StageNavChip() {
  const { currentSpace, isConnected, isModalOpen, openModal } = useStage();
  const { t } = useTranslation();
  if (!currentSpace || !isConnected || isModalOpen) return null;

  return (
    <button
      type="button"
      onClick={() => openModal('live')}
      aria-label={`${t('stages.expandStage')}: ${currentSpace.title}`}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-r-2xl border-l border-current/10 text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      data-stage-nav-chip
    >
      <Headphones aria-hidden="true" className="h-5 w-5 motion-safe:animate-pulse" />
    </button>
  );
}

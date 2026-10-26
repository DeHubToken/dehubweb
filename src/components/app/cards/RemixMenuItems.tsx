import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Camera, Columns2, Music2, Scissors } from 'lucide-react';
import type { RemixMode } from '@/lib/editor/remixStudioHtml';

export interface RemixSource { videoUrl: string; sourceUrl: string; title: string; creator?: string }
const modes = [
  ['green-screen', 'Green screen', Camera], ['collab', 'Collab', Columns2],
  ['sound', 'Use this sound', Music2], ['cut', 'Cut this video', Scissors],
] as const;

export function RemixMenuItems({ source, onStart }: { source: RemixSource; onStart: () => void }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return <details className="rounded-xl border border-white/10">
    <summary className="cursor-pointer px-4 py-3 text-white">{t('videoRemix.menu', { defaultValue: 'Remix' })}</summary>
    {modes.map(([mode, label, Icon]) => <button key={mode} type="button"
      className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-white hover:bg-white/10"
      onClick={() => { onStart(); navigate('/creator/remix', { state: { ...source, mode: mode as RemixMode } }); }}>
      <Icon className="h-5 w-5" />{t(`videoRemix.${mode}`, { defaultValue: label })}
    </button>)}
  </details>;
}

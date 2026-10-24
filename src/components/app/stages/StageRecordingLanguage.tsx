import { useTranslation } from 'react-i18next';
import { Globe2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getStagePlaybackState, playStageRecording, resumeStageRecording, type StagePlayable } from '@/lib/stage-playback';
import { STAGE_RECORDING_LANGUAGES, setStageRecordingLanguage, useStageRecordingLanguage } from '@/lib/stage-recording-language';
import { primeSpeech } from '@/hooks/dub-preference';
import { cn } from '@/lib/utils';

export function StageRecordingLanguage({ space, className }: { space: StagePlayable; className?: string }) {
  const { t } = useTranslation();
  const selected = useStageRecordingLanguage(space.id);
  return <div className={cn('flex-1 min-w-0', className)} data-no-navigate onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
    <Select value={selected.language} onValueChange={(language) => {
      primeSpeech();
      setStageRecordingLanguage(space.id, language);
      if (getStagePlaybackState().spaceId !== space.id) playStageRecording(space);
      else if (!getStagePlaybackState().loading) resumeStageRecording();
    }}>
      <SelectTrigger aria-label={t('settings.language')} className="h-11 w-full gap-2 rounded-xl border-0 bg-white/10 text-white text-sm hover:bg-white/20">
        <Globe2 className="h-4 w-4 shrink-0" /><SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72 bg-black/90 backdrop-blur-xl text-white border-white/15">
        <SelectItem value="original">{t('dub.original')}</SelectItem>
        {STAGE_RECORDING_LANGUAGES.map(([code, name]) => <SelectItem key={code} value={code}>{name}</SelectItem>)}
      </SelectContent>
    </Select>
    {selected.language !== 'original' && <span role="status" className="block mt-1 text-[10px] text-white/60">{t(selected.status === 'ready' ? 'dub.dubbed' : selected.status === 'failed' ? 'dub.noVoice' : 'dub.preparing')}</span>}
  </div>;
}

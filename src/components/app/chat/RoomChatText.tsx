import { useRef } from 'react';
import { useTranslation as useCopy } from 'react-i18next';
import Languages from '@/components/ui/cut-icons/language';
import { renderTextWithLinks, useTranslation } from '../TranslatableText';

/** A message owns its translation choice; translating one never submits the room. */
export function RoomChatText({ text }: { text: string }) {
  const { t } = useCopy();
  const ref = useRef<HTMLParagraphElement>(null);
  const translation = useTranslation(text, 'chat', ref);
  return (
    <div>
      <p ref={ref} className="whitespace-pre-wrap text-xs text-zinc-300 break-words">
        {renderTextWithLinks(translation.isTranslated ? translation.translatedText : text)}
      </p>
      {!translation.isTooShort && (
        <button
          type="button"
          disabled={translation.isLoading}
          onClick={() => translation.isTranslated ? translation.handleShowOriginal() : void translation.handleTranslate()}
          className="mt-1 inline-flex items-center gap-1 text-[10px] text-zinc-400 hover:text-white disabled:opacity-50"
          aria-label={translation.isTranslated ? t('common.showOriginal') : t('common.translate')}
          aria-busy={translation.isLoading}
        >
          <Languages className="h-3 w-3" />
          {translation.isLoading ? t('common.translating') : translation.isTranslated ? t('common.showOriginal') : t('common.translate')}
        </button>
      )}
      {translation.error && <span role="status" className="ml-1 text-[10px] text-zinc-400">{translation.error}</span>}
    </div>
  );
}

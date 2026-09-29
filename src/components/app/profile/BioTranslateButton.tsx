/**
 * Bio Translate Button
 * ====================
 * Globe icon next to "Joined" date that translates a user's bio on demand.
 * Reuses the same translate-text edge function as post translations.
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw, Loader2, Languages } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserLanguage } from '@/hooks/use-user-language';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface BioTranslateButtonProps {
  bio: string;
  onTranslated: (translatedBio: string) => void;
  onShowOriginal: () => void;
  isTranslated: boolean;
}

const CACHE_PREFIX = 'bio-translate-';

export function BioTranslateButton({ bio, onTranslated, onShowOriginal, isTranslated }: BioTranslateButtonProps) {
  const { t } = useTranslation();
  const { language: userLang } = useUserLanguage();
  const [isLoading, setIsLoading] = useState(false);

  const handleTranslate = useCallback(async () => {
    // Whole bio, not the first 100 characters — two profiles that open the same
    // way shared one entry and got each other's translation.
    const cacheKey = `${CACHE_PREFIX}${btoa(unescape(encodeURIComponent(bio)))}-${userLang}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      onTranslated(cached);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('translate-text', {
        // A profile bio is public.
        body: { text: bio, targetLang: userLang, public: true },
      });

      if (error || !data?.translatedText) return;

      // If same language, skip
      if (data.translatedText === bio) return;

      sessionStorage.setItem(cacheKey, data.translatedText);
      onTranslated(data.translatedText);
    } catch {
      // silent fail
    } finally {
      setIsLoading(false);
    }
  }, [bio, userLang, onTranslated]);

  if (isLoading) {
    return <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />;
  }

  if (isTranslated) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onShowOriginal}
            aria-label={t('common.showOriginal')}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{t('common.showOriginal')}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleTranslate}
          aria-label={t('profile.translateBio')}
          className="text-zinc-500 hover:text-white transition-colors"
        >
          <Languages className="w-5 h-5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{t('profile.translateBio')}</TooltipContent>
    </Tooltip>
  );
}

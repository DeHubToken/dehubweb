/**
 * Bio Translate Button
 * ====================
 * Globe icon next to "Joined" date that translates a user's bio on demand.
 * Reuses the same translate-text edge function as post translations.
 */

import { useState, useCallback } from 'react';
import { RotateCcw, Loader2, Languages } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { dehubAuthHeaders } from '@/lib/ai-invoke';
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
        body: { text: bio, targetLang: userLang },
        // Cache and MyMemory stay public; the AI fallback needs a wallet to
        // bill abuse to, so send the token whenever there is one.
        headers: dehubAuthHeaders(),
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
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Show original</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleTranslate}
          className="text-zinc-500 hover:text-white transition-colors"
        >
          <Languages className="w-5 h-5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>Translate bio</TooltipContent>
    </Tooltip>
  );
}

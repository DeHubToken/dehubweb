/**
 * Image Translation Sheet Component
 * ==================================
 * Bottom sheet/drawer that displays OCR + translation results for images.
 * Shows loading state, extracted text, and translated text.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown, ChevronUp, Languages, FileText, Loader2, AlertCircle } from 'lucide-react';
import { LANGUAGE_NAMES } from '@/hooks/use-image-translation';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

interface ImageTranslationSheetProps {
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  error: string | null;
  result: {
    extractedText: string;
    translatedText: string;
    sourceLang: string;
    hasText: boolean;
  } | null;
}

export function ImageTranslationSheet({
  isOpen,
  onClose,
  isLoading,
  error,
  result,
}: ImageTranslationSheetProps) {
  const [showOriginal, setShowOriginal] = useState(false);

  const sourceLangName = result?.sourceLang 
    ? LANGUAGE_NAMES[result.sourceLang] || result.sourceLang.toUpperCase()
    : 'Unknown';

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent glass className="max-h-[70vh] overflow-hidden">
        <DrawerHeader className="border-b border-white/10 pb-3">
          <div className="flex items-center justify-between">
            <DrawerTitle className="text-white font-semibold flex items-center gap-2">
              <Languages className="w-5 h-5 text-blue-400" />
              Image Translation
            </DrawerTitle>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Loading State */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              <p className="text-zinc-400 text-sm">Extracting and translating text...</p>
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-400" />
              </div>
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}

          {/* No Text Found */}
          {result && !result.hasText && !isLoading && !error && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center">
                <FileText className="w-6 h-6 text-zinc-500" />
              </div>
              <p className="text-zinc-400 text-sm text-center">No text found in this image</p>
            </div>
          )}

          {/* Translation Result */}
          {result && result.hasText && !isLoading && !error && (
            <>
              {/* Source Language Badge */}
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 rounded-lg bg-zinc-800 text-white text-xs">
                  Translated from {sourceLangName}
                </span>
              </div>

              {/* Translated Text */}
              <div className="space-y-2">
                <div className="bg-zinc-800/50 rounded-xl p-4 border border-white/5">
                  <p className="text-white text-sm leading-relaxed whitespace-pre-wrap">
                    {result.translatedText}
                  </p>
                </div>
              </div>

              {/* Original Text (Collapsible) */}
              <div className="space-y-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowOriginal(!showOriginal);
                  }}
                  className="flex items-center gap-2 text-zinc-500 hover:text-zinc-400 transition-colors"
                >
                  <span className="text-xs font-medium uppercase tracking-wide">
                    Original Text
                  </span>
                  {showOriginal ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
                
                <AnimatePresence>
                  {showOriginal && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="bg-zinc-900 rounded-xl p-4 border border-white/5">
                        <p className="text-zinc-400 text-sm leading-relaxed whitespace-pre-wrap">
                          {result.extractedText}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

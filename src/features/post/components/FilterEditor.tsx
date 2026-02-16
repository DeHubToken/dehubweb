import { useState, useMemo, useEffect } from 'react';
import { X, ChevronDown, ChevronUp, RotateCcw, Check, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { FilterPresetCard } from './FilterPresetCard';
import { FilterSlider } from './FilterSlider';
import { generateFilterCSS, getDefaultSettings } from '@/lib/filters';
import { FILTER_PRESETS, DEFAULT_FILTER_SETTINGS } from '../types/filters';
import type { FilterSettings } from '../types/filters';

// Extract a single frame from video as thumbnail
const extractVideoFrame = (videoUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.src = videoUrl;
    video.currentTime = 0.1;
    video.onloadeddata = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 180;
        canvas.getContext('2d')?.drawImage(video, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      } catch {
        resolve(videoUrl); // Fallback to original URL
      }
    };
    video.onerror = () => resolve(videoUrl);
    // Timeout fallback
    setTimeout(() => resolve(videoUrl), 3000);
  });
};

interface FilterEditorProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  isVideo?: boolean;
  initialSettings?: FilterSettings;
  initialPresetId?: string;
  onApply: (settings: FilterSettings, presetId?: string) => void;
}

export function FilterEditor({
  isOpen,
  onClose,
  imageUrl,
  isVideo = false,
  initialSettings,
  initialPresetId,
  onApply,
}: FilterEditorProps) {
  const [settings, setSettings] = useState<FilterSettings>(
    initialSettings || getDefaultSettings()
  );
  const [selectedPresetId, setSelectedPresetId] = useState<string | undefined>(
    initialPresetId || 'normal'
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [videoThumbnail, setVideoThumbnail] = useState<string | null>(null);
  const [showVideoPreview, setShowVideoPreview] = useState(false);

  const filterCSS = useMemo(() => generateFilterCSS(settings), [settings]);

  // Extract video thumbnail on mount for video files
  useEffect(() => {
    if (isVideo && imageUrl && isOpen) {
      setVideoThumbnail(null);
      setShowVideoPreview(false);
      extractVideoFrame(imageUrl).then(setVideoThumbnail);
    }
  }, [isVideo, imageUrl, isOpen]);

  // Auto-play video when filter is selected
  const handlePresetSelectWithPreview = (presetId: string) => {
    handlePresetSelect(presetId);
    if (isVideo) setShowVideoPreview(true);
  };

  const handlePresetSelect = (presetId: string) => {
    const preset = FILTER_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setSettings({ ...preset.settings });
      setSelectedPresetId(presetId);
    }
  };

  const handleSliderChange = (key: keyof FilterSettings, value: number) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    // Clear preset selection when manually adjusting
    setSelectedPresetId(undefined);
  };

  const handleReset = () => {
    setSettings(getDefaultSettings());
    setSelectedPresetId('normal');
  };

  const handleApply = () => {
    onApply(settings, selectedPresetId);
    onClose();
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent hideHandle className="bg-zinc-950 border-zinc-800 max-h-[90vh] overflow-hidden flex flex-col">
        <DrawerTitle className="sr-only">Filter Editor</DrawerTitle>
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <button
            onClick={onClose}
            className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
          <span className="text-white font-semibold">Edit Filter</span>
          <button
            onClick={handleApply}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-xs font-medium transition-all duration-300 hover:scale-105
              bg-white/10 backdrop-blur-xl border border-white/20
              hover:bg-white/20 hover:border-white/40"
          >
            <Check className="w-4 h-4" />
            Apply
          </button>
        </div>

        {/* Preview - constrained to fit any image/video fully */}
        <div className="flex items-center justify-center p-4 bg-black/50 shrink-0">
          <div className="w-full max-w-[min(90vw,400px)] flex items-center justify-center">
            {isVideo ? (
              showVideoPreview ? (
                <video
                  src={imageUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="max-w-full max-h-[30vh] w-auto h-auto object-contain rounded-lg shadow-2xl"
                  style={{ filter: filterCSS }}
                />
              ) : (
                <div 
                  className="relative cursor-pointer group"
                  onClick={() => setShowVideoPreview(true)}
                >
                  <img
                    src={videoThumbnail || imageUrl}
                    alt="Video preview"
                    className="max-w-full max-h-[30vh] w-auto h-auto object-contain rounded-lg shadow-2xl"
                    style={{ filter: filterCSS }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors rounded-lg">
                    <div className="w-12 h-12 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform">
                      <Play className="w-6 h-6 text-white fill-white ml-0.5" />
                    </div>
                  </div>
                </div>
              )
            ) : (
              <img
                src={imageUrl}
                alt="Preview"
                className="max-w-full max-h-[30vh] w-auto h-auto object-contain rounded-lg shadow-2xl"
                style={{ filter: filterCSS }}
              />
            )}
          </div>
        </div>

        {/* Preset Carousel */}
        <div className="border-t border-zinc-800 py-3 shrink-0">
          <div className="w-full overflow-x-auto scrollbar-hide">
            <div className="flex gap-1 px-4 py-1">
              {FILTER_PRESETS.map((preset) => (
                <FilterPresetCard
                  key={preset.id}
                  preset={preset}
                  imageUrl={imageUrl}
                  thumbnailUrl={isVideo ? (videoThumbnail || undefined) : undefined}
                  isSelected={selectedPresetId === preset.id}
                  onClick={() => handlePresetSelectWithPreview(preset.id)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Advanced Adjustments */}
        <div className="border-t border-zinc-800 shrink-0">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
          >
            <span className="text-sm text-zinc-300 font-medium">
              Manual Adjustments
            </span>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReset();
                    }}
                    className="p-1.5 hover:bg-white/10 rounded transition-colors"
                  >
                    <RotateCcw className="w-4 h-4 text-zinc-400" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Reset all</TooltipContent>
              </Tooltip>
              {showAdvanced ? (
                <ChevronUp className="w-4 h-4 text-zinc-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              )}
            </div>
          </button>

          <AnimatePresence>
            {showAdvanced && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
                style={{ maxHeight: 'calc(35vh + env(safe-area-inset-bottom, 0px))' }}
              >
                <ScrollArea className="h-[35vh]">
                  <div className="px-4 pb-4 space-y-3">
                    <FilterSlider
                      label="Brightness"
                      value={settings.brightness}
                      min={0}
                      max={200}
                      defaultValue={DEFAULT_FILTER_SETTINGS.brightness}
                      onChange={(v) => handleSliderChange('brightness', v)}
                    />
                    <FilterSlider
                      label="Contrast"
                      value={settings.contrast}
                      min={0}
                      max={200}
                      defaultValue={DEFAULT_FILTER_SETTINGS.contrast}
                      onChange={(v) => handleSliderChange('contrast', v)}
                    />
                    <FilterSlider
                      label="Saturation"
                      value={settings.saturation}
                      min={0}
                      max={200}
                      defaultValue={DEFAULT_FILTER_SETTINGS.saturation}
                      onChange={(v) => handleSliderChange('saturation', v)}
                    />
                    <FilterSlider
                      label="Warmth"
                      value={settings.hueRotate}
                      min={-180}
                      max={180}
                      defaultValue={DEFAULT_FILTER_SETTINGS.hueRotate}
                      onChange={(v) => handleSliderChange('hueRotate', v)}
                      unit="°"
                    />
                    <FilterSlider
                      label="Fade"
                      value={settings.sepia}
                      min={0}
                      max={100}
                      defaultValue={DEFAULT_FILTER_SETTINGS.sepia}
                      onChange={(v) => handleSliderChange('sepia', v)}
                      unit="%"
                    />
                    <FilterSlider
                      label="Grayscale"
                      value={settings.grayscale}
                      min={0}
                      max={100}
                      defaultValue={DEFAULT_FILTER_SETTINGS.grayscale}
                      onChange={(v) => handleSliderChange('grayscale', v)}
                      unit="%"
                    />
                  </div>
                  {/* Safe area padding for mobile */}
                  <div style={{ height: 'calc(24px + env(safe-area-inset-bottom, 0px))' }} />
                </ScrollArea>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

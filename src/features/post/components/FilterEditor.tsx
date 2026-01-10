import { useState, useMemo } from 'react';
import { X, ChevronDown, ChevronUp, RotateCcw, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { FilterPresetCard } from './FilterPresetCard';
import { FilterSlider } from './FilterSlider';
import { generateFilterCSS, getDefaultSettings } from '@/lib/filters';
import { FILTER_PRESETS, DEFAULT_FILTER_SETTINGS } from '../types/filters';
import type { FilterSettings } from '../types/filters';

interface FilterEditorProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  initialSettings?: FilterSettings;
  initialPresetId?: string;
  onApply: (settings: FilterSettings, presetId?: string) => void;
}

export function FilterEditor({
  isOpen,
  onClose,
  imageUrl,
  initialSettings,
  initialPresetId,
  onApply,
}: FilterEditorProps) {
  const [settings, setSettings] = useState<FilterSettings>(
    initialSettings || getDefaultSettings()
  );
  const [selectedPresetId, setSelectedPresetId] = useState<string | undefined>(
    initialPresetId || 'none'
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  const filterCSS = useMemo(() => generateFilterCSS(settings), [settings]);

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
    setSelectedPresetId('none');
  };

  const handleApply = () => {
    onApply(settings, selectedPresetId);
    onClose();
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="bg-zinc-950 border-zinc-800 max-h-[90vh]">
        <DrawerTitle className="sr-only">Filter Editor</DrawerTitle>
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <button
            onClick={onClose}
            className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
          <span className="text-white font-semibold">Edit Filter</span>
          <button
            onClick={handleApply}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold rounded-full transition-colors"
          >
            <Check className="w-4 h-4" />
            Apply
          </button>
        </div>

        {/* Preview - larger on desktop/tablet */}
        <div className="flex-1 flex items-center justify-center p-4 sm:p-6 bg-black/50 min-h-[200px] sm:min-h-[300px] max-h-[50vh] sm:max-h-[60vh] overflow-hidden">
          <img
            src={imageUrl}
            alt="Preview"
            className="max-w-full max-h-full w-auto h-auto object-contain rounded-lg shadow-2xl"
            style={{ filter: filterCSS }}
          />
        </div>

        {/* Preset Carousel */}
        <div className="border-t border-zinc-800 py-3">
          <ScrollArea className="w-full">
            <div className="flex gap-1 px-4">
              {FILTER_PRESETS.map((preset) => (
                <FilterPresetCard
                  key={preset.id}
                  preset={preset}
                  imageUrl={imageUrl}
                  isSelected={selectedPresetId === preset.id}
                  onClick={() => handlePresetSelect(preset.id)}
                />
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>

        {/* Advanced Adjustments */}
        <div className="border-t border-zinc-800">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
          >
            <span className="text-sm text-zinc-300 font-medium">
              Manual Adjustments
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleReset();
                }}
                className="p-1.5 hover:bg-white/10 rounded transition-colors"
                title="Reset all"
              >
                <RotateCcw className="w-4 h-4 text-zinc-400" />
              </button>
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
              >
                <div className="px-4 pb-4 space-y-4 max-h-[30vh] overflow-y-auto scrollbar-hide">
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

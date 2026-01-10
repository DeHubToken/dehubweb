import { useState, useRef, useEffect, useMemo } from 'react';
import { X, RotateCw, FlipHorizontal, FlipVertical, Check, Crop } from 'lucide-react';
import { motion } from 'framer-motion';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import type { CropSettings } from '../types/filters';

export type AspectRatioOption = '1:1' | '4:5' | '16:9' | 'free';

interface CropRotateEditorProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  initialSettings?: CropSettings;
  onApply: (settings: CropSettings) => void;
}

const ASPECT_RATIOS: { id: AspectRatioOption; label: string; ratio: number | null }[] = [
  { id: 'free', label: 'Free', ratio: null },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
];

export const DEFAULT_CROP_SETTINGS: CropSettings = {
  rotation: 0,
  flipX: false,
  flipY: false,
  aspectRatio: 'free',
};

export function CropRotateEditor({
  isOpen,
  onClose,
  imageUrl,
  initialSettings,
  onApply,
}: CropRotateEditorProps) {
  const [settings, setSettings] = useState<CropSettings>(
    initialSettings || { ...DEFAULT_CROP_SETTINGS }
  );
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset settings when opening with new initial settings
  useEffect(() => {
    if (isOpen) {
      setSettings(initialSettings || { ...DEFAULT_CROP_SETTINGS });
    }
  }, [isOpen, initialSettings]);

  // Load image dimensions
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const handleRotate = () => {
    setSettings(prev => ({
      ...prev,
      rotation: (prev.rotation + 90) % 360,
    }));
  };

  const handleFlipX = () => {
    setSettings(prev => ({
      ...prev,
      flipX: !prev.flipX,
    }));
  };

  const handleFlipY = () => {
    setSettings(prev => ({
      ...prev,
      flipY: !prev.flipY,
    }));
  };

  const handleAspectRatioChange = (ratio: AspectRatioOption) => {
    setSettings(prev => ({
      ...prev,
      aspectRatio: ratio,
    }));
  };

  const handleReset = () => {
    setSettings({ ...DEFAULT_CROP_SETTINGS });
  };

  const handleApply = () => {
    onApply(settings);
    onClose();
  };

  // Calculate transform style for preview
  const transformStyle = useMemo(() => {
    const transforms: string[] = [];
    
    if (settings.rotation !== 0) {
      transforms.push(`rotate(${settings.rotation}deg)`);
    }
    if (settings.flipX) {
      transforms.push('scaleX(-1)');
    }
    if (settings.flipY) {
      transforms.push('scaleY(-1)');
    }
    
    return transforms.length > 0 ? transforms.join(' ') : undefined;
  }, [settings]);

  // Calculate container aspect ratio based on selection
  const containerStyle = useMemo(() => {
    const selectedRatio = ASPECT_RATIOS.find(r => r.id === settings.aspectRatio);
    
    if (!selectedRatio?.ratio || imageSize.width === 0) {
      return {};
    }
    
    // If rotated 90 or 270 degrees, swap the aspect ratio
    const isRotated90 = settings.rotation === 90 || settings.rotation === 270;
    const effectiveRatio = isRotated90 ? 1 / selectedRatio.ratio : selectedRatio.ratio;
    
    return {
      aspectRatio: effectiveRatio,
    };
  }, [settings.aspectRatio, settings.rotation, imageSize]);

  const hasChanges = settings.rotation !== 0 || settings.flipX || settings.flipY || settings.aspectRatio !== 'free';

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="bg-zinc-950 border-zinc-800 max-h-[90vh]">
        <DrawerTitle className="sr-only">Crop & Rotate</DrawerTitle>
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <button
            onClick={onClose}
            className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
          <span className="text-white font-semibold">Crop & Rotate</span>
          <button
            onClick={handleApply}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-xs font-medium transition-all duration-300 hover:scale-105
              bg-gradient-to-br from-white/20 via-white/10 to-white/5
              backdrop-blur-xl border border-white/20
              shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.2)]
              hover:shadow-[0_8px_32px_rgba(255,255,255,0.1),inset_0_1px_0_rgba(255,255,255,0.3)]
              hover:border-white/40"
          >
            <Check className="w-4 h-4" />
            Apply
          </button>
        </div>

        {/* Preview - constrained to fit any image fully */}
        <div 
          ref={containerRef}
          className="flex items-center justify-center p-4 sm:p-8 bg-black/50"
        >
          <div className="w-full max-w-[min(90vw,500px)] max-h-[min(50vh,400px)] sm:max-h-[min(55vh,500px)] flex items-center justify-center">
            <div
              className="relative max-w-full max-h-full overflow-hidden rounded-lg shadow-2xl"
              style={containerStyle}
            >
              <img
                src={imageUrl}
                alt="Preview"
                className="max-w-full max-h-[min(50vh,400px)] sm:max-h-[min(55vh,500px)] w-auto h-auto object-contain transition-transform duration-200"
                style={{ transform: transformStyle }}
              />
              {/* Crop overlay grid */}
              {settings.aspectRatio !== 'free' && (
                <div className="absolute inset-0 pointer-events-none border-2 border-cyan-500/50 rounded-lg">
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
                    {[...Array(9)].map((_, i) => (
                      <div key={i} className="border border-white/20" />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Aspect Ratio Options */}
        <div className="border-t border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2 mb-3">
            <Crop className="w-4 h-4 text-zinc-400" />
            <span className="text-sm text-zinc-400 font-medium">Aspect Ratio</span>
          </div>
          <div className="flex gap-2">
            {ASPECT_RATIOS.map((ratio) => (
              <button
                key={ratio.id}
                onClick={() => handleAspectRatioChange(ratio.id)}
                className={cn(
                  "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all",
                  settings.aspectRatio === ratio.id
                    ? "bg-gradient-to-r from-cyan-500 to-purple-500 text-white"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                )}
              >
                {ratio.label}
              </button>
            ))}
          </div>
        </div>

        {/* Transform Controls */}
        <div className="border-t border-zinc-800 px-4 py-3">
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={handleRotate}
              className={cn(
                "flex flex-col items-center gap-1 p-3 rounded-xl transition-all",
                settings.rotation !== 0
                  ? "bg-cyan-500/20 text-cyan-400"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              )}
            >
              <RotateCw className="w-6 h-6" />
              <span className="text-xs font-medium">{settings.rotation}°</span>
            </button>
            
            <button
              onClick={handleFlipX}
              className={cn(
                "flex flex-col items-center gap-1 p-3 rounded-xl transition-all",
                settings.flipX
                  ? "bg-cyan-500/20 text-cyan-400"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              )}
            >
              <FlipHorizontal className="w-6 h-6" />
              <span className="text-xs font-medium">Flip H</span>
            </button>
            
            <button
              onClick={handleFlipY}
              className={cn(
                "flex flex-col items-center gap-1 p-3 rounded-xl transition-all",
                settings.flipY
                  ? "bg-cyan-500/20 text-cyan-400"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              )}
            >
              <FlipVertical className="w-6 h-6" />
              <span className="text-xs font-medium">Flip V</span>
            </button>
          </div>
          
          {/* Reset button */}
          {hasChanges && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={handleReset}
              className="w-full mt-3 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Reset All
            </motion.button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

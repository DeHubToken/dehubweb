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

  // Calculate crop overlay based on image vs selected aspect ratio
  const cropOverlay = useMemo(() => {
    const selectedRatio = ASPECT_RATIOS.find(r => r.id === settings.aspectRatio);
    
    if (!selectedRatio?.ratio || imageSize.width === 0 || imageSize.height === 0) {
      return null; // Free mode = no overlay
    }
    
    const imageRatio = imageSize.width / imageSize.height;
    
    // Account for rotation swapping dimensions
    const isRotated90 = settings.rotation === 90 || settings.rotation === 270;
    const effectiveTargetRatio = isRotated90 ? 1 / selectedRatio.ratio : selectedRatio.ratio;
    
    if (Math.abs(imageRatio - effectiveTargetRatio) < 0.01) {
      return null; // Ratios match, no crop needed
    }
    
    if (imageRatio > effectiveTargetRatio) {
      // Image is wider than target - crop sides
      const visibleWidth = (effectiveTargetRatio / imageRatio) * 100;
      const sideWidth = (100 - visibleWidth) / 2;
      return { type: 'horizontal' as const, sideWidth };
    } else {
      // Image is taller than target - crop top/bottom
      const visibleHeight = (imageRatio / effectiveTargetRatio) * 100;
      const topBottom = (100 - visibleHeight) / 2;
      return { type: 'vertical' as const, topBottom };
    }
  }, [settings.aspectRatio, settings.rotation, imageSize]);

  const hasChanges = settings.rotation !== 0 || settings.flipX || settings.flipY || settings.aspectRatio !== 'free';

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="bg-zinc-950 border-zinc-800 max-h-[90vh] overflow-hidden flex flex-col">
        <DrawerTitle className="sr-only">Crop & Rotate</DrawerTitle>
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
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
              bg-white/10 backdrop-blur-xl border border-white/20
              hover:bg-white/20 hover:border-white/40"
          >
            <Check className="w-4 h-4" />
            Apply
          </button>
        </div>

        {/* Preview - FIXED height container with crop overlay */}
        <div 
          ref={containerRef}
          className="flex items-center justify-center p-4 bg-black/50 shrink-0"
        >
          <div className="relative w-full max-w-[min(90vw,400px)] h-[35vh] flex items-center justify-center overflow-hidden rounded-lg">
            {/* Image - fills container naturally */}
            <img
              src={imageUrl}
              alt="Preview"
              className="max-w-full max-h-full w-auto h-auto object-contain transition-transform duration-200"
              style={{ transform: transformStyle }}
            />
            
            {/* Crop overlay masks - show what will be cropped */}
            {cropOverlay && (
              <>
                {cropOverlay.type === 'horizontal' ? (
                  <>
                    {/* Left crop mask */}
                    <div 
                      className="absolute top-0 bottom-0 left-0 bg-black/60 pointer-events-none"
                      style={{ width: `${cropOverlay.sideWidth}%` }}
                    />
                    {/* Right crop mask */}
                    <div 
                      className="absolute top-0 bottom-0 right-0 bg-black/60 pointer-events-none"
                      style={{ width: `${cropOverlay.sideWidth}%` }}
                    />
                  </>
                ) : (
                  <>
                    {/* Top crop mask */}
                    <div 
                      className="absolute top-0 left-0 right-0 bg-black/60 pointer-events-none"
                      style={{ height: `${cropOverlay.topBottom}%` }}
                    />
                    {/* Bottom crop mask */}
                    <div 
                      className="absolute bottom-0 left-0 right-0 bg-black/60 pointer-events-none"
                      style={{ height: `${cropOverlay.topBottom}%` }}
                    />
                  </>
                )}
                
                {/* Rule of thirds grid - positioned over visible area only */}
                <div 
                  className="absolute pointer-events-none border-2 border-white/50"
                  style={
                    cropOverlay.type === 'horizontal'
                      ? { 
                          left: `${cropOverlay.sideWidth}%`, 
                          right: `${cropOverlay.sideWidth}%`,
                          top: 0,
                          bottom: 0
                        }
                      : {
                          top: `${cropOverlay.topBottom}%`,
                          bottom: `${cropOverlay.topBottom}%`,
                          left: 0,
                          right: 0
                        }
                  }
                >
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
                    {[...Array(9)].map((_, i) => (
                      <div key={i} className="border border-white/20" />
                    ))}
                  </div>
                </div>
              </>
            )}
            
            {/* Free mode - just show the grid over entire image */}
            {!cropOverlay && settings.aspectRatio === 'free' && (
              <div className="absolute inset-0 pointer-events-none">
                {/* No grid for free mode */}
              </div>
            )}
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
                    ? "bg-white/20 text-white border border-white/40"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-transparent"
                )}
              >
                {ratio.label}
              </button>
            ))}
          </div>
        </div>

        {/* Transform Controls */}
        <div className="border-t border-zinc-800 px-4 py-3 pb-6">
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={handleRotate}
              className={cn(
                "flex flex-col items-center gap-1 p-3 rounded-xl transition-all border",
                settings.rotation !== 0
                  ? "bg-white/20 text-white border-white/40"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border-transparent"
              )}
            >
              <RotateCw className="w-6 h-6" />
              <span className="text-xs font-medium">{settings.rotation}°</span>
            </button>
            
            <button
              onClick={handleFlipX}
              className={cn(
                "flex flex-col items-center gap-1 p-3 rounded-xl transition-all border",
                settings.flipX
                  ? "bg-white/20 text-white border-white/40"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border-transparent"
              )}
            >
              <FlipHorizontal className="w-6 h-6" />
              <span className="text-xs font-medium">Flip H</span>
            </button>
            
            <button
              onClick={handleFlipY}
              className={cn(
                "flex flex-col items-center gap-1 p-3 rounded-xl transition-all border",
                settings.flipY
                  ? "bg-white/20 text-white border-white/40"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border-transparent"
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

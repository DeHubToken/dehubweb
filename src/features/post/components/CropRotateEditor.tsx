import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { X, RotateCw, FlipHorizontal, FlipVertical, Check, Crop, ZoomIn, ZoomOut, ArrowUpDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import type { CropSettings, CropBox } from '../types/filters';

export type AspectRatioOption = '1:1' | '4:5' | '16:9';

type DragHandle = 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'move' | null;
type InteractionMode = 'crop' | 'pan';

interface CropRotateEditorProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  initialSettings?: CropSettings;
  onApply: (settings: CropSettings) => void;
}

const ASPECT_RATIOS: { id: AspectRatioOption; label: string; ratio: number }[] = [
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
];

const DEFAULT_CROP_BOX: CropBox = {
  x: 0,
  y: 0,
  width: 100,
  height: 100,
};

const MIN_CROP_SIZE = 15; // Minimum 15% width/height
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.25;

export const DEFAULT_CROP_SETTINGS: CropSettings = {
  rotation: 0,
  flipX: false,
  flipY: false,
  aspectRatio: '1:1',
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
  const [cropBox, setCropBox] = useState<CropBox>(
    initialSettings?.cropBox || { ...DEFAULT_CROP_BOX }
  );
  const [dragging, setDragging] = useState<DragHandle>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, cropBox: { ...DEFAULT_CROP_BOX } });
  
  // Zoom and pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, panX: 0, panY: 0 });
  const [pinchDistance, setPinchDistance] = useState<number | null>(null);
  const [pinchZoomStart, setPinchZoomStart] = useState(1);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Reset settings when opening with new initial settings
  useEffect(() => {
    if (isOpen) {
      setSettings(initialSettings || { ...DEFAULT_CROP_SETTINGS });
      setCropBox(initialSettings?.cropBox || { ...DEFAULT_CROP_BOX });
      setZoom(1);
      setPan({ x: 0, y: 0 });
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

  // Calculate distance between two touch points
  const getTouchDistance = useCallback((touches: React.TouchList | TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  // Handle pinch zoom start
  const handlePinchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const distance = getTouchDistance(e.touches);
      setPinchDistance(distance);
      setPinchZoomStart(zoom);
    }
  }, [zoom, getTouchDistance]);

  // Handle pinch zoom move
  const handlePinchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2 && pinchDistance !== null) {
      e.preventDefault();
      const currentDistance = getTouchDistance(e.touches);
      const scale = currentDistance / pinchDistance;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchZoomStart * scale));
      setZoom(newZoom);
      
      // Constrain pan when zooming out
      if (newZoom <= 1) {
        setPan({ x: 0, y: 0 });
      }
    }
  }, [pinchDistance, pinchZoomStart, getTouchDistance]);

  // Handle pinch end
  const handlePinchEnd = useCallback(() => {
    setPinchDistance(null);
  }, []);

  // Handle pan start (for panning the zoomed image)
  const handlePanStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (zoom <= 1) return; // Only pan when zoomed in
    if (dragging) return; // Don't pan while cropping
    
    // Check if it's a single touch (not pinch)
    if ('touches' in e && e.touches.length !== 1) return;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    setIsPanning(true);
    setPanStart({ x: clientX, y: clientY, panX: pan.x, panY: pan.y });
  }, [zoom, pan, dragging]);

  // Handle pan move
  const handlePanMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isPanning) return;
    
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : e.clientX;
    const clientY = 'touches' in e ? e.touches[0]?.clientY ?? 0 : e.clientY;
    
    const deltaX = clientX - panStart.x;
    const deltaY = clientY - panStart.y;
    
    // Calculate max pan based on zoom level
    const maxPan = ((zoom - 1) / zoom) * 50; // percentage of container
    
    setPan({
      x: Math.max(-maxPan, Math.min(maxPan, panStart.panX + (deltaX / (imageContainerRef.current?.offsetWidth || 1)) * 100)),
      y: Math.max(-maxPan, Math.min(maxPan, panStart.panY + (deltaY / (imageContainerRef.current?.offsetHeight || 1)) * 100)),
    });
  }, [isPanning, panStart, zoom]);

  // Handle pan end
  const handlePanEnd = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(MAX_ZOOM, prev + ZOOM_STEP));
  }, []);

  const handleZoomOut = useCallback(() => {
    const newZoom = Math.max(MIN_ZOOM, zoom - ZOOM_STEP);
    setZoom(newZoom);
    if (newZoom <= 1) {
      setPan({ x: 0, y: 0 });
    }
  }, [zoom]);

  // Add pinch and pan event listeners
  useEffect(() => {
    const container = imageContainerRef.current;
    if (!container) return;

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        handlePinchMove(e);
      } else if (isPanning) {
        handlePanMove(e);
      }
    };

    const handleTouchEnd = () => {
      handlePinchEnd();
      handlePanEnd();
    };

    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('mousemove', handlePanMove);
    window.addEventListener('mouseup', handlePanEnd);

    return () => {
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('mousemove', handlePanMove);
      window.removeEventListener('mouseup', handlePanEnd);
    };
  }, [handlePinchMove, handlePinchEnd, handlePanMove, handlePanEnd, isPanning]);

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
    // Reset crop box when switching aspect ratios
    setCropBox({ ...DEFAULT_CROP_BOX });
  };

  const handleReset = () => {
    setSettings({ ...DEFAULT_CROP_SETTINGS });
    setCropBox({ ...DEFAULT_CROP_BOX });
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleApply = () => {
    const finalSettings: CropSettings = {
      ...settings,
    };
    onApply(finalSettings);
    onClose();
  };

  // Get pointer position relative to image container as percentage
  const getPointerPosition = useCallback((e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if (!imageContainerRef.current) return { x: 0, y: 0 };
    
    const rect = imageContainerRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0]?.clientY ?? 0 : (e as MouseEvent).clientY;
    
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  }, []);

  // Handle drag start
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent, handle: DragHandle) => {
    e.preventDefault();
    e.stopPropagation();
    
    const pos = getPointerPosition(e);
    setDragging(handle);
    setDragStart({ x: pos.x, y: pos.y, cropBox: { ...cropBox } });
  }, [cropBox, getPointerPosition]);

  // Handle drag move
  const handleDragMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!dragging) return;
    
    const pos = getPointerPosition(e);
    const deltaX = pos.x - dragStart.x;
    const deltaY = pos.y - dragStart.y;
    const { cropBox: startBox } = dragStart;
    
    let newBox = { ...startBox };
    
    switch (dragging) {
      case 'move':
        newBox.x = Math.max(0, Math.min(100 - startBox.width, startBox.x + deltaX));
        newBox.y = Math.max(0, Math.min(100 - startBox.height, startBox.y + deltaY));
        break;
      case 'left':
        const newLeft = Math.max(0, Math.min(startBox.x + startBox.width - MIN_CROP_SIZE, startBox.x + deltaX));
        newBox.width = startBox.width + (startBox.x - newLeft);
        newBox.x = newLeft;
        break;
      case 'right':
        newBox.width = Math.max(MIN_CROP_SIZE, Math.min(100 - startBox.x, startBox.width + deltaX));
        break;
      case 'top':
        const newTop = Math.max(0, Math.min(startBox.y + startBox.height - MIN_CROP_SIZE, startBox.y + deltaY));
        newBox.height = startBox.height + (startBox.y - newTop);
        newBox.y = newTop;
        break;
      case 'bottom':
        newBox.height = Math.max(MIN_CROP_SIZE, Math.min(100 - startBox.y, startBox.height + deltaY));
        break;
      case 'top-left':
        const tlLeft = Math.max(0, Math.min(startBox.x + startBox.width - MIN_CROP_SIZE, startBox.x + deltaX));
        const tlTop = Math.max(0, Math.min(startBox.y + startBox.height - MIN_CROP_SIZE, startBox.y + deltaY));
        newBox.width = startBox.width + (startBox.x - tlLeft);
        newBox.height = startBox.height + (startBox.y - tlTop);
        newBox.x = tlLeft;
        newBox.y = tlTop;
        break;
      case 'top-right':
        const trTop = Math.max(0, Math.min(startBox.y + startBox.height - MIN_CROP_SIZE, startBox.y + deltaY));
        newBox.width = Math.max(MIN_CROP_SIZE, Math.min(100 - startBox.x, startBox.width + deltaX));
        newBox.height = startBox.height + (startBox.y - trTop);
        newBox.y = trTop;
        break;
      case 'bottom-left':
        const blLeft = Math.max(0, Math.min(startBox.x + startBox.width - MIN_CROP_SIZE, startBox.x + deltaX));
        newBox.width = startBox.width + (startBox.x - blLeft);
        newBox.height = Math.max(MIN_CROP_SIZE, Math.min(100 - startBox.y, startBox.height + deltaY));
        newBox.x = blLeft;
        break;
      case 'bottom-right':
        newBox.width = Math.max(MIN_CROP_SIZE, Math.min(100 - startBox.x, startBox.width + deltaX));
        newBox.height = Math.max(MIN_CROP_SIZE, Math.min(100 - startBox.y, startBox.height + deltaY));
        break;
    }
    
    setCropBox(newBox);
  }, [dragging, dragStart, getPointerPosition]);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDragging(null);
  }, []);

  // Add/remove global event listeners for dragging
  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchmove', handleDragMove);
      window.addEventListener('touchend', handleDragEnd);
      
      return () => {
        window.removeEventListener('mousemove', handleDragMove);
        window.removeEventListener('mouseup', handleDragEnd);
        window.removeEventListener('touchmove', handleDragMove);
        window.removeEventListener('touchend', handleDragEnd);
      };
    }
  }, [dragging, handleDragMove, handleDragEnd]);

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

  const hasZoomPanChanges = zoom !== 1 || pan.x !== 0 || pan.y !== 0;
  const hasChanges = settings.rotation !== 0 || settings.flipX || settings.flipY || settings.aspectRatio !== '1:1' || hasZoomPanChanges;

  // Get cursor style based on handle
  const getCursorStyle = (handle: DragHandle): string => {
    switch (handle) {
      case 'top':
      case 'bottom':
        return 'cursor-ns-resize';
      case 'left':
      case 'right':
        return 'cursor-ew-resize';
      case 'top-left':
      case 'bottom-right':
        return 'cursor-nwse-resize';
      case 'top-right':
      case 'bottom-left':
        return 'cursor-nesw-resize';
      case 'move':
        return 'cursor-move';
      default:
        return '';
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent hideHandle className="bg-zinc-950 border-zinc-800 max-h-[90vh] overflow-hidden flex flex-col">
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

        {/* Preview - Container sized to match selected aspect ratio */}
        <div 
          ref={containerRef}
          className="flex flex-col items-center justify-center p-4 bg-black/50 shrink-0 gap-3"
        >
          <div 
            ref={imageContainerRef}
            className={cn(
              "relative flex items-center justify-center overflow-hidden rounded-lg",
              dragging && getCursorStyle(dragging),
              isPanning && "cursor-grabbing",
              zoom > 1 && !isPanning && !dragging && "cursor-grab"
            )}
            style={{
              // Size container based on selected aspect ratio
              ...(settings.aspectRatio === '1:1' 
                ? { width: 'min(90vw, 280px)', height: 'min(90vw, 280px)' }
                : settings.aspectRatio === '4:5'
                  ? { width: 'min(75vw, 240px)', height: 'min(93.75vw, 300px)' }
                  : { width: 'min(90vw, 320px)', height: 'min(50.625vw, 180px)' } // 16:9
              ),
            }}
            onTouchStart={handlePinchStart}
            onMouseDown={(e) => {
              // Only start panning if clicking on empty area (not on crop handles)
              if (zoom > 1 && !dragging) {
                handlePanStart(e);
              }
            }}
          >
            {/* Image - fills container, cropped to aspect ratio */}
            <img
              src={imageUrl}
              alt="Preview"
              className="w-full h-full object-cover transition-transform duration-200 select-none"
              style={{ 
                transform: [
                  `scale(${zoom})`,
                  `translate(${pan.x}%, ${pan.y}%)`,
                  transformStyle
                ].filter(Boolean).join(' ')
              }}
              draggable={false}
            />
            
            {/* Rule of thirds grid overlay */}
            <div className="absolute inset-0 pointer-events-none border-2 border-white/50">
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
                {[...Array(9)].map((_, i) => (
                  <div key={i} className="border border-white/20" />
                ))}
              </div>
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
                    ? "bg-white/20 text-white border border-white/40"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-transparent"
                )}
              >
                {ratio.label}
              </button>
            ))}
          </div>
          
          {/* Zoom & Pan Sliders */}
          <div className="mt-4 space-y-4">
            {/* Zoom Slider */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-zinc-400 min-w-[60px]">
                <ZoomIn className="w-4 h-4" />
                <span className="text-xs font-medium">Zoom</span>
              </div>
              <Slider
                value={[zoom]}
                onValueChange={([value]) => {
                  setZoom(value);
                  if (value <= 1) {
                    setPan({ x: 0, y: 0 });
                  }
                }}
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.1}
                className="flex-1"
              />
              <span className="text-xs text-zinc-400 min-w-[3rem] text-right">
                {Math.round(zoom * 100)}%
              </span>
            </div>
            
            {/* Vertical Pan Slider */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-zinc-400 min-w-[60px]">
                <ArrowUpDown className="w-4 h-4" />
                <span className="text-xs font-medium">Pan</span>
              </div>
              <Slider
                value={[pan.y]}
                onValueChange={([value]) => {
                  if (zoom > 1) {
                    const maxPan = ((zoom - 1) / zoom) * 50;
                    setPan(prev => ({ ...prev, y: Math.max(-maxPan, Math.min(maxPan, value)) }));
                  }
                }}
                min={-50}
                max={50}
                step={1}
                disabled={zoom <= 1}
                className="flex-1"
              />
              <span className="text-xs text-zinc-400 min-w-[3rem] text-right">
                {pan.y > 0 ? '+' : ''}{Math.round(pan.y)}%
              </span>
            </div>
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
          
          {/* Reset button - always visible for consistent layout */}
          <button
            onClick={handleReset}
            disabled={!hasChanges}
            className={cn(
              "w-full mt-3 py-2 text-sm transition-colors",
              hasChanges 
                ? "text-zinc-400 hover:text-white cursor-pointer" 
                : "text-zinc-600 cursor-default"
            )}
          >
            Reset All
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

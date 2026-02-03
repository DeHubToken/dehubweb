/**
 * Story Overlay Editor
 * ====================
 * Manages draggable emoji and text overlays on the story preview.
 * Handles touch/mouse events for positioning and selection.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Smile, Type } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StoryOverlay, TextStyle } from './types';
import { StoryEmojiPicker } from './StoryEmojiPicker';
import { StoryTextInput } from './StoryTextInput';

interface StoryOverlayEditorProps {
  overlays: StoryOverlay[];
  onOverlaysChange: (overlays: StoryOverlay[]) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}

export function StoryOverlayEditor({ overlays, onOverlaysChange, containerRef }: StoryOverlayEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [editingOverlay, setEditingOverlay] = useState<StoryOverlay | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; overlayX: number; overlayY: number } | null>(null);

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const addEmoji = useCallback((emoji: string) => {
    const newOverlay: StoryOverlay = {
      id: generateId(),
      type: 'emoji',
      content: emoji,
      x: 50,
      y: 50,
      scale: 1,
      rotation: 0,
    };
    onOverlaysChange([...overlays, newOverlay]);
    setSelectedId(newOverlay.id);
  }, [overlays, onOverlaysChange]);

  const addText = useCallback((text: string, style: { color: string; backgroundColor?: string; textStyle: TextStyle }) => {
    const newOverlay: StoryOverlay = {
      id: generateId(),
      type: 'text',
      content: text,
      x: 50,
      y: 50,
      scale: 1,
      rotation: 0,
      style,
    };
    onOverlaysChange([...overlays, newOverlay]);
    setSelectedId(newOverlay.id);
  }, [overlays, onOverlaysChange]);

  const updateOverlay = useCallback((id: string, updates: Partial<StoryOverlay>) => {
    onOverlaysChange(overlays.map((o) => (o.id === id ? { ...o, ...updates } : o)));
  }, [overlays, onOverlaysChange]);

  const deleteOverlay = useCallback((id: string) => {
    onOverlaysChange(overlays.filter((o) => o.id !== id));
    setSelectedId(null);
  }, [overlays, onOverlaysChange]);

  const handleOverlayTap = (overlay: StoryOverlay, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    if (selectedId === overlay.id && overlay.type === 'text') {
      // Double-tap to edit text
      setEditingOverlay(overlay);
      setShowTextInput(true);
    } else {
      setSelectedId(overlay.id);
    }
  };

  const handleEditText = (text: string, style: { color: string; backgroundColor?: string; textStyle: TextStyle }) => {
    if (editingOverlay) {
      updateOverlay(editingOverlay.id, { content: text, style });
      setEditingOverlay(null);
    } else {
      addText(text, style);
    }
  };

  const handleDragStart = (overlay: StoryOverlay, clientX: number, clientY: number) => {
    if (!containerRef.current) return;
    
    setSelectedId(overlay.id);
    setIsDragging(true);
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      overlayX: overlay.x,
      overlayY: overlay.y,
    };
  };

  const handleDragMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging || !dragStartRef.current || !containerRef.current || !selectedId) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    
    const deltaX = clientX - dragStartRef.current.x;
    const deltaY = clientY - dragStartRef.current.y;
    
    const deltaXPercent = (deltaX / rect.width) * 100;
    const deltaYPercent = (deltaY / rect.height) * 100;
    
    const newX = Math.max(5, Math.min(95, dragStartRef.current.overlayX + deltaXPercent));
    const newY = Math.max(5, Math.min(95, dragStartRef.current.overlayY + deltaYPercent));
    
    updateOverlay(selectedId, { x: newX, y: newY });
  }, [isDragging, selectedId, containerRef, updateOverlay]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  // Mouse event handlers
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      handleDragMove(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
      handleDragEnd();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Touch event handlers
  useEffect(() => {
    if (!isDragging) return;

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const handleTouchEnd = () => {
      handleDragEnd();
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  const handleBackgroundTap = () => {
    setSelectedId(null);
  };

  const getTextStyle = (overlay: StoryOverlay): React.CSSProperties => {
    if (!overlay.style) return {};
    
    const baseStyle: React.CSSProperties = {
      color: overlay.style.textStyle === 'background' 
        ? (overlay.style.color === '#FFFFFF' ? '#000000' : '#FFFFFF')
        : overlay.style.color,
    };

    switch (overlay.style.textStyle) {
      case 'bold':
        return { ...baseStyle, fontWeight: 700 };
      case 'outlined':
        return {
          ...baseStyle,
          WebkitTextStroke: `1px ${overlay.style.color}`,
          color: 'transparent',
          fontWeight: 700,
        };
      case 'background':
        return {
          ...baseStyle,
          backgroundColor: overlay.style.color,
          padding: '4px 12px',
          borderRadius: '8px',
        };
      default:
        return baseStyle;
    }
  };

  return (
    <>
      {/* Toolbar */}
      <div className="absolute top-20 right-4 z-20 flex flex-col gap-2">
        <button
          onClick={() => setShowEmojiPicker(true)}
          className="w-12 h-12 rounded-xl bg-black/40 backdrop-blur-[24px] border border-white/20 flex items-center justify-center hover:bg-black/60 transition-all"
        >
          <Smile className="w-6 h-6 text-white" />
        </button>
        <button
          onClick={() => {
            setEditingOverlay(null);
            setShowTextInput(true);
          }}
          className="w-12 h-12 rounded-xl bg-black/40 backdrop-blur-[24px] border border-white/20 flex items-center justify-center hover:bg-black/60 transition-all"
        >
          <Type className="w-6 h-6 text-white" />
        </button>
      </div>

      {/* Overlay layer - pointer-events-none so it doesn't block other controls */}
      <div 
        className="absolute inset-0 z-10 pointer-events-none"
      >
        {overlays.map((overlay) => (
          <div
            key={overlay.id}
            className={cn(
              'absolute cursor-move select-none touch-none pointer-events-auto',
              selectedId === overlay.id && 'ring-2 ring-white ring-offset-2 ring-offset-transparent rounded-lg'
            )}
            style={{
              left: `${overlay.x}%`,
              top: `${overlay.y}%`,
              transform: `translate(-50%, -50%) scale(${overlay.scale}) rotate(${overlay.rotation}deg)`,
            }}
            onClick={(e) => handleOverlayTap(overlay, e)}
            onMouseDown={(e) => {
              e.preventDefault();
              handleDragStart(overlay, e.clientX, e.clientY);
            }}
            onTouchStart={(e) => {
              if (e.touches.length === 1) {
                handleDragStart(overlay, e.touches[0].clientX, e.touches[0].clientY);
              }
            }}
          >
            {overlay.type === 'emoji' ? (
              <span className="text-5xl">{overlay.content}</span>
            ) : (
              <span 
                className="text-xl whitespace-pre-wrap max-w-[80vw] text-center"
                style={getTextStyle(overlay)}
              >
                {overlay.content}
              </span>
            )}

            {/* Delete button */}
            {selectedId === overlay.id && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteOverlay(overlay.id);
                }}
                className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center shadow-lg"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Emoji picker */}
      <StoryEmojiPicker
        isOpen={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
        onEmojiSelect={addEmoji}
      />

      {/* Text input */}
      <StoryTextInput
        isOpen={showTextInput}
        onClose={() => {
          setShowTextInput(false);
          setEditingOverlay(null);
        }}
        onTextSubmit={handleEditText}
        initialText={editingOverlay?.content}
        initialStyle={editingOverlay?.style}
      />
    </>
  );
}

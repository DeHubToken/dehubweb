/**
 * Story Text Input
 * ================
 * Text overlay input with styling options.
 * Supports different text styles and colors.
 */

import { useState, useRef, useEffect } from 'react';
import { X, Check, Bold, Type } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TextStyle, TEXT_COLORS } from './types';

interface StoryTextInputProps {
  isOpen: boolean;
  onClose: () => void;
  onTextSubmit: (text: string, style: { color: string; backgroundColor?: string; textStyle: TextStyle }) => void;
  initialText?: string;
  initialStyle?: { color: string; backgroundColor?: string; textStyle: TextStyle };
}

const TEXT_STYLE_OPTIONS: { value: TextStyle; icon: React.ReactNode; label: string }[] = [
  { value: 'normal', icon: <Type className="w-4 h-4" />, label: 'Normal' },
  { value: 'bold', icon: <Bold className="w-4 h-4" />, label: 'Bold' },
  { value: 'outlined', icon: <Type className="w-4 h-4" strokeWidth={3} />, label: 'Outlined' },
  { value: 'background', icon: <div className="w-4 h-3 bg-current rounded-sm" />, label: 'Background' },
];

export function StoryTextInput({ 
  isOpen, 
  onClose, 
  onTextSubmit, 
  initialText = '', 
  initialStyle 
}: StoryTextInputProps) {
  const [text, setText] = useState(initialText);
  const [textColor, setTextColor] = useState(initialStyle?.color || '#FFFFFF');
  const [textStyle, setTextStyle] = useState<TextStyle>(initialStyle?.textStyle || 'normal');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setText(initialText);
      setTextColor(initialStyle?.color || '#FFFFFF');
      setTextStyle(initialStyle?.textStyle || 'normal');
    }
  }, [isOpen, initialText, initialStyle]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (text.trim()) {
      onTextSubmit(text.trim(), {
        color: textColor,
        backgroundColor: textStyle === 'background' ? textColor : undefined,
        textStyle,
      });
    }
    onClose();
  };

  const getPreviewStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      color: textStyle === 'background' ? (textColor === '#FFFFFF' ? '#000000' : '#FFFFFF') : textColor,
    };

    switch (textStyle) {
      case 'bold':
        return { ...baseStyle, fontWeight: 700 };
      case 'outlined':
        return {
          ...baseStyle,
          WebkitTextStroke: `1px ${textColor}`,
          color: 'transparent',
          fontWeight: 700,
        };
      case 'background':
        return {
          ...baseStyle,
          backgroundColor: textColor,
          padding: '4px 12px',
          borderRadius: '8px',
        };
      default:
        return baseStyle;
    }
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-black/90 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
        >
          <X className="w-5 h-5 text-white" />
        </button>
        <span className="text-white font-medium">Add Text</span>
        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center disabled:opacity-50"
        >
          <Check className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Text input area */}
      <div className="flex-1 flex items-center justify-center p-8">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type something..."
          className="w-full bg-transparent text-center text-2xl resize-none border-none outline-none placeholder:text-zinc-500"
          style={getPreviewStyle()}
          rows={3}
        />
      </div>

      {/* Style options */}
      <div className="p-4 space-y-4 bg-black/60">
        {/* Text style buttons */}
        <div className="flex items-center justify-center gap-3">
          {TEXT_STYLE_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setTextStyle(option.value)}
              className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center transition-all',
                textStyle === option.value
                  ? 'bg-white text-black'
                  : 'bg-white/10 text-white hover:bg-white/20'
              )}
            >
              {option.icon}
            </button>
          ))}
        </div>

        {/* Color picker */}
        <div className="flex items-center justify-center gap-2 overflow-x-auto py-2">
          {TEXT_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => setTextColor(color)}
              className={cn(
                'w-8 h-8 rounded-full flex-shrink-0 transition-transform',
                textColor === color && 'ring-2 ring-white ring-offset-2 ring-offset-black scale-110'
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

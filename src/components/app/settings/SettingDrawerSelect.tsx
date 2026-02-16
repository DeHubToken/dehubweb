import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';

interface Option {
  value: string;
  label: string;
  description?: string;
}

interface SettingDrawerSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: Option[];
  title: string;
  disabled?: boolean;
  className?: string;
}

export function SettingDrawerSelect({
  value,
  onValueChange,
  options,
  title,
  disabled = false,
  className = '',
}: SettingDrawerSelectProps) {
  const [open, setOpen] = useState(false);
  
  const selectedOption = options.find(opt => opt.value === value);
  const displayLabel = selectedOption?.label || 'Select...';

  const handleSelect = (optionValue: string) => {
    onValueChange(optionValue);
    setOpen(false);
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild disabled={disabled}>
        <button
          className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm min-w-[120px] hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
          disabled={disabled}
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronDown className="w-4 h-4 text-zinc-400 flex-shrink-0" />
        </button>
      </DrawerTrigger>
      <DrawerContent className="bg-black/60 backdrop-blur-[24px] saturate-[180%] border-t border-white/10">
        <DrawerHeader className="border-b border-white/10 pb-4">
          <DrawerTitle className="text-white text-lg font-semibold">{title}</DrawerTitle>
        </DrawerHeader>
        <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto scrollbar-hide">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => handleSelect(option.value)}
              className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-colors text-left ${
                value === option.value
                  ? 'bg-white/10 border border-white/20'
                  : 'bg-white/5 border border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium">{option.label}</p>
                {option.description && (
                  <p className="text-zinc-400 text-sm mt-0.5">{option.description}</p>
                )}
              </div>
              {value === option.value && (
                <Check className="w-5 h-5 text-white flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

import { useState, useMemo } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
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
  searchable?: boolean;
}

export function SettingDrawerSelect({
  value,
  onValueChange,
  options,
  title,
  disabled = false,
  className = '',
  searchable = false,
}: SettingDrawerSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  
  const selectedOption = options.find(opt => opt.value === value);
  const displayLabel = selectedOption?.label || 'Select...';

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(
      o => o.label.toLowerCase().includes(q) || o.description?.toLowerCase().includes(q)
    );
  }, [options, search]);

  const handleSelect = (optionValue: string) => {
    onValueChange(optionValue);
    setOpen(false);
    setSearch('');
  };

  return (
    <Drawer open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(''); }}>
      <DrawerTrigger asChild disabled={disabled}>
        <button
          className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm min-w-[120px] hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
          disabled={disabled}
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronDown className="w-4 h-4 text-zinc-400 flex-shrink-0" />
        </button>
      </DrawerTrigger>
      <DrawerContent className="bg-black/60 backdrop-blur-[24px] saturate-[180%] border-t border-white/10" hideHandle={searchable}>
        {searchable ? (
          <div className="px-4 pt-4 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={title}
                autoFocus
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:border-white/20"
              />
            </div>
          </div>
        ) : (
          <div className="px-4 pt-4 pb-2">
            <h3 className="text-white text-lg font-semibold">{title}</h3>
          </div>
        )}
        <div className="p-4 pt-2 space-y-2 max-h-[60vh] overflow-y-auto scrollbar-hide">
          {filteredOptions.map((option) => (
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
          {searchable && filteredOptions.length === 0 && (
            <p className="text-zinc-500 text-sm text-center py-4">No languages found</p>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

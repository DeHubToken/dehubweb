import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Clock, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isBefore, startOfToday } from 'date-fns';

interface ScheduleSheetProps {
  isOpen: boolean;
  onClose: () => void;
  scheduledDate: Date | null;
  onSchedule: (date: Date | null) => void;
}

// Convert 24h to 12h format
const to12Hour = (hour24: number): { hour12: number; period: 'AM' | 'PM' } => {
  const period: 'AM' | 'PM' = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return { hour12, period };
};

// Convert 12h to 24h format
const to24Hour = (hour12: number, period: 'AM' | 'PM') => {
  if (period === 'AM') {
    return hour12 === 12 ? 0 : hour12;
  }
  return hour12 === 12 ? 12 : hour12 + 12;
};

// iOS-style wheel column component
interface WheelColumnProps {
  items: (string | number)[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  itemHeight?: number;
  visibleItems?: number;
}

function WheelColumn({ items, selectedIndex, onSelect, itemHeight = 40, visibleItems = 5 }: WheelColumnProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const centerOffset = Math.floor(visibleItems / 2);
  const containerHeight = itemHeight * visibleItems;

  // Scroll to selected item on mount and when selection changes
  useEffect(() => {
    if (containerRef.current && !isScrolling) {
      containerRef.current.scrollTop = selectedIndex * itemHeight;
    }
  }, [selectedIndex, itemHeight, isScrolling]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    
    setIsScrolling(true);
    
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = setTimeout(() => {
      if (!containerRef.current) return;
      
      const scrollTop = containerRef.current.scrollTop;
      const newIndex = Math.round(scrollTop / itemHeight);
      const clampedIndex = Math.max(0, Math.min(newIndex, items.length - 1));
      
      // Snap to nearest item
      containerRef.current.scrollTo({
        top: clampedIndex * itemHeight,
        behavior: 'smooth'
      });
      
      if (clampedIndex !== selectedIndex) {
        onSelect(clampedIndex);
      }
      
      setIsScrolling(false);
    }, 100);
  }, [itemHeight, items.length, selectedIndex, onSelect]);

  return (
    <div 
      className="relative overflow-hidden pointer-events-auto"
      style={{ height: containerHeight }}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Selection highlight bar - subtle transparent */}
      <div 
        className="absolute left-0 right-0 pointer-events-none z-10 bg-white/[0.08] rounded-xl border border-white/10"
        style={{ 
          top: centerOffset * itemHeight,
          height: itemHeight,
        }}
      />
      
      {/* Scrollable area */}
      <div
        ref={containerRef}
        className="h-full overflow-y-auto scrollbar-hide snap-y snap-mandatory touch-pan-y"
        style={{ 
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          paddingTop: centerOffset * itemHeight,
          paddingBottom: centerOffset * itemHeight,
          WebkitOverflowScrolling: 'touch',
        }}
        onScroll={handleScroll}
      >
        {items.map((item, index) => {
          const distance = Math.abs(index - selectedIndex);
          // Smooth opacity falloff based on distance
          const opacity = distance === 0 ? 1 : distance === 1 ? 0.45 : distance === 2 ? 0.25 : 0.12;
          const scale = distance === 0 ? 1 : distance === 1 ? 0.92 : 0.85;
          
          return (
            <div
              key={index}
              className="flex items-center justify-center snap-center cursor-pointer transition-all duration-200 pointer-events-auto"
              style={{ 
                height: itemHeight,
                opacity,
                transform: `scale(${scale})`,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(index);
                if (containerRef.current) {
                  containerRef.current.scrollTo({
                    top: index * itemHeight,
                    behavior: 'smooth'
                  });
                }
              }}
            >
              <span className="text-xl font-medium text-white">
                {item}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Wheel Time Picker component
interface WheelTimePickerProps {
  hour: number;
  minute: number;
  period: 'AM' | 'PM';
  onHourChange: (hour: number) => void;
  onMinuteChange: (minute: number) => void;
  onPeriodChange: (period: 'AM' | 'PM') => void;
}

function WheelTimePicker({ 
  hour, 
  minute, 
  period, 
  onHourChange, 
  onMinuteChange, 
  onPeriodChange 
}: WheelTimePickerProps) {
  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = Array.from({ length: 60 }, (_, i) => i);
  const periods: ('AM' | 'PM')[] = ['AM', 'PM'];

  const hourIndex = hours.indexOf(hour);
  const minuteIndex = minute;
  const periodIndex = periods.indexOf(period);

  return (
    <div className="flex items-center justify-center gap-2 px-4 py-2">
      {/* Hour wheel */}
      <div className="flex-1 max-w-[80px]">
        <WheelColumn
          items={hours}
          selectedIndex={hourIndex >= 0 ? hourIndex : 0}
          onSelect={(index) => onHourChange(hours[index])}
        />
      </div>
      
      {/* Separator */}
      <span className="text-2xl font-bold text-white">:</span>
      
      {/* Minute wheel */}
      <div className="flex-1 max-w-[80px]">
        <WheelColumn
          items={minutes.map(m => String(m).padStart(2, '0'))}
          selectedIndex={minuteIndex}
          onSelect={(index) => onMinuteChange(index)}
        />
      </div>
      
      {/* AM/PM wheel */}
      <div className="flex-1 max-w-[80px]">
        <WheelColumn
          items={periods}
          selectedIndex={periodIndex}
          onSelect={(index) => onPeriodChange(periods[index])}
          visibleItems={3}
        />
      </div>
    </div>
  );
}


export function ScheduleSheet({ isOpen, onClose, scheduledDate, onSchedule }: ScheduleSheetProps) {
  const today = startOfToday();
  const [currentMonth, setCurrentMonth] = useState(scheduledDate || today);
  const [selectedDate, setSelectedDate] = useState<Date | null>(scheduledDate);
  
  const initialHour = scheduledDate?.getHours() ?? 12;
  const { hour12: initHour12, period: initPeriod } = to12Hour(initialHour);
  
  const [selectedHour12, setSelectedHour12] = useState(initHour12);
  const [selectedPeriod, setSelectedPeriod] = useState<'AM' | 'PM'>(initPeriod);
  const [selectedMinute, setSelectedMinute] = useState(
    scheduledDate ? Math.floor(scheduledDate.getMinutes() / 5) * 5 : 0
  );

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  
  // Pad start of month
  const startDay = monthStart.getDay();
  const paddedDays = Array(startDay).fill(null).concat(daysInMonth);

  const handlePrevMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleConfirm = () => {
    if (selectedDate) {
      const date = new Date(selectedDate);
      const hour24 = to24Hour(selectedHour12, selectedPeriod);
      date.setHours(hour24, selectedMinute, 0, 0);
      onSchedule(date);
    }
    onClose();
  };

  const handleClear = () => {
    onSchedule(null);
    setSelectedDate(null);
    onClose();
  };

  // Format time for display
  const formatTimeDisplay = () => {
    const hourStr = String(selectedHour12);
    const minStr = String(selectedMinute).padStart(2, '0');
    return `${hourStr}:${minStr} ${selectedPeriod}`;
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent 
        glass
        hideHandle
        className="px-4 pb-2 sm:max-w-md sm:mx-auto"
      >
        <DrawerHeader className="relative pb-4 border-b border-white/10 px-0">
          <div className="flex items-center justify-between">
            <button onClick={onClose} className="p-2 -ml-2 hover:bg-white/10 rounded-xl transition-colors">
              <X className="w-5 h-5 text-zinc-400" />
            </button>
            <DrawerTitle className="text-white font-semibold absolute left-1/2 -translate-x-1/2">
              Schedule Post
            </DrawerTitle>
            <button
              onClick={handleConfirm}
              disabled={!selectedDate}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all",
                selectedDate
                  ? "bg-white/10 text-white border border-white/20 hover:bg-white/20"
                  : "bg-white/5 text-zinc-500 border border-white/10 cursor-not-allowed"
              )}
            >
              <Check className="w-4 h-4" />
              Confirm
            </button>
          </div>
        </DrawerHeader>

        <div className="relative pt-3 space-y-2 sm:space-y-2">
          {/* Calendar Header */}
          <div className="flex items-center justify-between px-2">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-white/10 rounded-xl transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-white" />
            </button>
            <h3 className="text-white font-semibold text-sm">
              {format(currentMonth, 'MMMM yyyy')}
            </h3>
            <button
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-white/10 rounded-xl transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Day labels */}
          <div className="grid grid-cols-7 gap-0.5 px-2">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
              <div key={day} className="text-center text-xs text-zinc-500 py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-0.5 px-2">
            {paddedDays.map((day, i) => {
              if (!day) return <div key={`empty-${i}`} />;
              
              const isPast = isBefore(day, today);
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const isToday = isSameDay(day, today);
              
              return (
                <motion.button
                  key={day.toISOString()}
                  onClick={() => !isPast && setSelectedDate(day)}
                  disabled={isPast}
                  whileTap={{ scale: 0.95 }}
                  className={cn(
                    "aspect-square flex items-center justify-center rounded-full text-xs font-medium transition-all",
                    isPast && "text-zinc-600 cursor-not-allowed",
                    !isPast && !isSelected && "text-white hover:bg-white/10",
                    isToday && !isSelected && "ring-1 ring-white/30",
                    isSelected && "bg-white text-black"
                  )}
                >
                  {format(day, 'd')}
                </motion.button>
              );
            })}
          </div>

          {/* iOS-style Time Wheel Picker */}
          <div className="border-t border-white/10 pt-2">
            <WheelTimePicker
              hour={selectedHour12}
              minute={selectedMinute}
              period={selectedPeriod}
              onHourChange={setSelectedHour12}
              onMinuteChange={setSelectedMinute}
              onPeriodChange={setSelectedPeriod}
            />
          </div>


          {/* Clear button */}
          {scheduledDate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="w-full py-3 text-red-400 hover:text-red-300 text-sm font-medium transition-colors pointer-events-auto"
            >
              Remove Schedule
            </button>
          )}

          {/* Safe area padding for notched devices */}
          <div className="h-[env(safe-area-inset-bottom,0px)]" />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

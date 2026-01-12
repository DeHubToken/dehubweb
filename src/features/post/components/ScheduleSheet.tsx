import { useState } from 'react';
import { X, Calendar, Clock, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isBefore, startOfToday } from 'date-fns';

interface ScheduleSheetProps {
  isOpen: boolean;
  onClose: () => void;
  scheduledDate: Date | null;
  onSchedule: (date: Date | null) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = ['00', '15', '30', '45'];

export function ScheduleSheet({ isOpen, onClose, scheduledDate, onSchedule }: ScheduleSheetProps) {
  const today = startOfToday();
  const [currentMonth, setCurrentMonth] = useState(scheduledDate || today);
  const [selectedDate, setSelectedDate] = useState<Date | null>(scheduledDate);
  const [selectedHour, setSelectedHour] = useState(scheduledDate?.getHours() ?? 12);
  const [selectedMinute, setSelectedMinute] = useState(
    scheduledDate ? String(Math.floor(scheduledDate.getMinutes() / 15) * 15).padStart(2, '0') : '00'
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
      date.setHours(selectedHour, parseInt(selectedMinute), 0, 0);
      onSchedule(date);
    }
    onClose();
  };

  const handleClear = () => {
    onSchedule(null);
    setSelectedDate(null);
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent 
        side="bottom" 
        className="bg-white/10 backdrop-blur-2xl border-0 border-t border-white/20 rounded-t-3xl shadow-[0_-10px_60px_-15px_rgba(255,255,255,0.1)] max-h-[85vh] overflow-y-auto"
      >
        <SheetHeader className="relative pb-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <button onClick={onClose} className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors">
              <X className="w-5 h-5 text-zinc-400" />
            </button>
            <SheetTitle className="text-white font-semibold absolute left-1/2 -translate-x-1/2">
              Schedule Post
            </SheetTitle>
            <button
              onClick={handleConfirm}
              disabled={!selectedDate}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                selectedDate
                  ? "bg-white/10 text-white border border-white/20 hover:bg-white/20"
                  : "bg-white/5 text-zinc-500 border border-white/10 cursor-not-allowed"
              )}
            >
              <Check className="w-4 h-4" />
              Confirm
            </button>
          </div>
        </SheetHeader>

        <div className="relative pt-6 space-y-6">
          {/* Calendar Header */}
          <div className="flex items-center justify-between px-2">
            <button
              onClick={handlePrevMonth}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
            <h3 className="text-white font-semibold">
              {format(currentMonth, 'MMMM yyyy')}
            </h3>
            <button
              onClick={handleNextMonth}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Day labels */}
          <div className="grid grid-cols-7 gap-1 px-2">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
              <div key={day} className="text-center text-xs text-zinc-500 py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1 px-2">
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
                    "aspect-square flex items-center justify-center rounded-full text-sm font-medium transition-all",
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

          {/* Time Picker */}
          <div className="border-t border-white/10 pt-6">
            <div className="flex items-center gap-2 mb-4 px-2">
              <Clock className="w-4 h-4 text-zinc-400" />
              <span className="text-sm text-zinc-400">Select time</span>
            </div>
            
            <div className="flex gap-4 px-2">
              {/* Hour */}
              <div className="flex-1">
                <label className="text-xs text-zinc-500 mb-2 block">Hour</label>
                <div className="grid grid-cols-6 gap-1 max-h-32 overflow-y-auto">
                  {HOURS.map(hour => (
                    <button
                      key={hour}
                      onClick={() => setSelectedHour(hour)}
                      className={cn(
                        "py-2 rounded-lg text-sm font-medium transition-all",
                        selectedHour === hour
                          ? "bg-white text-black"
                          : "text-white hover:bg-white/10"
                      )}
                    >
                      {String(hour).padStart(2, '0')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Minute */}
              <div className="w-24">
                <label className="text-xs text-zinc-500 mb-2 block">Minute</label>
                <div className="grid grid-cols-2 gap-1">
                  {MINUTES.map(minute => (
                    <button
                      key={minute}
                      onClick={() => setSelectedMinute(minute)}
                      className={cn(
                        "py-2 rounded-lg text-sm font-medium transition-all",
                        selectedMinute === minute
                          ? "bg-white text-black"
                          : "text-white hover:bg-white/10"
                      )}
                    >
                      {minute}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Preview */}
          {selectedDate && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-2 p-4 rounded-xl bg-white/5 border border-white/10"
            >
              <p className="text-zinc-400 text-xs mb-1">Scheduled for</p>
              <p className="text-white font-semibold">
                {format(selectedDate, 'EEEE, MMMM d, yyyy')} at {String(selectedHour).padStart(2, '0')}:{selectedMinute}
              </p>
            </motion.div>
          )}

          {/* Clear button */}
          {scheduledDate && (
            <button
              onClick={handleClear}
              className="w-full py-3 text-red-400 hover:text-red-300 text-sm font-medium transition-colors"
            >
              Remove Schedule
            </button>
          )}

          {/* Safe area padding */}
          <div className="h-[env(safe-area-inset-bottom,16px)]" />
        </div>
      </SheetContent>
    </Sheet>
  );
}

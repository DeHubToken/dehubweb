/**
 * EditEventDrawer
 * ================
 * Allows event creators to edit name, dates, location, and description.
 */

import { useState, useEffect } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { GLASS_STYLES } from '@/constants/app.constants';
import { useUpdateEvent } from '@/hooks/use-events';
import type { CommunityEvent } from '@/hooks/use-events';

interface EditEventDrawerProps {
  event: CommunityEvent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditEventDrawer({ event, open, onOpenChange }: EditEventDrawerProps) {
  const updateEvent = useUpdateEvent();

  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description || '');
  const [location, setLocation] = useState(event.location || '');
  const [startDate, setStartDate] = useState<Date>(new Date(event.starts_at));
  const [startTime, setStartTime] = useState(format(new Date(event.starts_at), 'HH:mm'));
  const [endDate, setEndDate] = useState<Date | undefined>(
    event.ends_at ? new Date(event.ends_at) : undefined
  );
  const [endTime, setEndTime] = useState(
    event.ends_at ? format(new Date(event.ends_at), 'HH:mm') : '21:00'
  );

  // Reset form when event changes
  useEffect(() => {
    setTitle(event.title);
    setDescription(event.description || '');
    setLocation(event.location || '');
    setStartDate(new Date(event.starts_at));
    setStartTime(format(new Date(event.starts_at), 'HH:mm'));
    setEndDate(event.ends_at ? new Date(event.ends_at) : undefined);
    setEndTime(event.ends_at ? format(new Date(event.ends_at), 'HH:mm') : '21:00');
  }, [event]);

  const handleSubmit = () => {
    if (!title.trim()) return;

    const [sh, sm] = startTime.split(':').map(Number);
    const startsAt = new Date(startDate);
    startsAt.setHours(sh, sm, 0, 0);

    let ends_at: string | null = null;
    if (endDate) {
      const [eh, em] = endTime.split(':').map(Number);
      const endsAt = new Date(endDate);
      endsAt.setHours(eh, em, 0, 0);
      ends_at = endsAt.toISOString();
    }

    updateEvent.mutate(
      {
        eventId: event.id,
        updates: {
          title: title.trim(),
          description: description.trim() || null,
          location: location.trim() || null,
          starts_at: startsAt.toISOString(),
          ends_at,
        },
      },
      {
        onSuccess: () => onOpenChange(false),
      }
    );
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className={cn(GLASS_STYLES.drawer, 'max-h-[90vh]')}>
        <DrawerHeader>
          <DrawerTitle className="text-white">Edit Event</DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-4 overflow-y-auto">
          {/* Title */}
          <div>
            <Label className="text-zinc-400 text-xs">Event Name *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give your event a name"
              className="mt-1 bg-white/5 border-white/10 text-white"
              maxLength={120}
            />
          </div>

          {/* Start Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-zinc-400 text-xs">Start Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full mt-1 justify-start text-left font-normal bg-white/5 border-white/10 text-white"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(startDate, 'MMM d, yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className={cn('w-auto p-0', GLASS_STYLES.popover)} align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(d) => d && setStartDate(d)}
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Start Time</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 bg-white/5 border-white/10 text-white"
              />
            </div>
          </div>

          {/* End Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-zinc-400 text-xs">End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full mt-1 justify-start text-left font-normal bg-white/5 border-white/10 text-white',
                      !endDate && 'text-zinc-500'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, 'MMM d, yyyy') : 'Optional'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className={cn('w-auto p-0', GLASS_STYLES.popover)} align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    disabled={(date) => date < startDate}
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">End Time</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="mt-1 bg-white/5 border-white/10 text-white"
              />
            </div>
          </div>

          {/* Location */}
          <div>
            <Label className="text-zinc-400 text-xs">Location</Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add a place or link"
              className="mt-1 bg-white/5 border-white/10 text-white"
              maxLength={200}
            />
          </div>

          {/* Description */}
          <div>
            <Label className="text-zinc-400 text-xs">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell people about this event..."
              className="mt-1 bg-white/5 border-white/10 text-white min-h-[80px] resize-none"
              maxLength={2000}
            />
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 rounded-xl border-white/10 text-zinc-300"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!title.trim() || updateEvent.isPending}
              className="flex-1 rounded-xl"
            >
              {updateEvent.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

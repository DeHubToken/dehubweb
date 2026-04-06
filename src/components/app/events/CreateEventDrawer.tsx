import { useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, ImagePlus, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useCreateEvent } from '@/hooks/use-events';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { GLASS_STYLES } from '@/constants/app.constants';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import dehubCoin from '@/assets/dehub-coin.png';

interface CreateEventDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId?: string;
}

export function CreateEventDrawer({ open, onOpenChange, communityId }: CreateEventDrawerProps) {
  const { walletAddress, user } = useAuth();
  const createEvent = useCreateEvent();
  const { t } = useTranslation();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState<Date>();
  const [startTime, setStartTime] = useState('19:00');
  const [endDate, setEndDate] = useState<Date>();
  const [endTime, setEndTime] = useState('21:00');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [hasGateFee, setHasGateFee] = useState(false);
  const [gateFee, setGateFee] = useState('');

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!title.trim() || !startDate || !walletAddress) return;

    let cover_image_url: string | undefined;

    if (coverFile) {
      setUploading(true);
      const ext = coverFile.name.split('.').pop();
      const path = `events/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('community-media')
        .upload(path, coverFile, { cacheControl: '31536000' });
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('community-media').getPublicUrl(path);
        cover_image_url = urlData.publicUrl;
      }
      setUploading(false);
    }

    const [sh, sm] = startTime.split(':').map(Number);
    const startsAt = new Date(startDate);
    startsAt.setHours(sh, sm, 0, 0);

    let ends_at: string | undefined;
    if (endDate) {
      const [eh, em] = endTime.split(':').map(Number);
      const endsAt = new Date(endDate);
      endsAt.setHours(eh, em, 0, 0);
      ends_at = endsAt.toISOString();
    }

    const feeAmount = hasGateFee && gateFee ? parseFloat(gateFee) : 0;

    createEvent.mutate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        starts_at: startsAt.toISOString(),
        ends_at,
        cover_image_url,
        community_id: communityId,
        creator_username: user?.username ?? undefined,
        creator_avatar: user?.avatarImageUrl ?? user?.avatarUrl ?? undefined,
        gate_fee: feeAmount > 0 ? feeAmount : undefined,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setTitle('');
          setDescription('');
          setLocation('');
          setStartDate(undefined);
          setEndDate(undefined);
          setCoverFile(null);
          setCoverPreview(null);
          setHasGateFee(false);
          setGateFee('');
        },
      }
    );
  };

  const isValid = title.trim().length > 0 && !!startDate;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className={cn(GLASS_STYLES.drawer, 'max-h-[90vh]')}>
        <DrawerHeader>
          <DrawerTitle className="text-white">Create Event</DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-4 overflow-y-auto">
          {/* Cover Image */}
          <div>
            <Label className="text-zinc-400 text-xs">Cover Image</Label>
            <label className="mt-1 flex items-center justify-center h-32 rounded-xl border border-dashed border-white/10 cursor-pointer hover:bg-white/[0.03] transition-colors overflow-hidden">
              {coverPreview ? (
                <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center text-zinc-500">
                  <ImagePlus className="w-6 h-6 mb-1" />
                  <span className="text-xs">Add cover photo</span>
                </div>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
            </label>
          </div>

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
                    className={cn(
                      'w-full mt-1 justify-start text-left font-normal bg-white/5 border-white/10 text-white',
                      !startDate && 'text-zinc-500'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, 'MMM d, yyyy') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className={cn('w-auto p-0', GLASS_STYLES.popover)} align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
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
                    disabled={(date) => date < (startDate ?? new Date())}
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

          {/* Gate Fee */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <img src={dehubCoin} alt="Coins" className="w-5 h-5" />
                <span className="text-sm font-medium text-white">Charge entry fee</span>
              </div>
              <Switch checked={hasGateFee} onCheckedChange={setHasGateFee} />
            </div>
            {hasGateFee && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={gateFee}
                  onChange={(e) => setGateFee(e.target.value)}
                  placeholder="Amount"
                  className="bg-white/5 border-white/10 text-white flex-1"
                />
                <div className="flex items-center gap-1 text-sm text-zinc-400 shrink-0">
                  <img src={dehubCoin} alt="" className="w-4 h-4" />
                  <span>Coins</span>
                </div>
              </div>
            )}
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!isValid || createEvent.isPending || uploading}
            className="w-full rounded-xl"
          >
            {(createEvent.isPending || uploading) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create Event
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

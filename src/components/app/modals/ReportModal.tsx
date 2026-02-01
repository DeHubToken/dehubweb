/**
 * Report Modal Component
 * ======================
 * Drawer for reporting content violations.
 */

import { useState } from 'react';
import { Flag, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { submitReport } from '@/lib/api/dehub';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

const REPORT_REASONS = [
  { value: 'spam', label: 'Spam or misleading' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'violence', label: 'Violence or dangerous content' },
  { value: 'nudity', label: 'Explicit sexual content' },
  { value: 'copyright', label: 'Copyright infringement' },
  { value: 'scam', label: 'Scam or fraud' },
  { value: 'other', label: 'Other' },
] as const;

interface ReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenId: number | string;
  contentType?: 'post' | 'video' | 'image' | 'audio';
}

export function ReportModal({ open, onOpenChange, tokenId, contentType = 'post' }: ReportModalProps) {
  const { isAuthenticated } = useAuth();
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedReason) {
      toast.error('Please select a reason for your report');
      return;
    }

    if (!isAuthenticated) {
      toast.error('You must be logged in to submit a report');
      return;
    }

    setIsSubmitting(true);
    try {
      const numericTokenId = typeof tokenId === 'string' ? parseInt(tokenId, 10) : tokenId;
      
      if (isNaN(numericTokenId)) {
        toast.error('Invalid content ID');
        return;
      }
      
      const result = await submitReport({
        tokenId: numericTokenId,
        reason: selectedReason,
        description: description.trim() || undefined,
      });

      if (result.success) {
        toast.success(result.message || 'Report submitted successfully. Our team will review it.');
        handleClose();
      } else {
        toast.error('Failed to submit report. Please try again.');
      }
    } catch (error: any) {
      console.error('[ReportModal] Submit error:', error);
      if (error.message?.includes('already reported')) {
        toast.error('You have already reported this content');
      } else if (error.message?.includes('Unauthorized')) {
        toast.error('Please log in to submit a report');
      } else {
        toast.error(error.message || 'Failed to submit report');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedReason('');
    setDescription('');
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={handleClose}>
      <DrawerContent glass className="max-h-[90vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="flex items-center gap-2 text-white">
            <Flag className="w-5 h-5 text-red-500" />
            Report {contentType}
          </DrawerTitle>
          <DrawerDescription className="text-zinc-400">
            Help us understand what's wrong with this content
          </DrawerDescription>
        </DrawerHeader>

        <div 
          className="flex-1 px-4 pb-6 overflow-y-auto overscroll-contain space-y-4"
          style={{ maxHeight: 'calc(90vh - 160px)', WebkitOverflowScrolling: 'touch' }}
        >
          {/* Reason Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-zinc-300">
              Why are you reporting this?
            </Label>
            <RadioGroup 
              value={selectedReason} 
              onValueChange={setSelectedReason}
              className="space-y-2"
            >
              {REPORT_REASONS.map((reason) => (
                <div
                  key={reason.value}
                  className={`flex items-center space-x-3 rounded-xl p-3 cursor-pointer transition-colors ${
                    selectedReason === reason.value
                      ? 'bg-white/10 border border-white/20'
                      : 'bg-white/5 border border-transparent hover:bg-white/10'
                  }`}
                  onClick={() => setSelectedReason(reason.value)}
                >
                  <RadioGroupItem 
                    value={reason.value} 
                    id={reason.value} 
                    className="border-white/40 text-white data-[state=checked]:bg-white data-[state=checked]:border-white"
                  />
                  <Label 
                    htmlFor={reason.value} 
                    className="text-sm text-white cursor-pointer flex-1"
                  >
                    {reason.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Additional Details */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium text-zinc-300">
              Additional details (optional)
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-white/5 border-white/10 text-white min-h-[100px] rounded-xl resize-none"
              maxLength={500}
            />
            <p className="text-xs text-zinc-500 text-right">
              {description.length}/500
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="ghost"
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex-1 text-zinc-400 hover:text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!selectedReason || isSubmitting}
              className="flex-1 bg-white text-black hover:bg-white/90"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Submitting...
                </>
              ) : (
                'Submit Report'
              )}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

import { useState } from 'react';
import { Calendar, Save, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScheduleSheet } from './ScheduleSheet';
import { DraftsSheet, type Draft } from './DraftsSheet';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface PostHeaderProps {
  scheduledDate: Date | null;
  onSchedule: (date: Date | null) => void;
  drafts: Draft[];
  onSaveDraft: () => void;
  onLoadDraft: (draft: Draft) => void;
  onDeleteDraft: (id: string) => void;
  canSaveDraft: boolean;
}

export function PostHeader({
  scheduledDate,
  onSchedule,
  drafts,
  onSaveDraft,
  onLoadDraft,
  onDeleteDraft,
  canSaveDraft,
}: PostHeaderProps) {
  const [showSchedule, setShowSchedule] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);

  return (
    <>
      {/* Header bar */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-b border-white/10">
        {/* Schedule indicator */}
        {scheduledDate && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs font-medium mr-auto"
          >
            <Clock className="w-3 h-3" />
            {format(scheduledDate, 'MMM d, h:mm a')}
          </motion.div>
        )}

        {/* Drafts count badge */}
        {drafts.length > 0 && (
          <span className="text-xs text-zinc-500 mr-1">
            {drafts.length} draft{drafts.length !== 1 ? 's' : ''}
          </span>
        )}

        {/* Schedule button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <motion.button
              onClick={() => setShowSchedule(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center transition-all",
                "bg-white/10 backdrop-blur-xl border border-white/20",
                "hover:bg-white/20 hover:border-white/40",
                scheduledDate && "bg-amber-500/20 border-amber-500/40 text-amber-400"
              )}
            >
              <Calendar className="w-4 h-4" />
            </motion.button>
          </TooltipTrigger>
          <TooltipContent>
            {scheduledDate ? 'Edit schedule' : 'Schedule post'}
          </TooltipContent>
        </Tooltip>

        {/* Drafts button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <motion.button
              onClick={() => setShowDrafts(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center transition-all relative",
                "bg-white/10 backdrop-blur-xl border border-white/20",
                "hover:bg-white/20 hover:border-white/40"
              )}
            >
              <Save className="w-4 h-4" />
              {drafts.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white text-black text-[10px] font-bold flex items-center justify-center">
                  {drafts.length}
                </span>
              )}
            </motion.button>
          </TooltipTrigger>
          <TooltipContent>Drafts</TooltipContent>
        </Tooltip>
      </div>

      {/* Schedule Sheet */}
      <ScheduleSheet
        isOpen={showSchedule}
        onClose={() => setShowSchedule(false)}
        scheduledDate={scheduledDate}
        onSchedule={onSchedule}
      />

      {/* Drafts Sheet */}
      <DraftsSheet
        isOpen={showDrafts}
        onClose={() => setShowDrafts(false)}
        drafts={drafts}
        onSaveDraft={onSaveDraft}
        onLoadDraft={onLoadDraft}
        onDeleteDraft={onDeleteDraft}
        canSave={canSaveDraft}
      />
    </>
  );
}

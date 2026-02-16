import { useState } from 'react';
import { X, Save, Trash2, FileText, Clock, Image, Video, Mic } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';

export interface Draft {
  id: string;
  text: string;
  createdAt: Date;
  hasImage: boolean;
  hasVideo: boolean;
  hasAudio: boolean;
}

interface DraftsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  drafts: Draft[];
  onSaveDraft: () => void;
  onLoadDraft: (draft: Draft) => void;
  onDeleteDraft: (id: string) => void;
  canSave: boolean;
}

export function DraftsSheet({ 
  isOpen, 
  onClose, 
  drafts, 
  onSaveDraft, 
  onLoadDraft, 
  onDeleteDraft,
  canSave 
}: DraftsSheetProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    setDeletingId(id);
    setTimeout(() => {
      onDeleteDraft(id);
      setDeletingId(null);
      toast.success('Draft deleted');
    }, 300);
  };

  const handleLoad = (draft: Draft) => {
    onLoadDraft(draft);
    onClose();
    toast.success('Draft loaded');
  };

  const handleSave = () => {
    onSaveDraft();
    toast.success('Draft saved');
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent 
        glass
        hideHandle
        className="max-h-[80vh] overflow-hidden flex flex-col px-4 pb-6"
      >
        <DrawerHeader className="relative pb-4 border-b border-white/10 shrink-0 px-0">
          <div className="flex items-center justify-between">
            <button onClick={onClose} className="p-2 -ml-2 hover:bg-white/10 rounded-xl transition-colors">
              <X className="w-5 h-5 text-zinc-400" />
            </button>
            <DrawerTitle className="text-white font-semibold absolute left-1/2 -translate-x-1/2">
              Drafts
            </DrawerTitle>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all",
                canSave
                  ? "bg-white/10 text-white border border-white/20 hover:bg-white/20"
                  : "bg-white/5 text-zinc-500 border border-white/10 cursor-not-allowed"
              )}
            >
              <Save className="w-4 h-4" />
              Save Current
            </button>
          </div>
        </DrawerHeader>

        <div className="relative flex-1 overflow-y-auto pt-4">
          {drafts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-xl bg-white/5 flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-zinc-500" />
              </div>
              <p className="text-zinc-400 font-medium">No drafts yet</p>
              <p className="text-zinc-500 text-sm mt-1">
                Save your work to continue later
              </p>
            </div>
          ) : (
            <div className="space-y-2 px-1">
              <AnimatePresence mode="popLayout">
                {drafts.map((draft) => (
                  <motion.div
                    key={draft.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: deletingId === draft.id ? 0 : 1, y: 0, scale: deletingId === draft.id ? 0.9 : 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="group relative p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all cursor-pointer"
                    onClick={() => handleLoad(draft)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm line-clamp-2">
                          {draft.text || <span className="text-zinc-500 italic">No text</span>}
                        </p>
                        
                        {/* Media indicators */}
                        <div className="flex items-center gap-2 mt-2">
                          {draft.hasImage && (
                            <span className="flex items-center gap-1 text-xs text-zinc-400">
                              <Image className="w-3 h-3" /> Image
                            </span>
                          )}
                          {draft.hasVideo && (
                            <span className="flex items-center gap-1 text-xs text-zinc-400">
                              <Video className="w-3 h-3" /> Video
                            </span>
                          )}
                          {draft.hasAudio && (
                            <span className="flex items-center gap-1 text-xs text-zinc-400">
                              <Mic className="w-3 h-3" /> Audio
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 mt-2 text-xs text-zinc-500">
                          <Clock className="w-3 h-3" />
                          {format(draft.createdAt, 'MMM d, yyyy • h:mm a')}
                        </div>
                      </div>

                      {/* Delete button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(draft.id);
                        }}
                        className="p-2 rounded-xl text-zinc-500 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Safe area padding */}
          <div className="h-[env(safe-area-inset-bottom,16px)]" />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

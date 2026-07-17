/** Modal wrapper for the SkillsLibrary browser, invoked from the assistant slash menu. */
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SkillsLibrary } from './SkillsLibrary';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SkillsBrowserModal({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto bg-black/80 backdrop-blur-[24px] border-white/10">
        <DialogHeader>
          <DialogTitle className="text-white">Skills Library</DialogTitle>
        </DialogHeader>
        <SkillsLibrary />
      </DialogContent>
    </Dialog>
  );
}

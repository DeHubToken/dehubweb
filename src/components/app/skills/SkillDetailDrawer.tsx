import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { Pencil, Trash2, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useDeleteSkill, type UserSkill } from '@/hooks/use-user-skills';

interface Props {
  skill: UserSkill | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEdit: (s: UserSkill) => void;
}

export function SkillDetailDrawer({ skill, open, onOpenChange, onEdit }: Props) {
  const { walletAddress } = useAuth();
  const del = useDeleteSkill();
  const navigate = useNavigate();
  if (!skill) return null;
  const isOwner = walletAddress?.toLowerCase() === skill.creator_wallet_address.toLowerCase();

  const handleDelete = async () => {
    if (!confirm(`Delete "${skill.name}"?`)) return;
    try {
      await del.mutateAsync(skill.id);
      toast.success('Skill deleted');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  };

  const handleUse = () => {
    navigate(`/app/assistant?skill=${skill.slug}`);
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-zinc-900 border-white/10">
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> {skill.name}
            {skill.is_featured && <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-white">Featured</span>}
          </DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <p className="text-sm text-zinc-300">{skill.description}</p>
          <div>
            <div className="text-xs text-zinc-500 mb-1">Creator</div>
            <div className="text-sm text-white">@{skill.creator_username || skill.creator_wallet_address.slice(0, 8)} · {skill.usage_count} uses</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500 mb-1">Trigger phrases</div>
            <div className="flex flex-wrap gap-1.5">
              {skill.trigger_phrases.map((p) => (
                <span key={p} className="text-[11px] px-2 py-1 rounded-md bg-white/5 border border-white/10 text-zinc-300">{p}</span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500 mb-1">System prompt</div>
            <pre className="text-xs text-zinc-300 whitespace-pre-wrap bg-black/40 rounded-lg p-3 border border-white/5 max-h-48 overflow-y-auto">{skill.system_prompt}</pre>
          </div>
          {skill.asset_urls.length > 0 && (
            <div>
              <div className="text-xs text-zinc-500 mb-2">Assets</div>
              <div className="flex flex-wrap gap-2">
                {skill.asset_urls.map((url) => (
                  <img key={url} src={url} alt="" className="w-20 h-20 rounded-lg object-cover border border-white/10" />
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <LiquidGlassBubble2 onClick={handleUse}>Use in Assistant</LiquidGlassBubble2>
            {isOwner && (
              <>
                <Button variant="ghost" size="sm" onClick={() => { onEdit(skill); onOpenChange(false); }}>
                  <Pencil className="w-4 h-4 mr-1" /> Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={handleDelete} className="text-red-400 hover:text-red-300">
                  <Trash2 className="w-4 h-4 mr-1" /> Delete
                </Button>
              </>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

import { useMemo, useState } from 'react';
import { Search, Plus, Users, Trash2, Pencil, Copy, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useUserCharacters, useDeleteCharacter, type UserCharacter } from '@/hooks/use-user-characters';
import { CharacterCreateModal } from './CharacterCreateModal';

type Filter = 'mine' | 'public';

export function CharactersLibrary() {
  const { walletAddress } = useAuth();
  const { data: characters = [], isLoading } = useUserCharacters();
  const del = useDeleteCharacter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('mine');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserCharacter | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const wallet = walletAddress?.toLowerCase();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return characters.filter((c) => {
      if (filter === 'mine') {
        if (!wallet || c.creator_wallet_address.toLowerCase() !== wallet) return false;
      } else {
        if (c.visibility !== 'public') return false;
      }
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
      );
    });
  }, [characters, query, filter, wallet]);

  const copyMention = (slug: string, id: string) => {
    navigator.clipboard.writeText(`@${slug}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1200);
    toast.success(`Copied @${slug}`);
  };

  const handleDelete = async (c: UserCharacter) => {
    if (!confirm(`Delete character "${c.name}"?`)) return;
    try {
      await del.mutateAsync(c.id);
      toast.success('Character deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Users className="w-4 h-4" /> Characters
          </h2>
          <p className="text-xs text-zinc-500">
            Save people, mascots, or styles with reference photos. Use them in any image or video prompt with{' '}
            <span className="text-white">@name</span>.
          </p>
        </div>
        <LiquidGlassBubble2
          onClick={() => { setEditing(null); setCreateOpen(true); }}
          disabled={!walletAddress}
          label="New character"
          icon={<Plus className="w-4 h-4" />}
          width="170px"
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search characters…"
            className="pl-9 bg-white/5 border-white/10"
          />
        </div>
        <div className="flex gap-1.5">
          {(['mine', 'public'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-lg text-xs capitalize border transition-colors ${
                filter === f ? 'bg-white/15 border-white/30 text-white' : 'bg-white/5 border-white/10 text-zinc-400'
              }`}
            >
              {f === 'mine' ? 'My characters' : 'Public'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="aspect-[3/4] rounded-2xl bg-white/[0.03] border border-white/5 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-10 text-center text-zinc-500 text-sm">
          {query
            ? 'No characters match your search.'
            : filter === 'mine'
              ? "You haven't created any characters yet. Click \"New character\" to get started."
              : 'No public characters yet.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((c) => {
            const isOwner = wallet && c.creator_wallet_address.toLowerCase() === wallet;
            const cover = c.primary_image_url || c.reference_image_urls[0];
            return (
              <div
                key={c.id}
                className="group relative aspect-[3/4] rounded-2xl overflow-hidden border border-white/10 bg-black/60 backdrop-blur-[24px]"
              >
                {cover ? (
                  <img src={cover} alt={c.name} className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 bg-zinc-800" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-3 space-y-1.5">
                  <div className="text-white font-semibold text-sm truncate">{c.name}</div>
                  <button
                    onClick={() => copyMention(c.slug, c.id)}
                    className="text-[11px] text-zinc-300 hover:text-white flex items-center gap-1 truncate"
                  >
                    {copiedId === c.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    @{c.slug}
                  </button>
                  {c.description && (
                    <p className="text-[11px] text-zinc-400 line-clamp-2">{c.description}</p>
                  )}
                </div>
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isOwner && (
                    <>
                      <button
                        onClick={() => { setEditing(c); setCreateOpen(true); }}
                        className="w-7 h-7 rounded-lg bg-black/70 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:bg-black/90"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(c)}
                        className="w-7 h-7 rounded-lg bg-black/70 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:bg-red-500/40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
                {c.visibility === 'public' && (
                  <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-white/15 backdrop-blur-md border border-white/20 text-[10px] text-white">
                    Public
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <CharacterCreateModal open={createOpen} onOpenChange={setCreateOpen} editing={editing} />
    </div>
  );
}

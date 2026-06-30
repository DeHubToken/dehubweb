import { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowUp, Sparkles, Cpu, Atom, Gamepad2, Trophy, Music2, Film, Image as ImageIcon, Radio } from 'lucide-react';
import type { DeHubCategory } from '@/lib/api/dehub';
import { cn } from '@/lib/utils';

type Stage = 'input' | 'analysing' | 'tune';

interface CategoryWeight {
  id: string;
  name: string;
  weight: number; // 0-100
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: DeHubCategory[];
  initialPrompt?: string;
  onSave: (selectedCategoryIds: string[], prompt: string) => void;
}

const ORBIT_ICONS = [Sparkles, Cpu, Atom, Gamepad2, Trophy, Music2, Film, ImageIcon, Radio];

// Synonym / related-term clusters. Each cluster: any matching input token
// boosts every term in the cluster when scoring against category names.
const SYNONYM_CLUSTERS: string[][] = [
  // Adult / NSFW
  ['nsfw', 'adult', 'porn', 'sex', 'sexy', 'boobs', 'tits', 'ass', 'booty', 'thicc', 'lingerie', 'onlyfans', 'nude', 'nudes', 'hot', 'women', 'woman', 'girl', 'girls', 'babe', 'babes', 'milf', 'erotic', 'fetish', 'kink', 'cosplay'],
  // Sports
  ['sport', 'sports', 'football', 'soccer', 'fifa', 'worldcup', 'world', 'cup', 'nba', 'basketball', 'baseball', 'mlb', 'nfl', 'rugby', 'cricket', 'tennis', 'golf', 'mma', 'ufc', 'boxing', 'wrestling', 'wwe', 'f1', 'formula', 'racing', 'nascar', 'hockey', 'nhl', 'olympics', 'athlete', 'athletics'],
  // Gaming / esports
  ['game', 'games', 'gaming', 'gamer', 'esports', 'esport', 'fortnite', 'minecraft', 'roblox', 'valorant', 'cod', 'callofduty', 'warzone', 'lol', 'leagueoflegends', 'dota', 'csgo', 'cs2', 'apex', 'pubg', 'overwatch', 'twitch', 'streamer', 'xbox', 'playstation', 'ps5', 'nintendo', 'switch', 'rpg', 'mmo', 'fps'],
  // Crypto / web3
  ['crypto', 'cryptocurrency', 'btc', 'bitcoin', 'eth', 'ethereum', 'sol', 'solana', 'doge', 'dogecoin', 'shib', 'pepe', 'memecoin', 'altcoin', 'defi', 'nft', 'nfts', 'web3', 'blockchain', 'token', 'tokens', 'dex', 'dao', 'staking', 'yield', 'airdrop', 'wallet', 'metamask', 'trading', 'trader', 'chart', 'pump', 'dump', 'bull', 'bear', 'hodl', 'dhb', 'dehub'],
  // AI / tech
  ['ai', 'artificial', 'intelligence', 'ml', 'llm', 'gpt', 'chatgpt', 'openai', 'claude', 'anthropic', 'gemini', 'midjourney', 'stable', 'diffusion', 'tech', 'technology', 'software', 'coding', 'code', 'developer', 'dev', 'programming', 'startup', 'saas', 'computer', 'apple', 'iphone', 'android', 'google', 'microsoft', 'nvidia'],
  // Music
  ['music', 'song', 'songs', 'track', 'album', 'rap', 'hiphop', 'rnb', 'rock', 'metal', 'pop', 'edm', 'house', 'techno', 'dj', 'producer', 'beat', 'beats', 'spotify', 'soundcloud', 'remix', 'jazz', 'classical', 'country', 'reggae', 'kpop'],
  // Film / TV / entertainment
  ['movie', 'movies', 'film', 'films', 'cinema', 'tv', 'show', 'shows', 'series', 'netflix', 'hbo', 'disney', 'marvel', 'dc', 'starwars', 'anime', 'manga', 'cartoon', 'documentary', 'trailer', 'actor', 'actress', 'hollywood', 'streaming'],
  // Art / design / photography
  ['art', 'artist', 'design', 'designer', 'painting', 'drawing', 'illustration', 'photography', 'photo', 'photos', 'photographer', 'aesthetic', 'fashion', 'style', 'creative', 'graphic', 'digital'],
  // News / politics / world
  ['news', 'politics', 'political', 'election', 'government', 'world', 'global', 'breaking', 'current', 'events', 'trump', 'biden', 'war', 'economy', 'inflation', 'market', 'markets', 'finance', 'business', 'stocks', 'stock'],
  // Memes / humour
  ['meme', 'memes', 'funny', 'humor', 'humour', 'comedy', 'joke', 'jokes', 'lol', 'lmao', 'shitpost', 'banter'],
  // Food / cooking
  ['food', 'cooking', 'cook', 'recipe', 'recipes', 'chef', 'kitchen', 'restaurant', 'foodie', 'meal', 'eat', 'eating', 'cuisine', 'baking', 'vegan', 'vegetarian'],
  // Travel
  ['travel', 'trip', 'vacation', 'holiday', 'tourism', 'tourist', 'destination', 'adventure', 'flight', 'hotel', 'beach', 'mountain', 'explore'],
  // Fitness / health
  ['fitness', 'gym', 'workout', 'exercise', 'health', 'healthy', 'bodybuilding', 'muscle', 'crossfit', 'yoga', 'running', 'cardio', 'lifting', 'wellness', 'diet', 'nutrition'],
  // Cars / autos
  ['car', 'cars', 'auto', 'automotive', 'vehicle', 'truck', 'bike', 'motorcycle', 'tesla', 'bmw', 'mercedes', 'ferrari', 'lambo', 'porsche', 'racing'],
  // Animals / pets
  ['animal', 'animals', 'pet', 'pets', 'dog', 'dogs', 'cat', 'cats', 'puppy', 'kitten', 'wildlife', 'nature'],
  // Science / space
  ['science', 'space', 'nasa', 'spacex', 'astronomy', 'physics', 'biology', 'chemistry', 'research', 'quantum', 'mars', 'moon'],
];

function expandTokens(rawTokens: string[]): { tok: string; weight: number }[] {
  const out = new Map<string, number>();
  for (const t of rawTokens) out.set(t, Math.max(out.get(t) ?? 0, 10));
  for (const cluster of SYNONYM_CLUSTERS) {
    const hit = rawTokens.some(t => cluster.includes(t));
    if (hit) {
      for (const term of cluster) {
        out.set(term, Math.max(out.get(term) ?? 0, 6));
      }
    }
  }
  return Array.from(out.entries()).map(([tok, weight]) => ({ tok, weight }));
}

// Local prompt → category weight heuristic with synonym expansion.
function scorePromptAgainstCategories(prompt: string, categories: DeHubCategory[]): CategoryWeight[] {
  const raw = prompt.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2);
  const tokens = expandTokens(raw);
  const scored = categories.map(cat => {
    const name = cat.name.toLowerCase();
    let score = 0;
    for (const { tok, weight } of tokens) {
      if (name === tok) score += weight * 2;
      else if (name.includes(tok)) score += weight;
      else if (tok.includes(name) && name.length > 3) score += Math.round(weight * 0.6);
      else if (name.length > 4 && tok.length > 4 && name.slice(0, 4) === tok.slice(0, 4)) score += Math.round(weight * 0.3);
    }
    return { id: cat.id, name: cat.name, weight: score };
  });
  scored.sort((a, b) => b.weight - a.weight);
  let top = scored.slice(0, 5);
  if (top.every(t => t.weight === 0)) {
    top = scored.slice(0, 5).map((c, i) => ({ ...c, weight: [30, 25, 20, 15, 10][i] || 10 }));
  } else {
    const sum = top.reduce((s, t) => s + t.weight, 0) || 1;
    top = top.map(t => ({ ...t, weight: Math.round((t.weight / sum) * 100) }));
    const diff = 100 - top.reduce((s, t) => s + t.weight, 0);
    if (top[0]) top[0].weight += diff;
  }
  return top;
}

export function PromptFlowModal({ open, onOpenChange, categories, initialPrompt = '', onSave }: Props) {
  const [stage, setStage] = useState<Stage>('input');
  const [prompt, setPrompt] = useState(initialPrompt);
  const [weights, setWeights] = useState<CategoryWeight[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset when re-opened
  useEffect(() => {
    if (open) {
      setStage('input');
      setPrompt(initialPrompt);
      setWeights([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, initialPrompt]);

  // Auto-submit when initialPrompt provided
  useEffect(() => {
    if (open && initialPrompt && initialPrompt.trim() && stage === 'input') {
      handleSubmit(initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = (text?: string) => {
    const value = (text ?? prompt).trim();
    if (!value) return;
    setStage('analysing');
    // simulate analysis
    setTimeout(() => {
      const computed = scorePromptAgainstCategories(value, categories);
      setWeights(computed);
      setStage('tune');
    }, 1400);
  };

  const handleWeightChange = (id: string, newWeight: number) => {
    setWeights(prev => prev.map(w => w.id === id ? { ...w, weight: newWeight } : w));
  };

  const handleSave = () => {
    // Pick categories with weight > 0
    const selected = weights.filter(w => w.weight > 0).map(w => w.id);
    onSave(selected, prompt);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-black/80 backdrop-blur-2xl border border-white/10 text-white rounded-2xl p-6">
        {stage === 'input' && (
          <div className="flex flex-col items-center gap-5 py-4">
            <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-center">What do you want to see more of?</h2>
            <div className="relative w-full">
              <input
                ref={inputRef}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
                placeholder="More AI, tech, gaming…"
                className="w-full pl-4 pr-12 py-3 rounded-full bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-white/30 transition-colors"
              />
              <button
                onClick={() => handleSubmit()}
                disabled={!prompt.trim()}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white text-black flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 transition-transform"
                aria-label="Submit"
              >
                <ArrowUp className="w-4 h-4" strokeWidth={3} />
              </button>
            </div>
          </div>
        )}

        {stage === 'analysing' && (
          <div className="flex flex-col items-center gap-6 py-10">
            <div className="relative w-44 h-44">
              <div className="absolute inset-0 rounded-full border border-white/10 animate-[spin_4s_linear_infinite]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <Sparkles className="w-6 h-6" />
                </div>
              </div>
              {ORBIT_ICONS.slice(0, 5).map((Icon, i) => {
                const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
                const r = 70;
                const x = Math.cos(angle) * r;
                const y = Math.sin(angle) * r;
                return (
                  <div
                    key={i}
                    className="absolute top-1/2 left-1/2 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center"
                    style={{ transform: `translate(${x - 20}px, ${y - 20}px)` }}
                  >
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                );
              })}
            </div>
            <p className="text-sm text-white/60">Analysing your interests…</p>
          </div>
        )}

        {stage === 'tune' && (
          <div className="flex flex-col gap-5 py-2">
            <div className="text-center">
              <h2 className="text-lg font-semibold">Your timeline is ready</h2>
              <p className="text-sm text-white/50">Drag to fine-tune your mix.</p>
            </div>
            <div className="flex flex-col gap-4">
              {weights.map((w, idx) => {
                const Icon = ORBIT_ICONS[idx % ORBIT_ICONS.length];
                return (
                  <div key={w.id} className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-sm w-20 truncate">{w.name}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={w.weight}
                      onChange={e => handleWeightChange(w.id, Number(e.target.value))}
                      className="flex-1 accent-white"
                    />
                    <span className="text-xs text-white/60 w-10 text-right tabular-nums">{w.weight}%</span>
                  </div>
                );
              })}
            </div>
            <Button
              onClick={handleSave}
              className={cn(
                'w-full mt-2 h-12 rounded-2xl bg-white text-black hover:bg-white/90 font-semibold'
              )}
            >
              Save
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

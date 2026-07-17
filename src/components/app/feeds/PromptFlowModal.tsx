import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { ArrowUp, Sparkles, Cpu, Atom, Gamepad2, Trophy, Music2, Film, Image as ImageIcon, Radio, Check } from 'lucide-react';
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
  const { t } = useTranslation();
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

  // Keep latest categories in a ref so deferred timers always score against fresh data.
  const categoriesRef = useRef(categories);
  useEffect(() => { categoriesRef.current = categories; }, [categories]);

  // Auto-submit when initialPrompt provided AND categories have loaded.
  const autoSubmittedRef = useRef(false);
  useEffect(() => {
    if (!open) { autoSubmittedRef.current = false; return; }
    if (autoSubmittedRef.current) return;
    if (!initialPrompt || !initialPrompt.trim()) return;
    if (stage !== 'input') return;
    if (!categories || categories.length === 0) return;
    autoSubmittedRef.current = true;
    handleSubmit(initialPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPrompt, categories, stage]);

  // If we landed on `tune` but categories were empty (race), recompute when they arrive.
  useEffect(() => {
    if (stage === 'tune' && weights.length === 0 && categories.length > 0 && prompt.trim()) {
      setWeights(scorePromptAgainstCategories(prompt, categories));
    }
  }, [stage, weights.length, categories, prompt]);

  const handleSubmit = (text?: string) => {
    const value = (text ?? prompt).trim();
    if (!value) return;
    setStage('analysing');
    // simulate analysis
    setTimeout(() => {
      const computed = scorePromptAgainstCategories(value, categoriesRef.current);
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

  // Use drawer on tablets and phones (< lg breakpoint), dialog on desktop.
  const [isTouchLayout, setIsTouchLayout] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1023px)');
    const sync = () => setIsTouchLayout(mql.matches);
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  }, []);

  const body = (
    <>
      {stage === 'input' && (
        <div className="flex flex-col items-center gap-5 py-4">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-lg font-semibold text-center">{t('prompt.modalQuestion', 'What do you want to see more of?')}</h2>
          <div className="relative w-full">
            <input
              ref={inputRef}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
              placeholder={t('prompt.modalPlaceholder', 'More AI, tech, gaming…')}
              className="w-full pl-4 pr-12 py-3 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus-visible:outline-none focus:border-white/10 transition-colors"
            />
            <button
              onClick={() => handleSubmit()}
              disabled={!prompt.trim()}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-white text-black flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 transition-transform"
              aria-label={t('prompt.submit', 'Submit')}
            >
              <ArrowUp className="w-4 h-4" strokeWidth={3} />
            </button>
          </div>

        </div>
      )}

      {stage === 'analysing' && (
        <div className="flex flex-col items-center gap-6 py-10">
          <div className="relative w-44 h-44">
            <div className="absolute inset-0 rounded-full border border-white/10 animate-[spin_6s_linear_infinite]" />
            <div
              className="absolute inset-3 rounded-full border border-dashed border-white/15 animate-[spin_10s_linear_infinite]"
              style={{ animationDirection: 'reverse' }}
            />
            <div className="absolute inset-6 rounded-full bg-white/[0.04] blur-xl animate-pulse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center animate-[pulse_2s_ease-in-out_infinite]">
                <Sparkles className="w-6 h-6 animate-pulse" />
              </div>
            </div>
            <div className="absolute inset-0 animate-[spin_8s_linear_infinite]">
              {ORBIT_ICONS.slice(0, 6).map((Icon, i) => {
                const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
                const r = 72;
                const x = Math.cos(angle) * r;
                const y = Math.sin(angle) * r;
                return (
                  <div
                    key={i}
                    className="absolute top-1/2 left-1/2 w-10 h-10 -ml-5 -mt-5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center animate-[spin_8s_linear_infinite] backdrop-blur-sm"
                    style={{
                      transform: `translate(${x}px, ${y}px)`,
                      animationDirection: 'reverse',
                      animationDelay: `${-i * 0.2}s`,
                    }}
                  >
                    <Icon
                      className="w-4 h-4 text-white"
                      style={{ animation: `pulse 1.6s ease-in-out ${i * 0.15}s infinite` }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <p className="text-sm text-white/60 animate-pulse">{t('prompt.analysing', 'Analysing your interests…')}</p>
        </div>
      )}

      {stage === 'tune' && (
        <div className="flex flex-col gap-5 py-2">
          <div className="text-center">
            <h2 className="text-lg font-semibold">{t('prompt.timelineReady', 'Your timeline is ready')}</h2>
            <p className="text-sm text-white/50">{t('prompt.dragToTune', 'Drag to fine-tune your mix.')}</p>
          </div>

          <div className="flex flex-col gap-4">
            {weights.map((w, idx) => {
              const Icon = ORBIT_ICONS[idx % ORBIT_ICONS.length];
              return (
                <div key={w.id} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-sm w-20 truncate">{w.name}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={w.weight}
                    onChange={e => handleWeightChange(w.id, Number(e.target.value))}
                    className="flex-1 accent-white focus:outline-none focus-visible:outline-none"
                  />
                  <span className="text-xs text-white/60 w-10 text-right tabular-nums">{w.weight}%</span>
                </div>
              );
            })}
          </div>
          <LiquidGlassBubble2
            label={t('prompt.save', 'Save')}
            icon={<Check className="w-4 h-4" />}
            onClick={handleSave}
            width="100%"
            height="48px"
            className="mt-2"
          />
        </div>
      )}
    </>
  );

  if (isTouchLayout) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent glass hideHandle={false} className="text-white px-5 pb-8 max-h-[92vh] overflow-y-auto">
          {body}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-keep-dark className="max-w-md bg-black/80 backdrop-blur-2xl border border-white/10 text-white rounded-2xl p-6">
        {body}
      </DialogContent>
    </Dialog>
  );
}

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, Sparkles } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';

const SUGGESTIONS = [
  'More AI and crypto news',
  'Gaming clips and esports',
  'Indie music discoveries',
  'Tech founders and startups',
  'Football highlights',
];

export default function PromptLanding() {
  const [text, setText] = useState('');
  const navigate = useNavigate();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = (value?: string) => {
    const v = (value ?? text).trim();
    if (!v) return;
    navigate(`/app?prompt=${encodeURIComponent(v)}`);
  };

  return (
    <div className="min-h-screen w-full bg-black text-white flex flex-col items-center justify-center px-6 relative overflow-hidden">
      <SEOHead title="Prompt your feed — DeHub" description="Tell DeHub what you want to see and we'll tune your timeline." />

      {/* Soft radial glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-white/[0.04] blur-3xl" />
      </div>

      <div className="relative w-full max-w-2xl flex flex-col items-center gap-6">
        <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-xl">
          <Sparkles className="w-6 h-6" />
        </div>
        <h1 className="text-4xl md:text-5xl font-semibold text-center tracking-tight">
          What do you want to see?
        </h1>
        <p className="text-white/50 text-center max-w-md">
          Describe your perfect feed. We'll tune it to your interests in seconds.
        </p>

        <div className="relative w-full mt-2">
          <textarea
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="More AI, gaming clips, indie music…"
            rows={3}
            className="w-full resize-none rounded-3xl bg-white/[0.04] border border-white/10 backdrop-blur-2xl px-6 py-5 pr-16 text-base placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
          />
          <button
            onClick={() => submit()}
            disabled={!text.trim()}
            className="absolute right-3 bottom-3 w-11 h-11 rounded-2xl bg-white text-black flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 transition-transform"
            aria-label="Submit"
          >
            <ArrowUp className="w-5 h-5" strokeWidth={3} />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 justify-center mt-2">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => submit(s)}
              className="px-3 py-1.5 rounded-full text-xs bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
            >
              {s}
            </button>
          ))}
        </div>

        <button
          onClick={() => navigate('/app')}
          className="mt-6 text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          Skip — just take me to the feed
        </button>
      </div>
    </div>
  );
}

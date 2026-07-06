import { cn } from '@/lib/utils';

type ModelChip = {
  name: string;
  vendor: string;
  kind: 'Image' | 'Video' | 'Audio' | 'Text' | '3D';
};

const MODELS: ModelChip[] = [
  { name: 'Nano Banana', vendor: 'Google', kind: 'Image' },
  { name: 'Gemini 3 Pro Image', vendor: 'Google', kind: 'Image' },
  { name: 'Gemini 3.1 Flash Image', vendor: 'Google', kind: 'Image' },
  { name: 'Gemini 2.5 Flash Image', vendor: 'Google', kind: 'Image' },
  { name: 'Flux 1.1 Pro', vendor: 'Black Forest Labs', kind: 'Image' },
  { name: 'Flux Dev', vendor: 'Black Forest Labs', kind: 'Image' },
  { name: 'Flux Schnell', vendor: 'Black Forest Labs', kind: 'Image' },
  { name: 'Ideogram 3', vendor: 'Ideogram', kind: 'Image' },
  { name: 'Recraft V3', vendor: 'Recraft', kind: 'Image' },
  { name: 'GPT Image 1', vendor: 'OpenAI', kind: 'Image' },
  { name: 'Kling 2.1', vendor: 'Kling', kind: 'Video' },
  { name: 'Kling 3.0', vendor: 'Kling', kind: 'Video' },
  { name: 'Seedance 2.0', vendor: 'ByteDance', kind: 'Video' },
  { name: 'Seedance 4K', vendor: 'ByteDance', kind: 'Video' },
  { name: 'Veo 3', vendor: 'Google', kind: 'Video' },
  { name: 'Veo 3 Fast', vendor: 'Google', kind: 'Video' },
  { name: 'Sora 2', vendor: 'OpenAI', kind: 'Video' },
  { name: 'Runway Gen-4', vendor: 'Runway', kind: 'Video' },
  { name: 'Luma Ray 2', vendor: 'Luma', kind: 'Video' },
  { name: 'Pika 2.2', vendor: 'Pika', kind: 'Video' },
  { name: 'MiniMax Hailuo 02', vendor: 'MiniMax', kind: 'Video' },
  { name: 'Wan 2.5', vendor: 'Alibaba', kind: 'Video' },
  { name: 'ElevenLabs v3', vendor: 'ElevenLabs', kind: 'Audio' },
  { name: 'Suno v5', vendor: 'Suno', kind: 'Audio' },
  { name: 'MiniMax Music', vendor: 'MiniMax', kind: 'Audio' },
  { name: 'OpenAI TTS HD', vendor: 'OpenAI', kind: 'Audio' },
  { name: 'Whisper Large v3', vendor: 'OpenAI', kind: 'Audio' },
  { name: 'GPT-5.5', vendor: 'OpenAI', kind: 'Text' },
  { name: 'GPT-5.4', vendor: 'OpenAI', kind: 'Text' },
  { name: 'GPT-5', vendor: 'OpenAI', kind: 'Text' },
  { name: 'Gemini 3 Flash', vendor: 'Google', kind: 'Text' },
  { name: 'Gemini 2.5 Pro', vendor: 'Google', kind: 'Text' },
  { name: 'Claude Sonnet 4.5', vendor: 'Anthropic', kind: 'Text' },
  { name: 'Trellis 3D', vendor: 'Microsoft', kind: '3D' },
];

const kindStyles: Record<ModelChip['kind'], { dot: string; glow: string }> = {
  Image: { dot: '#f472b6', glow: 'rgba(244,114,182,0.35)' },
  Video: { dot: '#60a5fa', glow: 'rgba(96,165,250,0.35)' },
  Audio: { dot: '#a78bfa', glow: 'rgba(167,139,250,0.35)' },
  Text: { dot: '#34d399', glow: 'rgba(52,211,153,0.35)' },
  '3D': { dot: '#fbbf24', glow: 'rgba(251,191,36,0.35)' },
};

function Chip({ model }: { model: ModelChip }) {
  const s = kindStyles[model.kind];
  return (
    <div
      className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-black/60 px-3 py-2 backdrop-blur-[24px]"
      style={{ boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 0 24px ${s.glow}` }}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: s.dot, boxShadow: `0 0 8px ${s.dot}` }}
      />
      <div className="flex flex-col leading-none">
        <span className="text-[11px] font-bold uppercase tracking-tight text-white">
          {model.name}
        </span>
        <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-white/40">
          {model.vendor} · {model.kind}
        </span>
      </div>
    </div>
  );
}

export function ModelMarquee() {
  // Duplicate list for a seamless infinite loop.
  const doubled = [...MODELS, ...MODELS];

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 py-3 backdrop-blur-[24px]',
      )}
      style={{
        WebkitMaskImage:
          'linear-gradient(to right, transparent, black 6%, black 94%, transparent)',
        maskImage:
          'linear-gradient(to right, transparent, black 6%, black 94%, transparent)',
      }}
    >
      <div className="flex items-center gap-2 whitespace-nowrap animate-[model-marquee_60s_linear_infinite]">
        {doubled.map((m, i) => (
          <Chip key={`${m.name}-${i}`} model={m} />
        ))}
      </div>
      <style>{`
        @keyframes model-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

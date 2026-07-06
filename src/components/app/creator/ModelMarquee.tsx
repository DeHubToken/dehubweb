import { cn } from '@/lib/utils';
import alibabaLogo from '@/assets/ai-logos/alibaba.png';
import anthropicLogo from '@/assets/ai-logos/anthropic.png';
import blackForestLabsLogo from '@/assets/ai-logos/black-forest-labs.png';
import bytedanceLogo from '@/assets/ai-logos/bytedance.png';
import elevenlabsLogo from '@/assets/ai-logos/elevenlabs.png';
import googleLogo from '@/assets/ai-logos/google.png';
import ideogramLogo from '@/assets/ai-logos/ideogram.png';
import klingLogo from '@/assets/ai-logos/kling.png';
import lumaLogo from '@/assets/ai-logos/luma.png';
import microsoftLogo from '@/assets/ai-logos/microsoft.png';
import minimaxLogo from '@/assets/ai-logos/minimax.png';
import openaiLogo from '@/assets/ai-logos/openai.png';
import pikaLogo from '@/assets/ai-logos/pika.png';
import recraftLogo from '@/assets/ai-logos/recraft.png';
import runwayLogo from '@/assets/ai-logos/runway.png';
import sunoLogo from '@/assets/ai-logos/suno.png';

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

const vendorMeta: Record<string, { logo: string; color: string }> = {
  Google: { logo: googleLogo, color: '#4285F4' },
  OpenAI: { logo: openaiLogo, color: '#10A37F' },
  Anthropic: { logo: anthropicLogo, color: '#D97757' },
  ByteDance: { logo: bytedanceLogo, color: '#111111' },
  ElevenLabs: { logo: elevenlabsLogo, color: '#FFFFFF' },
  Alibaba: { logo: alibabaLogo, color: '#FF6A00' },
  Microsoft: { logo: microsoftLogo, color: '#00A4EF' },
  Kling: { logo: klingLogo, color: '#FF4906' },
  MiniMax: { logo: minimaxLogo, color: '#F23A5D' },
  Suno: { logo: sunoLogo, color: '#FFFFFF' },
  'Black Forest Labs': { logo: blackForestLabsLogo, color: '#DD0031' },
  Runway: { logo: runwayLogo, color: '#00FF88' },
  Ideogram: { logo: ideogramLogo, color: '#F5A623' },
  Recraft: { logo: recraftLogo, color: '#E5484D' },
  Luma: { logo: lumaLogo, color: '#FDB813' },
  Pika: { logo: pikaLogo, color: '#FF3366' },
};

function VendorLogo({ vendor }: { vendor: string }) {
  const meta = vendorMeta[vendor];
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/95 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]"
      style={{
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.55), 0 0 10px ${meta?.color ?? '#ffffff'}66`,
      }}
    >
      {meta ? (
        <img
          src={meta.logo}
          alt=""
          className="h-full w-full object-contain"
          draggable={false}
          loading="lazy"
        />
      ) : (
        <span className="text-[9px] font-black text-black">{vendor.charAt(0)}</span>
      )}
    </span>
  );
}

function Chip({ model }: { model: ModelChip }) {
  const meta = vendorMeta[model.vendor] ?? { color: '#ffffff' };
  const glow = `${meta.color}40`; // ~25% opacity glow
  return (
    <div
      className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-black/60 px-3 py-2 backdrop-blur-[24px]"
      style={{ boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 0 24px ${glow}` }}
    >
      <VendorLogo vendor={model.vendor} />
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

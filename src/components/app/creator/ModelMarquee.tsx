import { cn } from '@/lib/utils';
import alibabaLogo from '@/assets/ai-logos/alibaba.png.asset.json';
import anthropicLogo from '@/assets/ai-logos/anthropic.png.asset.json';
import blackForestLabsLogo from '@/assets/ai-logos/black-forest-labs.png.asset.json';
import bytedanceLogo from '@/assets/ai-logos/bytedance.png.asset.json';
import elevenlabsLogo from '@/assets/ai-logos/elevenlabs.png.asset.json';
import googleLogo from '@/assets/ai-logos/google.png.asset.json';
import ideogramLogo from '@/assets/ai-logos/ideogram.png.asset.json';
import klingLogo from '@/assets/ai-logos/kling.png.asset.json';
import lumaLogo from '@/assets/ai-logos/luma.png.asset.json';
import microsoftLogo from '@/assets/ai-logos/microsoft.png.asset.json';
import minimaxLogo from '@/assets/ai-logos/minimax.png.asset.json';
import openaiLogo from '@/assets/ai-logos/openai.png.asset.json';
import pikaLogo from '@/assets/ai-logos/pika.png.asset.json';
import recraftLogo from '@/assets/ai-logos/recraft.png.asset.json';
import runwayLogo from '@/assets/ai-logos/runway.png.asset.json';
import sunoLogo from '@/assets/ai-logos/suno.png.asset.json';

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
  Google: { logo: googleLogo.url, color: '#4285F4' },
  OpenAI: { logo: openaiLogo.url, color: '#10A37F' },
  Anthropic: { logo: anthropicLogo.url, color: '#D97757' },
  ByteDance: { logo: bytedanceLogo.url, color: '#111111' },
  ElevenLabs: { logo: elevenlabsLogo.url, color: '#FFFFFF' },
  Alibaba: { logo: alibabaLogo.url, color: '#FF6A00' },
  Microsoft: { logo: microsoftLogo.url, color: '#00A4EF' },
  Kling: { logo: klingLogo.url, color: '#FF4906' },
  MiniMax: { logo: minimaxLogo.url, color: '#F23A5D' },
  Suno: { logo: sunoLogo.url, color: '#FFFFFF' },
  'Black Forest Labs': { logo: blackForestLabsLogo.url, color: '#DD0031' },
  Runway: { logo: runwayLogo.url, color: '#00FF88' },
  Ideogram: { logo: ideogramLogo.url, color: '#F5A623' },
  Recraft: { logo: recraftLogo.url, color: '#E5484D' },
  Luma: { logo: lumaLogo.url, color: '#FDB813' },
  Pika: { logo: pikaLogo.url, color: '#FF3366' },
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

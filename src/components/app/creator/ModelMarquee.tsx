import { cn } from '@/lib/utils';
import alibabaLogo from '@/assets/ai-logos/alibaba.png';
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
import recraftLogo from '@/assets/ai-logos/recraft.png';
import runwayLogo from '@/assets/ai-logos/runway.png';

type ModelChip = {
  name: string;
  vendor: string;
  kind: 'Image' | 'Video' | 'Audio' | 'Text' | '3D';
};

// Every name below is copied verbatim from a constants catalog (image /
// video / audio tools / chat / model3d), so the marquee and the pickers
// always agree. The image, video, 3D and paid-tool entries also price
// through ai-pricing on the server; chat bills through the assistant's own
// credits path, and the free ElevenLabs speech task bills nothing. The
// marquee used to advertise models the composer could not actually select —
// Sora 2, Suno v5, Pika 2.2 — which made the page look broken the moment
// someone went hunting for one of them.
const MODELS: ModelChip[] = [
  { name: 'Nano Banana Pro', vendor: 'Google', kind: 'Image' },
  { name: 'Nano Banana 2', vendor: 'Google', kind: 'Image' },
  { name: 'Gemini 3 Pro', vendor: 'Google', kind: 'Image' },
  { name: 'Seedream 4.5', vendor: 'ByteDance', kind: 'Image' },
  { name: 'FLUX.2 Pro', vendor: 'Black Forest Labs', kind: 'Image' },
  { name: 'FLUX Kontext Max', vendor: 'Black Forest Labs', kind: 'Image' },
  { name: 'Z-Image Turbo', vendor: 'Alibaba', kind: 'Image' },
  { name: 'Recraft V4.1', vendor: 'Recraft', kind: 'Image' },
  { name: 'Ideogram V3', vendor: 'Ideogram', kind: 'Image' },
  { name: 'Qwen Image', vendor: 'Alibaba', kind: 'Image' },
  { name: 'Grok Imagine', vendor: 'xAI', kind: 'Image' },
  { name: 'Seedance 2.5', vendor: 'ByteDance', kind: 'Video' },
  { name: 'Veo 3.1', vendor: 'Google', kind: 'Video' },
  { name: 'Kling 3.0 Pro', vendor: 'Kling', kind: 'Video' },
  { name: 'Seedance 2.0', vendor: 'ByteDance', kind: 'Video' },
  { name: 'Veo 3.1 Fast', vendor: 'Google', kind: 'Video' },
  { name: 'Kling 2.6 Pro', vendor: 'Kling', kind: 'Video' },
  { name: 'Runway Gen-4 Turbo', vendor: 'Runway', kind: 'Video' },
  { name: 'Luma Ray 2', vendor: 'Luma', kind: 'Video' },
  { name: 'MiniMax Hailuo 2.3', vendor: 'MiniMax', kind: 'Video' },
  { name: 'Wan 2.6', vendor: 'Alibaba', kind: 'Video' },
  { name: 'PixVerse V5', vendor: 'PixVerse', kind: 'Video' },
  { name: 'LTX Video', vendor: 'Lightricks', kind: 'Video' },
  { name: 'Eleven v3', vendor: 'ElevenLabs', kind: 'Audio' },
  { name: 'Dia TTS', vendor: 'Nari Labs', kind: 'Audio' },
  { name: 'ACE-Step', vendor: 'ACE Studio', kind: 'Audio' },
  { name: 'MiniMax Music 2.0', vendor: 'MiniMax', kind: 'Audio' },
  { name: 'Whisper', vendor: 'OpenAI', kind: 'Audio' },
  { name: 'Gemini Pro', vendor: 'Google', kind: 'Text' },
  { name: 'Gemini Flash', vendor: 'Google', kind: 'Text' },
  { name: 'GPT-5 Mini', vendor: 'OpenAI', kind: 'Text' },
  { name: 'Grok 4', vendor: 'xAI', kind: 'Text' },
  { name: 'TRELLIS', vendor: 'Microsoft', kind: '3D' },
  { name: 'Hunyuan3D 2.0', vendor: 'Tencent', kind: '3D' },
  { name: 'Tripo 2.5', vendor: 'Tripo', kind: '3D' },
  { name: 'Rodin (Hyper3D)', vendor: 'Deemos', kind: '3D' },
];

// Vendors without an entry here (xAI, PixVerse, Lightricks, Nari Labs,
// ACE Studio, Tencent, Tripo, Deemos) have no logo asset in ai-logos/ and
// fall back to the letter chip in VendorLogo.
const vendorMeta: Record<string, { logo: string; color: string }> = {
  Google: { logo: googleLogo, color: '#4285F4' },
  OpenAI: { logo: openaiLogo, color: '#10A37F' },
  ByteDance: { logo: bytedanceLogo, color: '#111111' },
  ElevenLabs: { logo: elevenlabsLogo, color: '#FFFFFF' },
  Alibaba: { logo: alibabaLogo, color: '#FF6A00' },
  Microsoft: { logo: microsoftLogo, color: '#00A4EF' },
  Kling: { logo: klingLogo, color: '#FF4906' },
  MiniMax: { logo: minimaxLogo, color: '#F23A5D' },
  'Black Forest Labs': { logo: blackForestLabsLogo, color: '#DD0031' },
  Runway: { logo: runwayLogo, color: '#00FF88' },
  Ideogram: { logo: ideogramLogo, color: '#F5A623' },
  Recraft: { logo: recraftLogo, color: '#E5484D' },
  Luma: { logo: lumaLogo, color: '#FDB813' },
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

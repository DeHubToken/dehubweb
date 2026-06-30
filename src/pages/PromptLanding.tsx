import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, Mic, MicOff } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { NebulaBackground } from '@/components/ui/NebulaBackground';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import wandAsset from '@/assets/wand.png.asset.json';

const SUGGESTIONS = [
  'More AI and crypto news',
  'Gaming clips and esports',
  'Indie music discoveries',
  'Tech founders and startups',
  'Football highlights',
];

export default function PromptLanding() {
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = (value?: string) => {
    const v = (value ?? text).trim();
    if (!v) return;
    navigate(`/app?prompt=${encodeURIComponent(v)}`);
  };

  const toggleRecord = () => {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert('Voice input is not supported in this browser.');
      return;
    }
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';
    let base = text ? text + ' ' : '';
    rec.onresult = (e: any) => {
      let interim = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (final) {
        base += final;
      }
      setText((base + interim).trimStart());
    };
    rec.onend = () => setRecording(false);
    rec.onerror = () => setRecording(false);
    recognitionRef.current = rec;
    setRecording(true);
    rec.start();
    inputRef.current?.focus();
  };

  return (
    <div className="min-h-screen w-full bg-black text-white flex flex-col items-center justify-center px-6 relative overflow-hidden">
      <SEOHead title="Prompt your feed — DeHub" description="Tell DeHub what you want to see and we'll tune your timeline." />

      <NebulaBackground />

      <div className="relative w-full max-w-2xl flex flex-col items-center gap-6">
        <img src={wandAsset.url} alt="" className="w-16 h-16 object-contain drop-shadow-[0_4px_18px_rgba(255,255,255,0.15)]" />
        <h1 className="text-4xl md:text-5xl font-semibold text-center tracking-tight">
          What do you want to see?
        </h1>
        <p className="text-white/50 text-center max-w-md">
          Describe your perfect feed.
        </p>

        <div className="w-full mt-2 flex flex-col gap-3">
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
            className="w-full resize-none rounded-3xl bg-white/[0.04] border border-white/10 backdrop-blur-2xl px-6 py-5 text-base placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
          />
          <div className="w-full flex items-center gap-2">
            <LiquidGlassBubble2
              label="Send"
              icon={<ArrowUp className="w-4 h-4" strokeWidth={3} />}
              onClick={() => submit()}
              disabled={!text.trim()}
              width="100%"
              height="48px"
              className="flex-1"
            />
            <LiquidGlassBubble2
              label={recording ? 'Stop' : 'Record'}
              icon={recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              onClick={toggleRecord}
              width="120px"
              height="48px"
              active={recording}
            />
          </div>
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

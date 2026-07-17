import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, Mic, MicOff } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { NebulaBackground } from '@/components/ui/NebulaBackground';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import wandUrl from '@/assets/wand.png';

const SUGGESTION_KEYS = [
  'prompt.suggestion1',
  'prompt.suggestion2',
  'prompt.suggestion3',
  'prompt.suggestion4',
  'prompt.suggestion5',
] as const;


export default function PromptLanding() {
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated, openLoginModal, isConnecting, needsSignature } = useAuth();
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
      alert(t('prompt.voiceUnsupported', 'Voice input is not supported in this browser.'));
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
    <div data-prompt-landing className="h-[100dvh] w-full bg-black text-white flex flex-col items-center justify-center px-6 relative overflow-hidden overscroll-none">
      <SEOHead title={t('prompt.seoTitle', 'Prompt your feed — DeHub')} description={t('prompt.seoDescription', "Tell DeHub what you want to see and we'll tune your timeline.")} />

      <NebulaBackground />

      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 sm:px-6 py-4">
        <button
          onClick={() => navigate('/app')}
          className="block cursor-pointer hover:opacity-80 transition-opacity"
          aria-label={t('prompt.goHome', 'Go to home')}
        >
          <img
            src="/dehub-header-logo.png"
            alt="DeHub"
            className="h-7 w-auto"
            loading="eager"
            decoding="async"
            width={93}
            height={28}
          />
        </button>
        {!isAuthenticated && (
          <LiquidGlassBubble2
            label={isConnecting ? t('nav.connecting') : needsSignature ? t('nav.signMessage') : t('nav.login')}
            onClick={() => openLoginModal()}
            width="110px"
            height="40px"
            disabled={isConnecting}
          />
        )}
      </div>


      <div className="relative w-full max-w-2xl flex flex-col items-center gap-6 mt-16 sm:mt-0">
        <img src={wandUrl} alt="" width={64} height={64} loading="eager" decoding="async" fetchPriority="high" className="w-16 h-16 object-contain drop-shadow-[0_4px_18px_rgba(255,255,255,0.15)]" />
        <h1 className="text-4xl md:text-5xl font-semibold text-center tracking-tight">
          <span className="sm:hidden">{t('prompt.headlineShort', 'What do you want?')}</span>
          <span className="hidden sm:inline">{t('prompt.headline', 'What do you want to see?')}</span>
        </h1>
        <p className="text-white/50 text-center max-w-md">
          {t('prompt.subheadline', 'Describe your perfect feed.')}
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
            placeholder={t('prompt.placeholder', 'More AI, gaming clips, indie music…')}
            rows={3}
            className="w-full resize-none rounded-3xl bg-white/[0.04] border border-white/10 backdrop-blur-2xl px-6 py-5 text-base placeholder-white/30 focus:outline-none focus-visible:outline-none focus:border-white/10 transition-colors"
          />
          <div className="w-full flex items-center gap-2">
            <LiquidGlassBubble2
              label={t('prompt.send', 'Send')}
              icon={<ArrowUp className="w-4 h-4" strokeWidth={3} />}
              onClick={() => submit()}
              disabled={!text.trim()}
              width="100%"
              height="48px"
              className="flex-1"
            />
            <LiquidGlassBubble2
              label={recording ? t('prompt.stop', 'Stop') : t('prompt.record', 'Record')}
              icon={recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              onClick={toggleRecord}
              width="120px"
              height="48px"
              active={recording}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-center mt-2">
          {SUGGESTION_KEYS.map((key, idx) => {
            const label = t(key, [
              'More AI and crypto news',
              'Gaming clips and esports',
              'Indie music discoveries',
              'Tech founders and startups',
              'Football highlights',
            ][idx]);
            return (
              <button
                key={key}
                onClick={() => submit(label)}
                className={`px-3 py-1.5 rounded-lg text-xs bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition-colors ${idx === 4 ? 'hidden sm:inline-flex' : ''}`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => navigate('/app')}
          className="mt-6 text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          {t('prompt.skip', 'Skip — just take me to the feed')}
        </button>
      </div>
    </div>
  );

}

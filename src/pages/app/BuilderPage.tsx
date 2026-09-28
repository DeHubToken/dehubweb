/**
 * DeHub Builder — the lander at dehub.io/builder.
 *
 * Building happens in Messages now: @assistant takes the request in the user's
 * DM, builds the app with the builder-api function and posts the link back in
 * the same thread, where a reply changes it. So this page no longer runs builds
 * of its own. It explains the idea and hands whatever is typed here straight to
 * that DM, sent, so the conversation — every build and every change — lives in
 * the user's messages and nowhere else.
 *
 * /builder/preview/:id stays (BuilderPreviewPage): that is where the links the
 * bot sends land.
 *
 * Always dark by design, so every color is an arbitrary-value class the
 * light-theme remap never touches.
 */
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUp, MessageCircle, Share2, Sparkles, Wand2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';
import { useAuth } from '@/contexts/AuthContext';
import dehubIcon from '@/assets/dehub-logo-compact.png';
import { ASSISTANT_ADDRESS, ASSISTANT_USERNAME } from '@/lib/assistant';

const TEXT_DIM = 'text-[#949499]';
const STROKE = 'border-[rgba(255,255,255,0.09)]';

/** The builder bloom: black melting into blue, pink, then orange. */
const BLOOM_BG: React.CSSProperties = {
  background: [
    'radial-gradient(90% 30% at 50% 102%, rgba(255,107,33,0.9), transparent 72%)',
    'radial-gradient(130% 44% at 50% 90%, rgba(240,59,143,0.62), transparent 70%)',
    'radial-gradient(160% 64% at 50% 63%, rgba(28,77,250,0.52), transparent 74%)',
    '#000',
  ].join(','),
};

const EXAMPLE_KEYS = ['builder.example1', 'builder.example2', 'builder.example3'] as const;

const STEPS = [
  { icon: Sparkles, title: 'builder.step1Title', body: 'builder.step1Body' },
  { icon: Wand2, title: 'builder.step2Title', body: 'builder.step2Body' },
  { icon: Share2, title: 'builder.step3Title', body: 'builder.step3Body' },
] as const;

export default function BuilderPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, openLoginModal } = useAuth() as {
    isAuthenticated: boolean;
    openLoginModal: () => void;
  };
  const [prompt, setPrompt] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /** Open the @assistant thread, sending `body` into it when there is one. */
  const openChat = (body?: string) => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    navigate('/app/messages', {
      state: {
        openDmWith: ASSISTANT_ADDRESS,
        username: ASSISTANT_USERNAME,
        ...(body ? { autoSendBody: body } : {}),
      },
    });
  };

  const send = () => {
    const text = prompt.trim();
    if (!text) {
      inputRef.current?.focus();
      return;
    }
    openChat(text);
  };

  return (
    <div className="relative z-[1] min-h-[100dvh] bg-[#000]" data-builder-surface>
      <SEOHead
        title="Builder — Build Apps with AI on DeHub"
        description="Tell @assistant what you want in your DeHub messages. It builds the app, hosts it and sends you a link anyone can open."
        url="https://dehub.io/builder"
        image="https://dehub.io/og/builder.jpg"
      />

      <div className="min-h-[100dvh] flex flex-col" style={BLOOM_BG}>
        <header className="flex items-center justify-between p-4 sm:p-5">
          <div className="flex items-center gap-2.5">
            <img src={dehubIcon} alt="" className="w-7 h-7 object-contain" />
            <span className="text-[22px] font-extrabold tracking-tight text-[#fff]">Builder</span>
          </div>
          <button
            onClick={() => navigate('/app')}
            aria-label={t('common.close')}
            className="w-11 h-11 rounded-xl flex items-center justify-center bg-[rgba(255,255,255,0.08)] text-[#fff] hover:bg-[rgba(255,255,255,0.14)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <main className="flex-1 w-full max-w-xl mx-auto px-4 sm:px-5 pt-6 sm:pt-12 pb-16">
          <h1 className="text-center text-[34px] sm:text-[44px] font-extrabold tracking-tight text-[#fff] leading-[1.08]">
            {t('builder.landerTitle')}
          </h1>
          <p className={cn('text-center text-[16px] sm:text-[17px] leading-relaxed mt-4 max-w-md mx-auto', 'text-[#c9c9ce]')}>
            {t('builder.landerSubtitle')}
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className={cn('mt-8 rounded-[28px] border backdrop-blur-xl p-4 bg-[rgba(20,20,22,0.88)]', STROKE)}
          >
            <textarea
              ref={inputRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              maxLength={2000}
              placeholder={t('builder.promptPlaceholder')}
              className="w-full bg-transparent resize-none outline-none text-[17px] min-h-[56px] text-[#fff] placeholder:text-[#7a7a80]"
            />
            <div className="flex items-center justify-end mt-2">
              <button
                type="submit"
                disabled={!prompt.trim()}
                className={cn(
                  'flex items-center gap-2 h-11 pl-4 pr-3 rounded-xl bg-[#fff] text-[#000] text-[15px] font-semibold transition-all active:scale-95',
                  !prompt.trim() && 'opacity-35',
                )}
              >
                {t('builder.sendToAssistant')}
                <ArrowUp className="w-5 h-5" strokeWidth={2.5} />
              </button>
            </div>
          </form>

          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {EXAMPLE_KEYS.map((key) => (
              <button
                key={key}
                onClick={() => {
                  setPrompt(t(key));
                  inputRef.current?.focus();
                }}
                className={cn(
                  'rounded-full border px-3.5 py-2 text-[14px] text-[#e8e8ea] transition-colors',
                  'bg-[rgba(10,10,12,0.45)] hover:bg-[rgba(30,30,34,0.6)] backdrop-blur-md',
                  STROKE,
                )}
              >
                {t(key)}
              </button>
            ))}
          </div>

          <ol className="mt-12 grid gap-3 sm:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <li
                key={title}
                className={cn('rounded-2xl border p-4 bg-[rgba(10,10,12,0.55)] backdrop-blur-md', STROKE)}
              >
                <div className="flex items-center gap-2 text-[#fff]">
                  <span className="w-7 h-7 rounded-lg bg-[rgba(255,255,255,0.08)] flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className={cn('text-[13px] tabular-nums', TEXT_DIM)}>{i + 1}</span>
                </div>
                <p className="mt-3 text-[15px] font-semibold text-[#fff] leading-snug">{t(title)}</p>
                <p className={cn('mt-1 text-[14px] leading-relaxed', TEXT_DIM)}>{t(body)}</p>
              </li>
            ))}
          </ol>

          <button
            onClick={() => openChat()}
            className={cn(
              'mx-auto mt-8 flex items-center gap-2 rounded-full border px-4 py-2.5 text-[14px] font-medium text-[#e8e8ea] transition-colors',
              'bg-[rgba(10,10,12,0.45)] hover:bg-[rgba(30,30,34,0.6)] backdrop-blur-md',
              STROKE,
            )}
          >
            <MessageCircle className="w-4 h-4" />
            {t('builder.buildInChat')}
          </button>

          <button
            onClick={() => navigate('/stake')}
            className={cn('block mx-auto mt-4 text-[13px] underline-offset-4 hover:underline', TEXT_DIM)}
          >
            {t('builder.stakeForAllowance')}
          </button>
        </main>
      </div>
    </div>
  );
}

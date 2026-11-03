import { useTranslation as _useCopy } from 'react-i18next';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
/**
 * Riftn Builder — the lander at dehub.io/builder.
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
 * The System theme owns the builder bloom. Canvas themes use their page
 * background, with dark cards keeping the composer and instructions readable.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowUp } from "lucide-react";
import X from "@/components/ui/cut-icons/close";

import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';
import { useAuth } from '@/contexts/AuthContext';
import dehubIcon from '@/assets/dehub-logo-compact.png';
import { ASSISTANT_ADDRESS, ASSISTANT_USERNAME } from '@/lib/assistant';
import { useAppTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { BuilderModelPicker } from '@/components/builder/BuilderModelPicker';
import { builderPricingApi, formatMicrosUsd } from '@/lib/builder/api';
import { fetchBuilderShowcase } from '@/lib/miniapp/registry';

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

/**
 * The speed dial under the prompt. Each stop is one model from the builder's
 * menu; the price beside it is the live per-prompt quote once signed in.
 */
const TIERS = [
  { key: 'builder.tierFast', model: 'anthropic/claude-haiku-5.5' },
  { key: 'builder.tierBalanced', model: 'anthropic/claude-sonnet-5.5' },
  { key: 'builder.tierBest', model: 'anthropic/claude-opus-5.5' },
] as const;

export default function BuilderPage() {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const { theme, themeChoice } = useAppTheme();
  const isLight = (theme === 'light' || themeChoice === 'system-light');
  const ink = isLight ? 'text-[#1a1a1a]' : 'text-[#fff]';
  const dim = isLight ? 'text-[#5a5a5a]' : TEXT_DIM;
  const stroke = isLight ? 'border-[rgba(0,0,0,0.12)]' : STROKE;
  const navigate = useNavigate();
  const { isAuthenticated, openLoginModal } = useAuth() as {
    isAuthenticated: boolean;
    openLoginModal: () => void;
  };
  const [prompt, setPrompt] = useSurfaceDraft("pages/app/BuilderPage.tsx:prompt", '');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();
  const [tier, setTier] = useSurfaceDraft("pages/app/BuilderPage.tsx:tier", 'anthropic/claude-sonnet-5.5');
  const { data: pricing } = useQuery({
    queryKey: ['builder-pricing'],
    queryFn: builderPricingApi.pricing,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
  const { data: showcase } = useQuery({ queryKey: ['builder-showcase'], queryFn: fetchBuilderShowcase, staleTime: 300_000 });

  // A saved model that is one of the dial's stops lights that stop.
  useEffect(() => {
    if (pricing && TIERS.some((x) => x.model === pricing.model)) setTier(pricing.model);
  }, [pricing?.model]); // eslint-disable-line react-hooks/exhaustive-deps

  const quote = (model: string) => pricing?.models.find((m) => m.id === model);
  const active = quote(tier);

  /** Open the @assistant thread, sending `body` into it when there is one. */
  const openChat = async (body?: string) => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    // The prompt is built with whatever the dial says, so save it first.
    if (body && pricing && pricing.model !== tier) {
      await builderPricingApi.setModel(tier).catch(() => undefined);
      queryClient.invalidateQueries({ queryKey: ['builder-pricing'] });
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
    <div className="relative z-[1] min-h-[100dvh] bg-[#000]" data-builder-surface data-glass-page data-theme-page-surface>
      <SEOHead
        title={_copy("copy.6da423db4ed2", { defaultValue: "Builder — Build Apps with AI on Riftn" })}
        description={_copy("copy.001cab7d69a2", { defaultValue: "Tell @assistant what you want in your Riftn messages. It builds the app, hosts it and sends you a link anyone can open." })}
        url="https://riftn.com/builder"
        image="https://riftn.com/og/builder.jpg"
      />

      <div className="min-h-[100dvh] flex flex-col" data-builder-backdrop style={theme === 'system' ? BLOOM_BG : undefined}>
        <header className="flex items-center justify-between p-4 sm:p-5">
          <div className="flex items-center gap-2.5">
            <img src={dehubIcon} alt="" className="w-7 h-7 object-contain" />
            <span className={cn('text-[22px] font-extrabold tracking-tight', ink)}>{_copy("copy.090940e73258", { defaultValue: "Builder" })}</span>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={() => navigate('/app')}
            aria-label={t('common.close')}
            className="w-11 h-11 rounded-xl flex items-center justify-center bg-[rgba(255,255,255,0.08)] text-[#fff] hover:bg-[rgba(255,255,255,0.14)] transition-colors"
          >
            <X className="w-5 h-5" />
          </Button>
        </header>

        <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-5 pt-6 sm:pt-12 pb-16">
          <div className="max-w-xl mx-auto">
          <p className="flex justify-center mb-5">
            <span className={cn('rounded-full border px-3 py-1.5 text-[13px] backdrop-blur-md', stroke, isLight ? 'bg-[rgba(255,255,255,0.7)] text-[#3b2a8a]' : 'bg-[rgba(10,10,12,0.55)] text-[#c7b8ff]')}>
              {t('builder.liveChip')}
            </span>
          </p>
          <h1 className={cn('text-center text-[34px] sm:text-[44px] font-extrabold tracking-tight leading-[1.08]', ink)}>
            {t('builder.landerTitle')}
          </h1>
          <p className={cn('text-center text-[16px] sm:text-[17px] leading-relaxed mt-4 max-w-md mx-auto', isLight ? dim : 'text-[#c9c9ce]')}>
            {t('builder.landerSubtitle')}
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className={cn('mt-8 rounded-[28px] border backdrop-blur-xl p-4', stroke, isLight ? 'bg-[rgba(255,255,255,0.88)]' : 'bg-[rgba(20,20,22,0.88)]')}
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
              className={cn('w-full bg-transparent resize-none outline-none text-[17px] min-h-[56px] placeholder:text-[#7a7a80]', ink)}
            />
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <div
                role="radiogroup"
                aria-label={t('builder.modelLabel')}
                className={cn('inline-flex rounded-full border p-[3px]', stroke, isLight ? 'bg-[rgba(0,0,0,0.04)]' : 'bg-[rgba(255,255,255,0.04)]')}
              >
                {TIERS.map(({ key, model }) => (
                  <button
                    key={model}
                    type="button"
                    role="radio"
                    aria-checked={tier === model}
                    onClick={() => setTier(model)}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors',
                      tier === model ? 'bg-[#7c5cff] text-[#fff]' : dim,
                    )}
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
              {active && (
                <span className={cn('text-[12px] tabular-nums', dim)}>
                  {active.label} · {t('builder.perPrompt', { price: formatMicrosUsd(active.typicalMicros) })}
                </span>
              )}
              <span className="flex-1" />
              <Button
                type="submit"
                disabled={!prompt.trim()}
                className={cn(
                  'flex items-center gap-2 h-11 pl-4 pr-3 rounded-xl text-[15px] font-semibold transition-all active:scale-95',
                  !prompt.trim() && 'opacity-35',
                )}
              >
                {t('builder.sendToAssistant')}
                <ArrowUp className="w-5 h-5" strokeWidth={2.5} />
              </Button>
            </div>
          </form>

          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {EXAMPLE_KEYS.map((key) => (
              <Button
                type="button"
                variant="secondary"
                key={key}
                onClick={() => {
                  setPrompt(t(key));
                  inputRef.current?.focus();
                }}
                className={cn(
                  'rounded-full border px-3.5 py-2 text-[14px] text-[#e8e8ea] transition-colors',
                  'bg-[rgba(10,10,12,0.45)] hover:bg-[rgba(30,30,34,0.6)] backdrop-blur-md',
                  stroke,
                )}
              >
                {t(key)}
              </Button>
            ))}
          </div>

          </div>

          {!!showcase?.length && (
            <section className="mt-14">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className={cn('text-[18px] font-bold', ink)}>{t('builder.builtThisWeek')}</h2>
                <Link to="/apps" className={cn('text-[14px] hover:underline', dim)}>{t('builder.seeAllApps')}</Link>
              </div>
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                {showcase.map((app) => (
                  <a
                    key={app.slug}
                    href={app.home_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn('group rounded-2xl border overflow-hidden backdrop-blur-md transition-colors', stroke, isLight ? 'bg-[rgba(255,255,255,0.7)]' : 'bg-[rgba(10,10,12,0.55)] hover:bg-[rgba(30,30,34,0.6)]')}
                  >
                    <div
                      className="aspect-[16/10] flex items-center justify-center"
                      style={{ background: app.splash_background_color ?? 'linear-gradient(135deg,#3b2a8a,#0f5f6b)' }}
                    >
                      {app.icon_url && <img src={app.icon_url} alt="" loading="lazy" className="w-14 h-14 rounded-2xl object-cover" />}
                    </div>
                    <div className="p-3">
                      <p className={cn('text-[14px] font-semibold truncate', ink)}>{app.name}</p>
                      <p className={cn('text-[12px] truncate', dim)}>{app.domain}</p>
                    </div>
                  </a>
                ))}
              </div>
            </section>
          )}

          {isAuthenticated && (
            <div className="max-w-xl mx-auto">
              <BuilderModelPicker isLight={isLight} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

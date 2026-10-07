import { lazy, Suspense, useEffect, useId, useState } from 'react';
import { PenSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { AppState } from '@/components/app/AppState';
import { ThemedIcon, type ThemeIconKey } from '@/components/app/war/WarHudIcon';
import { useAppTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { SeedPhraseBackup } from '@/components/app/wallet-setup/SeedPhraseBackup';
import { PrivateKeyBackup } from '@/components/app/wallet-setup/PrivateKeyBackup';
import { BackupReminderCard } from '@/components/app/wallet/BackupReminderBanner';
import { ArticleFeedCover } from '@/components/app/article/ArticleFeedCover';
import { ArticleReader } from '@/components/app/article/ArticleReader';
import { ArticleComposer } from '@/features/post/components/ArticleComposer';
import { BADGE_ORDER, badgeImage } from '@/lib/staking-badges';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { BadgedName } from '@/components/app/BadgedName';
import { preloadBadgeShowcase } from '@/lib/badge-showcase';
import { badgeAnimationStyle } from '@/lib/badge-animation-style';
import { ActionBar } from '@/components/app/cards/ActionBar';
import type { ReactionCounts } from '@/lib/reactions';
import { AuthContext, type AuthContextType } from '@/contexts/AuthContext';
import { KitButton, PageEmpty, PageSection, PageTabs } from '@/components/app/page-kit/PageKit';
import { FeedTabBarSkeleton } from '@/components/app/PageSkeletons';
import { FeedCardSkeletonList } from '@/components/app/cards/FeedCardSkeleton';
import { STREAMER_BADGE_IDS, badgeMaterial, streamerBadgeSvg } from '@/lib/streamer-badge-art';

// The gallery sits outside the wallet providers; a signed-out stub is all the
// action row needs to render.
const GALLERY_AUTH = {
  isAuthenticated: false,
  walletAddress: null,
  user: null,
  openLoginModal: () => {},
} as unknown as AuthContextType;

const BadgeShowcase = lazy(() => import('@/components/app/badge-showcase/BadgeShowcase'));

// The standard public BIP-39 test vector: owns nothing, safe to show.
const SAMPLE_PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const SAMPLE_ARTICLE = {
  title: 'Why we moved our streams on-chain',
  summary: 'After two years of takedowns and payout freezes, here is what changed when our audience started paying us directly.',
  cover: '/media/ai-creator-studio-banner.jpg',
  body: [
    'The first time a platform froze our payouts, we lost three weeks of income over a copyright claim that turned out to be wrong.',
    'Moving to DeHub was not about crypto. It was about owning the relationship with the people who watch us every night.',
    '# What actually changed',
    'Tips land in our wallet the moment they are sent. **Subscribers unlock posts with a tier**, not an algorithm.',
    '> We stopped asking permission to get paid.',
    '# The numbers after 90 days',
    '- Revenue per viewer up 34%\n- Churn down for the first time in a year\n- Zero frozen payouts',
    '# What we would do differently',
    'We would have moved our [back catalogue](https://dehub.io) on day one, instead of waiting to see if the audience followed.',
  ].join('\n\n'),
};

function ArticleGallery({ onAction }: { onAction: () => void }) {
  const [title, setTitle] = useState(SAMPLE_ARTICLE.title);
  const [summary, setSummary] = useState('');
  const [body, setBody] = useState(SAMPLE_ARTICLE.body);
  return (
    <section data-article-gallery className="mb-5 grid gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        <div data-feed-item className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Article in the feed</p>
          <ArticleFeedCover title={SAMPLE_ARTICLE.title} body={SAMPLE_ARTICLE.body} coverUrl={SAMPLE_ARTICLE.cover} onOpen={onAction}>
            <p className="article-ink-2 text-[15.25px] leading-[22.5px]">{SAMPLE_ARTICLE.summary}</p>
          </ArticleFeedCover>
        </div>
        <div data-feed-item className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Article without a cover</p>
          <ArticleFeedCover title={SAMPLE_ARTICLE.title} body={SAMPLE_ARTICLE.body} onOpen={onAction}>
            <p className="article-ink-2 text-[15.25px] leading-[22.5px]">{SAMPLE_ARTICLE.summary}</p>
          </ArticleFeedCover>
        </div>
        <div data-feed-item className="flex h-[720px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
          <p className="px-4 pt-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Writing an article</p>
          <ArticleComposer
            title={title} setTitle={setTitle} summary={summary} setSummary={setSummary} body={body} setBody={setBody}
            coverPreview={SAMPLE_ARTICLE.cover} onCoverChange={onAction} onSaveDraft={onAction} onPublish={onAction}
            formReady isPosting={false} uploadProgress={0} mintAwaitingWallet={false} onAbandonMint={onAction}
          />
        </div>
      </div>
      <div data-feed-item className="rounded-2xl border border-white/10 bg-white/[0.04] p-3" data-article-reader-sample>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Reading an article</p>
        <ArticleReader
          title={SAMPLE_ARTICLE.title} body={SAMPLE_ARTICLE.body} coverUrl={SAMPLE_ARTICLE.cover}
          createdAt="2026-09-28T12:00:00Z" shareUrl="https://dehub.io/app/post/1" onComment={onAction} onTip={onAction}
        >
          <p>{SAMPLE_ARTICLE.summary}</p>
        </ArticleReader>
      </div>
    </section>
  );
}

const SAMPLE_REACTIONS: ReactionCounts = { like: 19, love: 4, hot: 2, lol: 1, dislike: 3 };

/**
 * A post's action row with its reaction tray: hover (desktop) or hold (touch)
 * the thumbs-up. One row as a stranger sees it, one as somebody who disliked
 * the post — the thumb wears their 👎, since there is no thumbs-down button.
 */
function ReactionsGallery() {
  const rows = [
    { id: '990001', label: 'No reaction yet', myReaction: null },
    { id: '990002', label: 'You disliked it', myReaction: 'dislike' as const },
  ];
  return (
    <AuthContext.Provider value={GALLERY_AUTH}>
    <section data-page-bento data-reactions-gallery className="mb-5 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
      <h2 className="mb-3 text-sm font-semibold">Reactions</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((row) => (
          <div key={row.id} data-reactions-row={row.id} className="rounded-2xl border border-white/10 bg-black/30 pt-3">
            <p className="px-3 text-xs text-zinc-500">{row.label}</p>
            <ActionBar
              postId={row.id}
              likeCount={26}
              dislikeCount={3}
              commentCount={5}
              repostCount={2}
              reactionCounts={SAMPLE_REACTIONS}
              myReaction={row.myReaction}
              isDisliked={row.myReaction === 'dislike'}
              hideUtility
            />
          </div>
        ))}
      </div>
    </section>
    </AuthContext.Provider>
  );
}

const THEMES = [
  'system', 'minimal', 'light', 'cosmic', 'hazy', 'swarms',
  'lavalamp', 'winter', 'war', 'osaka', 'jungle', 'island', 'hacker', 'horror',
] as const;

const ICONS: ThemeIconKey[] = [
  'accounts', 'ads', 'arcade', 'assistant', 'audio', 'bookmarks', 'boost', 'bounties',
  'bridge', 'buy', 'careers', 'command', 'comment-anchor', 'communities', 'dao', 'deep-current',
  'email', 'events', 'features', 'flak-jacket', 'fractions', 'front-row', 'glossary', 'governance',
  'harpoon', 'home', 'images', 'live', 'lock', 'messages', 'notifications', 'pinned',
  'posts', 'precision-strike', 'profile', 'search', 'second-wind', 'settings', 'signal-flare', 'stages',
  'staking', 'stats', 'stores', 'subscriptions', 'superpowers', 'team-up', 'timeline-bomber', 'trend-jacker',
  'trophy', 'tv', 'usernames', 'videos', 'wand', 'paint',
];

export default function StateGalleryPage() {
  const { t } = useTranslation();
  const { theme, setTheme } = useAppTheme();
  const [params, setParams] = useSearchParams();
  const requestedTheme = params.get('theme');
  const [presses, setPresses] = useState(0);
  const [badge, setBadge] = useState<{ anchor: HTMLElement | null; promote: boolean; first?: boolean } | null>(null);
  const [badgeTier, setBadgeTier] = useState(1);
  const warmBadge = () => { void preloadBadgeShowcase(badgeAnimationStyle(theme) === 'metallic' ? BADGE_ORDER[badgeTier] : undefined).catch(() => {}); };
  const press = () => setPresses((count) => count + 1);

  useEffect(() => {
    if (requestedTheme && THEMES.includes(requestedTheme as typeof THEMES[number]) && requestedTheme !== theme) {
      setTheme(requestedTheme);
    }
  }, [requestedTheme, setTheme, theme]);

  const chooseTheme = (nextTheme: typeof THEMES[number]) => {
    setTheme(nextTheme);
    setParams({ theme: nextTheme }, { replace: true });
  };

  return (
    <main
      id="app-root"
      data-theme-gallery={theme}
      data-glass-page
      className="relative z-10 min-h-screen px-5 py-8 text-white sm:px-8"
      style={theme === 'cosmic' ? {
        backgroundColor: '#03030a',
        backgroundImage: 'radial-gradient(circle at 75% 5%, rgb(77 47 145 / 0.28), transparent 42%), radial-gradient(circle at 10% 80%, rgb(21 89 123 / 0.22), transparent 38%)',
      } : undefined}
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">Universal app states</p>
            <h1 className="mt-2 text-3xl font-semibold capitalize">{theme} theme</h1>
            <p className="mt-2 max-w-xl text-sm text-zinc-500">
              One semantic system, with the icon material owned by the active theme.
            </p>
          </div>
          <div className="flex max-w-2xl flex-wrap justify-end gap-2">
            {THEMES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => chooseTheme(item)}
                className={`rounded-full border px-3 py-1.5 text-xs capitalize backdrop-blur-xl transition ${
                  item === theme ? 'border-white/35 bg-white/15' : 'border-white/10 bg-white/5 text-zinc-500'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <StreamerArtworkGallery />

        <section data-page-bento data-badge-gallery className="mb-5 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
          <h2 className="mb-3 text-sm font-semibold">Badge animations</h2>
          <div className="flex flex-wrap items-center gap-3">
            <select aria-label="Badge tier" value={badgeTier} onChange={event => setBadgeTier(Number(event.target.value))}
              className="rounded-lg border border-white/15 bg-background p-2 text-sm">
              {BADGE_ORDER.map((tier, index) => <option key={tier} value={index}>{index + 1}. {tier}</option>)}
            </select>
            <button className="flex items-center gap-2 p-2" onPointerEnter={warmBadge} onFocus={warmBadge} onTouchStart={warmBadge} onClick={event => setBadge({ anchor: event.currentTarget.querySelector('img'), promote: false })}>
              <img src={badgeImage(BADGE_ORDER[badgeTier]) ?? ''} alt="" className="h-10 w-10" /> Open badge
            </button>
            <button className="flex items-center gap-2 p-2" onClick={event => setBadge({ anchor: event.currentTarget.querySelector('img'), promote: true })}>
              <img src={badgeImage(BADGE_ORDER[Math.max(0, badgeTier - 1)]) ?? ''} alt="" className="h-10 w-10" /> Promote badge
            </button>
            <button className="p-2" onClick={() => setBadge({ anchor: null, promote: true, first: true })}>First badge</button>
          </div>
          <div data-inline-badge-gallery className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[12, 14, 16, 24].map(size => (
              <div key={size} data-badge-font-size={size} className="space-y-3">
                <p className="text-xs text-zinc-500">{size}px names</p>
                {BADGE_ORDER.map(tier => (
                  <span key={tier} data-badge-sample={tier} className="flex items-baseline gap-1" style={{ fontSize: size, lineHeight: 1.4 }}>
                    <span className="font-semibold">H {tier}</span>
                    <BadgeIcon src={badgeImage(tier)} />
                  </span>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-4" data-badge-font-inheritance>
            <BadgedName badgeBalance={50_000_000} className="text-xs font-semibold">H Compact name</BadgedName>
            <BadgedName badgeBalance={50_000_000} className="text-2xl font-bold">H Profile name</BadgedName>
          </div>
        </section>
        {badge && <Suspense fallback={null}>
          <BadgeShowcase tier={badge.first ? 'Crab' : BADGE_ORDER[badgeTier]} anchor={badge.anchor}
            promotedFrom={badge.promote ? badge.first || badgeTier === 0 ? null : BADGE_ORDER[badgeTier - 1] : undefined} onClose={() => setBadge(null)} />
        </Suspense>}

        <section data-page-bento className="mb-5 rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Semantic icon family</p>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-8" data-theme-icon-grid>
            {ICONS.map((icon) => (
              <div key={icon} className="flex min-w-0 flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <ThemedIcon icon={icon} alt="" className="h-12 w-12 object-contain" />
                <span className="max-w-full truncate text-[10px] capitalize text-zinc-500">{icon}</span>
              </div>
            ))}
          </div>
        </section>

        <section data-home-loading-gallery className="mb-5">
          <h2 className="mb-3 text-sm font-semibold">Home loading</h2>
          <div className="max-w-2xl mx-auto">
            <FeedTabBarSkeleton />
            <div data-feed-root className="p-2 sm:p-3 pt-0 sm:pt-0">
              <FeedCardSkeletonList count={3} columns={1} />
            </div>
          </div>
        </section>

        <PageKitGallery />

        <section data-page-bento className="mb-5 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
          <h2 className="mb-3 text-sm font-semibold">Theme controls</h2>
          <div className="flex flex-wrap items-center gap-3" data-theme-control-grid>
            <Button onClick={press}>Primary</Button>
            <Button variant="secondary" onClick={press}>Secondary</Button>
            <Button variant="outline" onClick={press}>Outline</Button>
            <Button variant="glass" onClick={press}>Glass</Button>
            <Button variant="ghost" onClick={press}>Ghost</Button>
            <Button variant="destructive" onClick={press}>Destructive</Button>
            <Button disabled>Disabled</Button>
            <button className="rounded-xl bg-white px-4 py-2 text-black" onClick={press}>Neutral white</button>
            <button className="rounded-xl bg-zinc-800 px-4 py-2 text-white" onClick={press}>Neutral zinc</button>
            <button className="rounded-xl bg-gradient-to-br from-white/20 via-white/10 to-white/5 border border-white/30 px-4 py-2 text-white" onClick={press}>Neutral gradient</button>
            <button data-primary-cta data-nav-create className="rounded-2xl bg-zinc-900/90 border border-white/30 px-4 py-3" onClick={press}>
              <div className="flex items-center justify-center gap-2 font-semibold text-white">
                <PenSquare className="h-[18px] w-[18px]" />
                <span>{t('nav.create')}</span>
              </div>
            </button>
            <LiquidGlassBubble2 label="Bubble action" onClick={press} />
            <LiquidGlassBubble2 label="Active bubble" active onClick={press} />
            <LiquidGlassBubble2 label="Disabled bubble" disabled onClick={press} />
            <button className="rounded-xl bg-red-600 px-4 py-2 text-white" onClick={press}>Semantic red</button>
            <button className="rounded-xl px-4 py-2 hover:bg-white/10" onClick={press}>Bare action</button>
          </div>
          <output aria-live="polite" className="mt-3 block text-xs">Actions fired: {presses}</output>
        </section>

        <section data-page-bento className="mb-5 rounded-3xl border border-white/10 bg-white/[0.04] p-4" data-wallet-backup-gallery>
          <h2 className="mb-3 text-sm font-semibold">Wallet backup</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <SeedPhraseBackup phrase={SAMPLE_PHRASE} variant="signup" onFinished={press} />
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <SeedPhraseBackup phrase={SAMPLE_PHRASE} variant="settings" onFinished={press} />
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <SeedPhraseBackup phrase={SAMPLE_PHRASE} variant="signup" initialStage="check" onFinished={press} />
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <PrivateKeyBackup privateKey={`0x${'01'.repeat(32)}`} hasPhrase={false} onFinished={press} />
            </div>
          </div>
          <div className="mt-5 max-w-xl">
            <BackupReminderCard onBackUp={press} onLater={press} />
          </div>
        </section>

        <ReactionsGallery />

        <ArticleGallery onAction={press} />

        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div data-page-bento className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl">
            <AppState
              icon="communities"
              title="No communities yet"
              description="Communities you join will appear here."
              size="section"
              primaryAction={{ label: 'Explore communities', onClick: () => undefined }}
            />
          </div>
          <div data-page-bento className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl">
            <AppState
              icon="search"
              title="No results found"
              description="Try a different search or remove a filter."
              kind="search-empty"
              size="section"
            />
          </div>
          <div data-page-bento className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl">
            <AppState
              icon="notifications"
              title="Content could not load"
              description="Check your connection and try again."
              kind="error"
              size="section"
              primaryAction={{ label: 'Try again', onClick: () => undefined }}
            />
          </div>
          <div data-page-bento className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl">
            <AppState
              icon="lock"
              title="Approval pending"
              description="This content appears after your request is approved."
              kind="restricted"
              size="section"
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function StreamerArtworkGallery() {
  const { theme } = useAppTheme();
  const { t } = useTranslation();
  const instance = useId();
  const material = badgeMaterial(theme);
  return (
    <section data-page-bento data-streamer-gallery className="mb-5 rounded-3xl border p-4" style={{ background: material.panel, color: material.text, borderColor: material.edge }}>
      <h2 className="mb-3 text-sm font-semibold">{t('live.progress.cardsTitle')}</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {STREAMER_BADGE_IDS.map(id => (
          <div key={id} data-streamer-art={id} className="flex flex-col items-center gap-2 text-center">
            <div aria-hidden className="h-24 w-24 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: streamerBadgeSvg(id, theme, true, instance) }} />
            <span className="text-xs font-medium">{t(`live.progress.card.${id}.name`)}</span>
            <div className="flex items-center gap-3" aria-hidden>
              <span className="h-4 w-4 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: streamerBadgeSvg(id, theme, true, `${instance}-inline`, 'compact') }} />
              <span className="h-8 w-8 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: streamerBadgeSvg(id, theme, false, `${instance}-locked`) }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The shared page kit (components/app/page-kit) in the active theme. */
function PageKitGallery() {
  const [tab, setTab] = useState<'browse' | 'mine' | 'sell'>('browse');
  return (
    <section data-page-bento data-page-kit-gallery className="mb-5 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
      <h2 className="mb-3 text-sm font-semibold">Page kit</h2>
      <div className="space-y-3">
        <PageTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'browse', label: 'Browse', icon: 'search' },
            { id: 'mine', label: 'Mine', icon: 'usernames' },
            { id: 'sell', label: 'Sell', icon: 'stores' },
          ]}
        />
        <PageSection eyebrow="Treasury balance" title="Section title">
          <p className="text-sm text-zinc-400">Sections are rounded bentos on canvas themes and full width between hairlines on System phones.</p>
        </PageSection>
        <div className="flex gap-2">
          <KitButton>Primary</KitButton>
          <KitButton variant="quiet">Quiet</KitButton>
        </div>
        <PageEmpty icon="stores" title="No listings yet" body="Be the first to sell something." />
      </div>
    </section>
  );
}

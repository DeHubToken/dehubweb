import { FeedSwallowMotion } from '@/components/app/feeds/FeedSwallowMotion';
import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Page kit
 * ========
 * The shared building blocks every app page uses to match the home feed:
 *
 * - PageIsland   the floating glass title pill (back, icon, title, actions)
 *                with an optional tab row inside it. Sticky, like the home
 *                capsule, and painted by the same nav glass on every theme.
 * - PageTabs     squared tab chips (10px corners, like the feed buttons).
 * - PageBody     the scrolling content column under the island.
 * - PageSection  one block of content. A rounded bento on the canvas themes,
 *                full width between hairlines on System phones, like posts.
 * - PageEmpty    the standard empty / error / signed-out state.
 *
 * All the theme work lives in src/styles/page-kit.css, keyed on the data-kit
 * attributes below, so a page never paints itself per theme.
 */

import { Fragment, createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import ArrowLeft from "@/components/ui/cut-icons/back";

import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { GlassIndicator } from '@/components/app/feeds/GlassIndicator';
import { useTabIndicator } from '@/hooks/use-tab-indicator';

/**
 * Phones (below lg) draw every page's island as the home feed's top pill:
 * same glass capsule, same icon tabs, same sliding glass indicator. Only what
 * sits inside it changes from page to page. Desktop keeps the island.
 */
const PHONE_QUERY = '(max-width: 1023px)';
function subscribePhone(cb: () => void) {
  const mql = window.matchMedia(PHONE_QUERY);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}
function usePhonePill() {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

/** True inside the phone pill, so tabs and actions draw in the home pill's style. */
const PillContext = createContext(false);

type IconKey = Parameters<typeof ThemedIcon>[0]['icon'];

export interface PageIslandProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** A theme icon key (drawn in every theme's style) or a custom node. */
  icon?: IconKey | ReactNode;
  /** Show the back square. Defaults to off: pages opened from the menu have none. */
  back?: boolean;
  /** Where back goes when there is no history (direct link). */
  backFallback?: string;
  onBack?: () => void;
  /** Square action buttons on the right. Use <IslandAction>. */
  actions?: ReactNode;
  /** A row under the title, usually <PageTabs>. */
  tabs?: ReactNode;
  /** Anything else inside the island under the tabs (search, filters). */
  children?: ReactNode;
  className?: string;
}

export function PageIsland({
  title,
  subtitle,
  icon,
  back = false,
  backFallback = '/app',
  onBack,
  actions,
  tabs,
  children,
  className,
}: PageIslandProps) {
  const { t: _copy } = _useCopy();
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    if (onBack) return onBack();
    if (location.key && location.key !== 'default') navigate(-1);
    else navigate(backFallback, { replace: true });
  };

  const phone = usePhonePill();
  if (phone) {
    return (
      <div data-feed-nav-outer data-kit-pill-outer className={cn('sticky top-11 z-50 px-2 pt-1 pb-2 sm:px-3', className)}>
        <div
          data-feed-nav
          data-kit-pill
          className="relative flex flex-col rounded-xl bg-zinc-900"
          style={{ overflowX: 'clip', overflowClipMargin: '8px' }}
        >
          <span data-nav-glass-backdrop aria-hidden="true" />
          <PillContext.Provider value>
            <div className="relative z-20 flex min-h-[40px] min-w-0 items-center">
              {back ? (
                <button
                  type="button"
                  data-kit-pill-lead
                  data-swipe-back
                  onClick={handleBack}
                  aria-label={_copy("copy.6aadac2f2b7a", { defaultValue: "Go back" })}
                  className="relative flex shrink-0 items-center justify-center rounded-xl px-3 py-2.5 text-zinc-400 transition-colors [@media(hover:hover)]:hover:bg-white/5 [@media(hover:hover)]:hover:text-white"
                >
                  <ArrowLeft className="relative z-10 h-4 w-4" />
                </button>
              ) : icon ? (
                <span data-kit-pill-lead className="flex shrink-0 items-center justify-center pl-2.5 pr-1.5">
                  {typeof icon === 'string' ? (
                    <ThemedIcon icon={icon as IconKey} alt="" className="h-6 w-6 object-contain" />
                  ) : (
                    <span className="flex h-6 w-6 items-center justify-center [&>*]:h-6 [&>*]:w-6">{icon}</span>
                  )}
                </span>
              ) : null}
              {tabs ? (
                <>
                  <h1 className="sr-only">{title}</h1>
                  <div data-kit-pill-tabs-slot className="min-w-0 flex-1">{tabs}</div>
                </>
              ) : (
                <h1 data-kit-title className="min-w-0 flex-1 truncate px-1.5 text-[15px] font-semibold leading-tight text-white">{title}</h1>
              )}
              {actions ? <div data-kit-pill-actions className="flex shrink-0 items-center">{actions}</div> : null}
            </div>
          </PillContext.Provider>
        </div>
        {children ? <div data-kit-pill-extra className="mt-2 space-y-2">{children}</div> : null}
      </div>
    );
  }

  return (
    <div data-feed-nav-outer data-kit-island-outer className={cn('sticky top-11 lg:top-0 z-50', className)}>
      <div data-page-bento data-kit-island className="rounded-[22px] bg-zinc-900 px-3 pt-3 pb-2.5">
        <span data-nav-glass-backdrop aria-hidden="true" />
        <div className="flex min-h-9 items-center gap-2.5">
          {back && (
            <button type="button" data-kit-square data-swipe-back onClick={handleBack} aria-label={_copy("copy.6aadac2f2b7a", { defaultValue: "Go back" })} className="-ml-0.5">
              <ArrowLeft className="h-[18px] w-[18px]" />
            </button>
          )}
          {icon ? (
            <span data-kit-island-icon className="flex h-8 w-8 shrink-0 items-center justify-center">
              {typeof icon === 'string' ? (
                <ThemedIcon icon={icon as IconKey} alt="" className="h-8 w-8 object-contain" />
              ) : (
                icon
              )}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 data-kit-title className="truncate text-[17px] font-bold leading-tight text-white">{title}</h1>
            {subtitle ? (
              <p data-kit-subtitle className="truncate text-[11.5px] leading-snug text-zinc-500">{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
        </div>
        {tabs ? <div className="mt-2.5">{tabs}</div> : null}
        {children ? <div className="mt-2.5 space-y-2.5">{children}</div> : null}
      </div>
    </div>
  );
}

export function IslandAction({
  label,
  onClick,
  children,
  active,
  disabled,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  const inPill = useContext(PillContext);
  if (inPill) {
    return (
      <button
        type="button"
        data-kit-pill-action
        data-active={active ? 'true' : undefined}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        title={label}
        className={cn(
          'relative flex shrink-0 items-center justify-center rounded-xl px-2.5 py-2.5 transition-colors disabled:opacity-40 [@media(hover:hover)]:hover:bg-white/5 [@media(hover:hover)]:hover:text-white [&_svg]:!h-4 [&_svg]:!w-4 [&_svg]:!text-current',
          active ? 'text-white' : 'text-zinc-400',
        )}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      type="button"
      data-kit-square
      data-active={active ? 'true' : undefined}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

export interface PageTab<T extends string = string> {
  id: T;
  label: ReactNode;
  icon?: IconKey | ReactNode;
  count?: number;
}

export function PageTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
  size = 'md',
  beforeTabs,
}: {
  tabs: PageTab<NoInfer<T>>[];
  value: T;
  onChange: (id: NoInfer<T>) => void;
  className?: string;
  size?: 'sm' | 'md';
  /** Leading controls on the same row, before the category tabs. */
  beforeTabs?: ReactNode;
}) {
  const inPill = useContext(PillContext);
  const layoutId = useId();
  const { layerRef, setRef, rect, onScroll } = useTabIndicator(value, inPill, undefined, 5);
  const [glide, setGlide] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!inPill || !el) return;
    const check = () => {
      setOverflow(el.scrollWidth - el.clientWidth > 2 && el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
      // The glass tile sits outside the scrolling row, so it is re-placed when
      // the row scrolls or first gets its size (a page that mounts before its
      // row can be measured otherwise never shows the tile).
      onScroll();
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.addEventListener('scroll', check, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener('scroll', check); };
  }, [inPill, tabs.length, onScroll]);
  if (inPill) {
    return (
      <div className="flex min-w-0 items-center">
        {beforeTabs ? <div data-kit-pill-before className="flex shrink-0 items-center [&_[data-kit-square]]:contents">{beforeTabs}</div> : null}
        <div ref={layerRef} className="relative min-w-0 flex-1 overflow-visible">
          <div className="pointer-events-none absolute inset-0">
            <GlassIndicator rect={rect} borderRadius="0.75rem" layoutKey={`kit-pill-${layoutId}-${value}`} enableTransition={glide} fixedHeightPx={35} variant="nav" />
          </div>
          <div
            ref={scrollRef}
            role="tablist"
            data-kit-tabs
            data-kit-pill-tabs
            data-overflow={overflow ? 'true' : undefined}
            className={cn('scrollbar-hide relative z-20 flex overflow-x-auto data-[overflow=true]:[mask-image:linear-gradient(90deg,#000_calc(100%-28px),transparent)]', className)}
          >
            {tabs.map((tab) => {
              const active = tab.id === value;
              const iconOnly = !!tab.icon;
              return (
                <button
                  key={tab.id}
                  ref={setRef(tab.id)}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  data-feed-tab-btn
                  data-active={active ? 'true' : undefined}
                  onClick={() => {
                    if (!active) {
                      setGlide(true);
                      window.setTimeout(() => setGlide(false), 450);
                    }
                    onChange(tab.id);
                  }}
                  className={cn(
                    'relative z-10 flex flex-1 shrink-0 items-center justify-center rounded-xl py-2.5 text-[13px] font-semibold transition-colors',
                    iconOnly ? 'min-w-[32px] px-2' : 'whitespace-nowrap px-3',
                    active ? 'text-white' : 'text-zinc-400 [@media(hover:hover)]:hover:text-white',
                  )}
                >
                  {tab.icon ? (
                    <span className="relative z-10 flex h-4 w-4 items-center justify-center [&_img]:h-4 [&_img]:w-4 [&_svg]:h-4 [&_svg]:w-4">
                      {typeof tab.icon === 'string' ? <ThemedIcon icon={tab.icon as IconKey} alt="" className="h-4 w-4 object-contain" /> : tab.icon}
                    </span>
                  ) : null}
                  <span className={iconOnly ? 'sr-only' : 'relative z-10'}>{tab.label}</span>
                  {typeof tab.count === 'number' ? (
                    <span data-kit-pill-count className="absolute right-1 top-1 z-20 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold leading-none text-black">{tab.count > 99 ? '99+' : tab.count}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div
      role="tablist"
      data-kit-tabs
      // `relative` keeps icon-only tabs' sr-only labels (position: absolute)
      // inside this scroller. Without it they escape to the nearest scroll
      // container — the bell drawer — and widen it, so the whole drawer pans
      // sideways on iPhone.
      className={cn('scrollbar-hide relative -mx-0.5 flex items-center gap-1.5 overflow-x-auto px-0.5', className)}
    >
      {beforeTabs}
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
            <Fragment key={tab.id}>
            <button
              type="button"
              role="tab"
              aria-selected={active}
              data-kit-chip
              data-size={size}
              data-active={active ? 'true' : undefined}
              onClick={() => onChange(tab.id)}
            >
              {tab.icon ? (
                typeof tab.icon === 'string' ? (
                  <ThemedIcon icon={tab.icon as IconKey} alt="" className="h-4 w-4 object-contain" />
                ) : (
                  tab.icon
                )
              ) : null}
              <span>{tab.label}</span>
              {typeof tab.count === 'number' ? <span data-kit-chip-count>{tab.count}</span> : null}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * The content column under the island. Swallows scrolled content at the
 * island's top edge on the glass themes, like the home feed under its pill.
 */
export function PageBody({
  children,
  className,
  measure,
  frameClip,
}: {
  children: ReactNode;
  className?: string;
  /** Keep a readable width (forms, articles) instead of filling the column. */
  measure?: boolean;
  /** Cut under the island with a per-scroll clip instead of scroll-driven
   *  transforms. For bodies inside their own scroller (the bell drawer),
   *  where iOS WebKit leaves the transformed layers unpainted. */
  frameClip?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(ref, '[data-kit-island-outer] > [data-page-bento]', [], { allThemes: true, frameOnly: frameClip });
  return (
    <div data-feed-swallow-bounds className="w-full">
    <div ref={ref} data-kit-body className={cn('w-full pb-28 pt-3', measure && 'max-w-2xl', className)}>
      <FeedSwallowMotion>
      {children}
      </FeedSwallowMotion>
    </div>
    </div>
  );
}

export function PageSection({
  title,
  eyebrow,
  action,
  children,
  className,
  flush,
  as: Tag = 'section',
}: {
  title?: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** No inner padding (lists that draw their own rows edge to edge). */
  flush?: boolean;
  as?: 'section' | 'div';
}) {
  return (
    <Tag data-page-bento data-kit-section className={cn('rounded-xl bg-zinc-900', !flush && 'p-4', className)}>
      {title || eyebrow || action ? (
        <header className={cn('mb-3 flex items-end justify-between gap-3', flush && 'px-4 pt-4')}>
          <div className="min-w-0">
            {eyebrow ? <p data-kit-eyebrow className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{eyebrow}</p> : null}
            {title ? <h2 className="truncate text-[15px] font-semibold text-white">{title}</h2> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      {children}
    </Tag>
  );
}

export function PageEmpty({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: IconKey | ReactNode;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div data-kit-empty className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      {icon ? (
        <span className="mb-4 flex h-14 w-14 items-center justify-center">
          {typeof icon === 'string' ? (
            <ThemedIcon icon={icon as IconKey} alt="" className="h-14 w-14 object-contain" />
          ) : (
            icon
          )}
        </span>
      ) : null}
      <p className="text-[15px] font-semibold text-white">{title}</p>
      {body ? <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-zinc-500">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** The main call to action: white on System, the theme colour elsewhere. */
export function KitButton({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'quiet';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}) {
  return (
    <button type={type} data-kit-button={variant} onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  );
}

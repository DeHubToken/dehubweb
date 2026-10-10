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

import { useRef, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';

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

  return (
    <div data-feed-nav-outer data-kit-island-outer className={cn('sticky top-11 lg:top-0 z-50', className)}>
      <div data-page-bento data-kit-island className="rounded-[15px] bg-zinc-900 px-3 py-2.5">
        <div className="flex min-h-9 items-center gap-2.5">
          {back && (
            <button type="button" data-kit-square onClick={handleBack} aria-label={_copy("copy.6aadac2f2b7a", { defaultValue: "Go back" })} className="-ml-0.5">
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
}: {
  tabs: PageTab<NoInfer<T>>[];
  value: T;
  onChange: (id: NoInfer<T>) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="tablist"
      data-kit-tabs
      className={cn('scrollbar-hide -mx-0.5 flex items-center gap-1.5 overflow-x-auto px-0.5', className)}
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
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
}: {
  children: ReactNode;
  className?: string;
  /** Keep a readable width (forms, articles) instead of filling the column. */
  measure?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(ref, '[data-kit-island-outer] > [data-page-bento]');
  return (
    <div ref={ref} data-kit-body className={cn('w-full pb-28 pt-3', measure && 'max-w-2xl', className)}>
      {children}
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

/**
 * Explore on phones: one titled section of the clean list.
 *
 * No box. A themed icon, the title, and a quiet text action on the right
 * ("See all", "Clear"), then the rows. Sections are split by one hairline and
 * share the page gutter, so every left edge on the page lines up.
 *
 * @module components/app/explore/ExploreListSection
 */
import type { ReactNode } from 'react';
import { ThemedIcon, type ThemeIconKey } from '@/components/app/war/WarHudIcon';
import ChevronRight from '@/components/ui/cut-icons/next';
import { cn } from '@/lib/utils';

export function ExploreListSection({
  icon,
  title,
  action,
  onAction,
  chevron = true,
  children,
  id,
  className,
  ...rest
}: {
  icon: ThemeIconKey;
  title: ReactNode;
  /** Text on the right, e.g. "See all". Leave out for none. */
  action?: ReactNode;
  onAction?: () => void;
  /** Draw the small arrow after the action text. */
  chevron?: boolean;
  children: ReactNode;
  id?: string;
  className?: string;
} & Record<`data-${string}`, string | boolean | undefined>) {
  return (
    <section id={id} data-explore-list-section className={cn('px-1 py-4', className)} {...rest}>
      <header className="mb-1.5 flex items-center gap-2.5">
        <ThemedIcon icon={icon} className="h-6 w-6 shrink-0 object-contain" />
        <h2 className="min-w-0 flex-1 truncate text-[17px] font-bold leading-tight text-white">{title}</h2>
        {action && onAction ? (
          <button
            type="button"
            data-explore-list-action
            onClick={onAction}
            className="-my-2 -mr-1 flex shrink-0 items-center gap-0.5 px-1 py-2 text-[13px] font-medium text-zinc-400"
          >
            {action}
            {chevron && <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/**
 * Clean list kit (phone concepts)
 * ===============================
 * The pieces Explore's clean list is made of, for other phone pages to try the
 * same look: word tabs with an underline, titled sections on one gutter split
 * by a hairline, and plain rows (lead, two lines, trail). No boxes.
 *
 * Concepts only: a page shows its clean version on phones when the address
 * carries ?concept=clean. Desktop never changes.
 *
 * @module components/app/clean/CleanKit
 */
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { usePhonePill } from '@/components/app/page-kit/PageKit';
import { ExploreListSection } from '@/components/app/explore/ExploreListSection';
import { cn } from '@/lib/utils';

export const CleanSection = ExploreListSection;

/** True on phones when the address asks for the clean concept. */
export function useCleanConcept(): boolean {
  const phone = usePhonePill();
  const [params] = useSearchParams();
  return phone && params.get('concept') === 'clean';
}

export interface CleanWord<T extends string> {
  id: T;
  label: ReactNode;
  count?: number;
}

/** Word tabs under the pill: lit word bold with an underline that slides. */
export function CleanWords<T extends string>({
  items,
  value,
  onChange,
  layoutId,
  size = 'md',
  className,
}: {
  items: CleanWord<T>[];
  value: T;
  onChange: (id: T) => void;
  layoutId: string;
  /** sm: a quieter second row (periods, sorts). */
  size?: 'md' | 'sm';
  className?: string;
}) {
  return (
    <div data-clean-words data-fade-edges className={cn(size === 'md' && 'border-b border-zinc-800/60', className)}>
      <div className={cn('flex overflow-x-auto px-1 scrollbar-hide', size === 'md' ? 'gap-5' : 'gap-4')} role="tablist">
        {items.map((item) => {
          const active = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(item.id)}
              className={cn(
                'relative flex shrink-0 items-center gap-1.5 whitespace-nowrap transition-colors',
                size === 'md' ? 'pb-2.5 pt-1.5 text-[15px]' : 'py-1.5 text-[13px]',
                active ? 'font-semibold text-white' : 'font-medium text-zinc-500',
              )}
            >
              {item.label}
              {item.count ? (
                <span className={cn('tabular-nums', active ? 'text-zinc-300' : 'text-zinc-600')}>{item.count}</span>
              ) : null}
              {active && size === 'md' && (
                <motion.span
                  layoutId={layoutId}
                  className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-white"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              )}
              {active && size === 'sm' && (
                <motion.span
                  layoutId={layoutId}
                  className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-zinc-400"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** One line of a clean list: lead, title over a quiet line, trail. */
export function CleanRow({
  rank,
  lead,
  title,
  sub,
  trail,
  onClick,
  className,
}: {
  rank?: ReactNode;
  lead?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  trail?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      data-clean-row
      className={cn('flex w-full min-w-0 items-center gap-3 py-2.5 text-left', className)}
    >
      {rank !== undefined && (
        <span className="w-5 shrink-0 text-center text-[13px] font-semibold tabular-nums text-zinc-500">{rank}</span>
      )}
      {lead}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold leading-tight text-white">{title}</span>
        {sub ? <span className="mt-0.5 block truncate text-[12.5px] text-zinc-500">{sub}</span> : null}
      </span>
      {trail}
    </Tag>
  );
}

/** Quiet text button at the end of a list ("Show more"). */
export function CleanMore({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-1 py-1.5 text-[13px] font-medium text-zinc-400">
      {children}
    </button>
  );
}

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * One material for every inline control on the settings page — select
 * triggers, small action buttons, the follow-requests button. `bg-zinc-800` is
 * the hook the glass themes frost inside a bento and the light theme
 * hairlines, so this is the themed control surface, not just the dark one.
 */
export const SETTINGS_CONTROL_CLASS =
  'h-9 rounded-xl border border-zinc-700 bg-zinc-800 px-3 text-sm font-medium text-white shadow-none backdrop-blur-none transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-zinc-800';

/** Full-width form fields (profile, social links). Same material, one size. */
export const SETTINGS_FIELD_CLASS =
  'h-10 rounded-xl border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500';

/**
 * Action button that sits beside an input inside a settings form row. Same
 * material as SETTINGS_CONTROL_CLASS, sized to SETTINGS_FIELD_CLASS: a
 * `size="sm"` button is 36px and reads a notch short next to a 40px field.
 */
export const SETTINGS_INLINE_ACTION_CLASS =
  'h-10 shrink-0 rounded-xl border border-zinc-700 bg-zinc-800 px-3 text-sm font-medium text-white shadow-none backdrop-blur-none transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-zinc-800';

/** Form field label: one weight, one colour, one gap to its field. */
export const SETTINGS_LABEL_CLASS = 'mb-1.5 block text-sm font-medium text-white';

/** Section heading above a group of rows. */
export const SETTINGS_HEADING_CLASS = 'mb-4 flex items-center gap-2 text-sm font-medium text-zinc-400';

interface SettingsRowProps {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /**
   * `label` wraps a switch so the whole row toggles it; `button` makes the
   * whole row the action (Support links, copy-address) and gets a hover wash
   * that bleeds 8px past the text so the content column stays flush with the
   * non-interactive rows around it.
   */
  as?: 'div' | 'label' | 'button';
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  /** Search anchor — see src/lib/settings-search.ts. */
  anchor?: string;
}

/**
 * Shared alignment contract for settings rows.
 *
 * Icon and title share a 20px line, so the icon carries no offset. The action
 * is centred on the row: a 24px switch or a 36px button next to a one-line
 * title used to hang off the top edge, and next to a three-line description
 * it sat a full line above where the eye expects it.
 */
export function SettingsRow({
  icon,
  title,
  description,
  action,
  as: Component = 'div',
  onClick,
  className,
  disabled = false,
  anchor,
}: SettingsRowProps) {
  const interactive = Component === 'button';
  return (
    <Component
      data-setting-anchor={anchor}
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      disabled={interactive ? disabled : undefined}
      className={cn(
        'grid w-full min-w-0 grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-x-3 text-left',
        interactive &&
          '-mx-2 w-[calc(100%+1rem)] rounded-xl px-2 py-2 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
        disabled ? 'cursor-default opacity-60' : undefined,
        className,
      )}
    >
      <span className="flex size-5 shrink-0 items-center justify-center text-zinc-500 [&_img]:size-5 [&_img]:shrink-0 [&_svg]:size-5 [&_svg]:shrink-0">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block break-words font-medium leading-5 text-white">{title}</span>
        {description ? (
          <span className="mt-0.5 block break-words text-sm leading-5 text-zinc-500">
            {description}
          </span>
        ) : null}
      </span>
      {action ? (
        <span className="ml-2 flex min-h-5 shrink-0 items-center justify-end self-center">
          {action}
        </span>
      ) : null}
    </Component>
  );
}

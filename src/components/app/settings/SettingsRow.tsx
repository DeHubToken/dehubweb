import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface SettingsRowProps {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  as?: 'div' | 'label';
  className?: string;
  disabled?: boolean;
  /** Search anchor — see src/lib/settings-search.ts. */
  anchor?: string;
}

/** Shared alignment contract for settings rows. */
export function SettingsRow({
  icon,
  title,
  description,
  action,
  as: Component = 'div',
  className,
  disabled = false,
  anchor,
}: SettingsRowProps) {
  return (
    <Component
      data-setting-anchor={anchor}
      className={cn(
        'grid w-full min-w-0 grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-x-3',
        disabled ? 'cursor-default opacity-60' : undefined,
        className,
      )}
    >
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-zinc-500 [&_img]:size-5 [&_img]:shrink-0 [&_svg]:size-5 [&_svg]:shrink-0">
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
        <span className="ml-1 flex min-h-5 shrink-0 items-start justify-end self-start">
          {action}
        </span>
      ) : null}
    </Component>
  );
}

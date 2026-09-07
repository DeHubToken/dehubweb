import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ThemedIcon, type ThemeIconKey } from '@/components/app/war/WarHudIcon';

export type AppStateKind = 'empty' | 'search-empty' | 'error' | 'restricted';
export type AppStateSize = 'page' | 'section' | 'drawer' | 'compact';

export interface AppStateAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
}

interface AppStateProps {
  icon?: ThemeIconKey;
  iconAlt?: string;
  title: string;
  description?: string;
  kind?: AppStateKind;
  size?: AppStateSize;
  primaryAction?: AppStateAction;
  secondaryAction?: AppStateAction;
  className?: string;
  iconClassName?: string;
  testId?: string;
}

const layoutBySize: Record<AppStateSize, string> = {
  page: 'min-h-[360px] py-20 px-5',
  section: 'min-h-48 py-12 px-5',
  drawer: 'min-h-40 py-10 px-4',
  compact: 'min-h-20 py-5 px-3',
};

const iconBySize: Record<AppStateSize, string> = {
  page: 'h-20 w-20 mb-5',
  section: 'h-16 w-16 mb-4',
  drawer: 'h-14 w-14 mb-3',
  compact: 'h-8 w-8 mb-2',
};

const titleBySize: Record<AppStateSize, string> = {
  page: 'text-xl',
  section: 'text-lg',
  drawer: 'text-base',
  compact: 'text-sm',
};

export function AppState({
  icon,
  iconAlt = '',
  title,
  description,
  kind = 'empty',
  size = 'section',
  primaryAction,
  secondaryAction,
  className,
  iconClassName,
  testId,
}: AppStateProps) {
  const isError = kind === 'error';
  const compact = size === 'compact';

  return (
    <div
      data-app-state={kind}
      data-app-state-size={size}
      data-testid={testId}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className={cn(
        'flex w-full flex-col items-center justify-center text-center',
        layoutBySize[size],
        className,
      )}
    >
      {icon && (
        <ThemedIcon
          icon={icon}
          alt={iconAlt}
          decoding="async"
          className={cn('shrink-0 object-contain opacity-90', iconBySize[size], iconClassName)}
        />
      )}
      <p className={cn('font-medium text-white', titleBySize[size])}>{title}</p>
      {description && (
        <p className={cn(
          'mt-1.5 max-w-sm text-zinc-500',
          compact ? 'text-xs' : 'text-sm',
        )}>
          {description}
        </p>
      )}
      {(primaryAction || secondaryAction) && (
        <div className={cn('flex flex-wrap items-center justify-center gap-2', compact ? 'mt-3' : 'mt-5')}>
          {primaryAction && (
            <Button
              type="button"
              size="sm"
              variant="glass"
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled}
              loading={primaryAction.loading}
            >
              {primaryAction.icon}
              {primaryAction.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={secondaryAction.onClick}
              disabled={secondaryAction.disabled}
              loading={secondaryAction.loading}
            >
              {secondaryAction.icon}
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

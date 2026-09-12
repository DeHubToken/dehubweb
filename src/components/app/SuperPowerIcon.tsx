import type { ComponentProps } from 'react';
import type { SuperPowerKey } from '@/lib/api/dehub/superpowers';
import { ThemedIcon, type ThemeIconKey } from '@/components/app/war/WarHudIcon';

const POWER_ICONS: Record<SuperPowerKey, ThemeIconKey> = {
  boost: 'boost',
  second_wind: 'second-wind',
  comment_anchor: 'comment-anchor',
  trend_jacker: 'trend-jacker',
  timeline_bomber: 'timeline-bomber',
  signal_flare: 'signal-flare',
  flak_jacket: 'flak-jacket',
  precision_strike: 'precision-strike',
  harpoon: 'harpoon',
  team_up: 'team-up',
  front_row: 'front-row',
  deep_current: 'deep-current',
};

type SuperPowerIconProps = Omit<ComponentProps<typeof ThemedIcon>, 'icon'> & {
  power: SuperPowerKey;
};

export function SuperPowerIcon({ power, ...props }: SuperPowerIconProps) {
  return <ThemedIcon icon={POWER_ICONS[power]} {...props} />;
}

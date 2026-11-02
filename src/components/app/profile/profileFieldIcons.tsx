import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';
import World from '@/components/ui/cut-icons/world';
import Blog from '@/components/ui/cut-icons/blog';
import Images from '@/components/ui/cut-icons/images';
import Store from '@/components/ui/cut-icons/store';
import Mic from '@/components/ui/cut-icons/mic';
import MessageEnvelope from '@/components/ui/cut-icons/message-envelope';
import Profile from '@/components/ui/cut-icons/profile';
import Location from '@/components/ui/cut-icons/location';
import LinkIcon from '@/components/ui/cut-icons/link';
import type { ProfileFieldPresetId } from '@/lib/profile-field-presets';

/** One icon per field kind, from the cut set so it matches the theme's other icons. */
export const PROFILE_FIELD_ICONS: Record<ProfileFieldPresetId, ComponentType<LucideProps>> = {
  website: World,
  blog: Blog,
  portfolio: Images,
  shop: Store,
  podcast: Mic,
  newsletter: MessageEnvelope,
  pronouns: Profile,
  location: Location,
  custom: LinkIcon,
};

/** The translated name of a preset; a custom label is shown as typed. */
export function presetLabel(t: (key: string, fallback: string) => string, id: ProfileFieldPresetId, fallback: string): string {
  return t(`profileFields.presets.${id}`, fallback);
}

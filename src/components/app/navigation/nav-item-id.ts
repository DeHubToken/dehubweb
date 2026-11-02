import type { NavItem } from '@/types/app.types';
import { NAV_LABEL_KEYS } from './SidebarNavItem';

/**
 * The id a menu destination's dragged order is saved under: its i18n key
 * (`nav.home`), which is also how the app keys the same destination, so an
 * order set on one carries over to the other (lib/nav-order).
 */
export const navItemId = (item: NavItem) => NAV_LABEL_KEYS[item.label] || item.label;

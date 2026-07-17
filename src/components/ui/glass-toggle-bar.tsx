/**
 * Glass Toggle Bar
 * ================
 * Reusable liquid-glass segmented toggle / tab bar.
 * Thin re-export of the battle-tested GlassFilterRow + GlassIndicator
 * pair used by the home feed nav, so it can be dropped into any
 * "toggle bar buttons" surface across the app.
 *
 * Usage:
 *   <GlassToggleBar
 *     items={[{ key: 'all', label: 'All' }, { key: 'live', label: 'Live' }]}
 *     activeKey={tab}
 *     onSelect={setTab}
 *   />
 */

export { GlassFilterRow as GlassToggleBar } from '@/components/app/feeds/GlassFilterRow';
export { GlassIndicator } from '@/components/app/feeds/GlassIndicator';

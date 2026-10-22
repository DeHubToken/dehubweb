// Event calls for components on the first-paint path. The PostHog loader
// (analytics-client.ts) is fetched only when VITE_POSTHOG_KEY is set.
import type { AnalyticsEvent } from './analytics-client';

const enabled = !!import.meta.env.VITE_POSTHOG_KEY;
const client = () => import('./analytics-client');

export const trackEvent = (event: AnalyticsEvent, properties?: Record<string, unknown>) => {
  if (enabled) void client().then((m) => m.trackEvent(event, properties)).catch(() => undefined);
};

/** A share, by the route it went out on (copy_link, native, x, dm…). */
export const trackShare = (channel: string, properties?: Record<string, unknown>) =>
  trackEvent('share', { channel, ...properties });

export const trackFirstPost = (address: string | null | undefined) => {
  if (enabled) void client().then((m) => m.trackFirstPost(address)).catch(() => undefined);
};

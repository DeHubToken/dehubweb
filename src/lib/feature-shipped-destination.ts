export interface ShippedFeatureDestinationInput {
  id: string;
  title: string;
  description?: string | null;
  shipped_url?: string | null;
}

const DESTINATION_RULES: Array<{ terms: RegExp; path: string }> = [
  { terms: /\bnotifications?\b/i, path: '/app/notifications' },
  { terms: /\b(earnings?|income|revenue|analytics)\b/i, path: '/app/command-centre' },
  { terms: /\b(messages?|dms?|direct messages?|chat)\b/i, path: '/app/messages' },
  { terms: /\bbookmarks?\b/i, path: '/app/bookmarks' },
  { terms: /\b(governance|proposals?|voting)\b/i, path: '/app/governance' },
  { terms: /\bstak(e|ing)\b/i, path: '/app/stake' },
  { terms: /\b(bridge|bridging)\b/i, path: '/app/bridge' },
  { terms: /\bwallets?\b/i, path: '/app/wallet' },
  { terms: /\b(communities|community)\b/i, path: '/app/communities' },
  // Before the stores rule: "fraction marketplace" matches both, and the
  // fraction market is not the stores one. The board's "Fractions page
  // functional" row has been marked shipped since July pointing at nothing.
  { terms: /\bfractions?\b/i, path: '/app/fractions' },
  { terms: /\b(stores?|marketplace|listings?)\b/i, path: '/app/stores' },
  { terms: /\bleaderboards?\b/i, path: '/app/leaderboard' },
  { terms: /\b(api|endpoint)\b/i, path: '/docs/endpoints' },
  { terms: /\b(tips?|tipping|ppv|pay-per-view|dhb|uniswap|buy)\b/i, path: '/app/buy' },
];

function safeInternalPath(path: string | null | undefined): string | null {
  const value = path?.trim();
  return value && value.startsWith('/') && !value.startsWith('//') ? value : null;
}

export function getShippedFeatureDestination(feature: ShippedFeatureDestinationInput): string {
  const configuredPath = safeInternalPath(feature.shipped_url);
  if (configuredPath) return configuredPath;

  const searchableText = `${feature.title} ${feature.description ?? ''}`;
  const matchedDestination = DESTINATION_RULES.find(({ terms }) => terms.test(searchableText));
  if (matchedDestination) return matchedDestination.path;

  return `/app/features?tab=shipped&feature=${encodeURIComponent(feature.id)}`;
}

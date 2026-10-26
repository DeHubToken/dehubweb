/**
 * Badges beside a name in a creator's stream chat: the limited-time badges
 * they offered and the hype train badge. Earned from that creator, so a chat
 * line carries them only in that creator's rooms. Kept dependency-free: the
 * chat hooks parse every message through this.
 */

/** A badge beside a name in a creator's chat. */
export interface ChatCreatorBadge {
  id: string;
  name: string;
  emoji: string;
  kind: 'event' | 'hype';
  level?: number;
}

export function parseChatBadges(raw: unknown): ChatCreatorBadge[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((b) => b && typeof b === 'object' && typeof (b as any).emoji === 'string')
    .slice(0, 3)
    .map((b: any) => ({
      id: String(b.id ?? ''),
      name: String(b.name ?? ''),
      emoji: String(b.emoji).slice(0, 16),
      kind: b.kind === 'hype' ? 'hype' : 'event',
      ...(Number(b.level) > 0 ? { level: Number(b.level) } : {}),
    }));
}

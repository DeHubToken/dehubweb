import type { UserCharacter } from '@/hooks/use-user-characters';

export interface CharacterMentionMatch {
  characters: UserCharacter[];
  cleanedPrompt: string;
  hasMentions: boolean;
}

/**
 * Scans a prompt for @slug character references.
 * Matches are replaced inline with the character name so the model still reads
 * a natural sentence (e.g. "@nova on a rooftop" → "Nova on a rooftop"), while
 * the resolved characters are returned for reference-image injection.
 *
 * Only the characters available to the user (own + public) should be passed in.
 */
export function parseCharacterMentions(
  prompt: string,
  available: UserCharacter[],
): CharacterMentionMatch {
  if (!prompt || available.length === 0) {
    return { characters: [], cleanedPrompt: prompt, hasMentions: false };
  }
  const bySlug = new Map(available.map((c) => [c.slug.toLowerCase(), c]));
  const found = new Map<string, UserCharacter>();

  // Match @token where token is letters/numbers/hyphens, not preceded by a word char
  // (avoids matching emails like name@host).
  const cleanedPrompt = prompt.replace(/(^|[^\w@])@([a-z0-9][a-z0-9-]{1,40})/gi, (full, prefix, raw) => {
    const slug = String(raw).toLowerCase();
    const c = bySlug.get(slug);
    if (!c) return full;
    found.set(c.id, c);
    return `${prefix}${c.name}`;
  });

  return {
    characters: Array.from(found.values()),
    cleanedPrompt,
    hasMentions: found.size > 0,
  };
}

export function buildCharacterPersonaBlock(characters: UserCharacter[]): string {
  if (characters.length === 0) return '';
  const lines = characters.map((c) => {
    const desc = c.description.trim() || 'see reference images';
    return `- ${c.name}: ${desc}`;
  });
  return `Character references (keep visual identity consistent with the attached reference images):\n${lines.join('\n')}`;
}

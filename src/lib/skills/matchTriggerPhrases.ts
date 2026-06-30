import type { UserSkill } from '@/hooks/use-user-skills';

/**
 * Find the best-matching skill for a user message.
 * Longest matching trigger phrase wins. Case-insensitive substring match.
 */
export function matchSkill(message: string, skills: UserSkill[]): UserSkill | null {
  if (!message) return null;
  const lower = message.toLowerCase();
  let best: { skill: UserSkill; phraseLen: number } | null = null;
  for (const skill of skills) {
    for (const phrase of skill.trigger_phrases ?? []) {
      const p = phrase.trim().toLowerCase();
      if (p.length < 3) continue;
      if (lower.includes(p)) {
        if (!best || p.length > best.phraseLen) {
          best = { skill, phraseLen: p.length };
        }
      }
    }
  }
  return best?.skill ?? null;
}

/** Strip a leading `/slug` token from a message and return both. */
export function extractSlashSkill(message: string, skills: UserSkill[]): { skill: UserSkill | null; cleaned: string } {
  const m = message.match(/^\s*\/([a-z0-9-]+)\s*(.*)$/i);
  if (!m) return { skill: null, cleaned: message };
  const slug = m[1].toLowerCase();
  const skill = skills.find((s) => s.slug === slug) ?? null;
  return { skill, cleaned: skill ? m[2] : message };
}

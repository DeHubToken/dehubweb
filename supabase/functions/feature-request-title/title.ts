/**
 * Pure helpers for naming a request that was posted without a title.
 *
 * The composer only asks for one free-form box, so when the title field is
 * left empty the client stores the first line of the description as the
 * title. The card then says the same thing twice. These helpers decide which
 * rows are like that and turn a model's answer into a clean, short heading.
 */

const collapse = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/** The title is just the start of the description (or the whole of it). */
export function isUntitled(title: string | null | undefined, description: string | null | undefined): boolean {
  const t = collapse(title);
  if (!t) return true;
  return collapse(description).startsWith(t);
}

/**
 * The words the person actually wrote. Bug reports carry the page, browser and
 * device after a blank line; none of that belongs in a heading.
 */
export function requestText(description: string): string {
  const cut = description.search(/\n\s*\n\s*(Page:|Device & OS:|Device \/ OS:|Reported:)/);
  const body = (cut >= 0 ? description.slice(0, cut) : description).trim();
  return body.slice(0, 1500);
}

const CATEGORY_HINT: Record<string, string> = {
  bug_fix: 'a bug report',
  ui_ux: 'a design or layout change',
  performance: 'a speed or performance problem',
  new_feature: 'a new feature idea',
  integration: 'an integration request',
  other: 'a request',
};

export function titleMessages(description: string, category: string | null | undefined) {
  const kind = CATEGORY_HINT[category ?? ''] ?? 'a request';
  return [
    {
      role: 'system',
      content: [
        'You name items on a public product feedback board, the way a sharp product manager would.',
        'Write ONE short title for the post you are given.',
        'Rules:',
        '- 2 to 7 words, at most 55 characters.',
        '- Name the thing, not the feeling: the feature, page or screen, and what is wrong or wanted.',
        '- Bug reports: the broken thing plus the symptom, e.g. "Profile won\'t open from comments", "Notification badge resets on restart".',
        '- Ideas: a plain noun phrase or short action, e.g. "Custom order for profile videos", "Shortcut to global chat".',
        '- Sentence case. No quotes, no emojis, no hashtags, no @names, no full stop at the end.',
        '- Never start with "Request", "Feature request", "Bug", "Please", "Add a request" or similar filler.',
        '- Write it in the same language the post is written in.',
        '- Output the title only, nothing else.',
      ].join('\n'),
    },
    { role: 'user', content: `This is ${kind}:\n\n${requestText(description)}` },
  ];
}

const REFUSAL = /\b(i'?m sorry|i cannot|i can'?t help|as an ai|language model)\b/i;

/** Tidy a model answer into a title, or null when it is not usable. */
export function cleanTitle(raw: string | null | undefined, description: string): string | null {
  if (!raw) return null;
  let t = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  t = t.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';
  t = t.replace(/^\s*(title|heading)\s*[:\-–]\s*/i, '');
  t = t.replace(/^[\s"'“”‘’`*#_]+|[\s"'“”‘’`*_]+$/g, '');
  t = t.replace(/[.!。]+$/u, '').replace(/\s+/g, ' ').trim();
  if (t.length < 3 || t.length > 70) return null;
  if (REFUSAL.test(t)) return null;
  // Still a copy of the description: no better than what is there.
  if (isUntitled(t, description) && collapse(t).length > 40) return null;
  return t.charAt(0).toLocaleUpperCase() + t.slice(1);
}

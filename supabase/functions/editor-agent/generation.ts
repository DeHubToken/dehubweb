const KINDS = ['image', 'video', 'voice', 'music', 'sfx'] as const;
export type GenerationKind = typeof KINDS[number];

/** Older clients did not advertise audio draft controls. */
export function supportedGenerationKinds(value: unknown): GenerationKind[] {
  const advertised = Array.isArray(value) ? value.slice(0, 20) : [];
  const allowed = KINDS.filter(kind => advertised.includes(kind));
  return allowed.length ? allowed : ['image', 'video'];
}

export function generationInstruction(kinds: readonly GenerationKind[]): string {
  const details = [
    `- generate: kind (${kinds.map(kind => JSON.stringify(kind)).join(' | ')}), prompt. This prepares a draft for review in this client; it never starts a render or payment. Use only for an explicit request to create new media. Use stock or timeline editing when the user wants existing media.`,
    'Keep the chosen medium independent of words in the prompt: a video camera in an image brief remains an image.',
    'Only choose one of the listed generation kinds; never substitute another kind for an unavailable medium.',
  ];
  if (kinds.includes('voice')) details.push('For voice, copy the requested spoken words exactly, including punctuation, line breaks and the final sentence. Do not expand, summarise or translate the script unless requested.');
  if (kinds.includes('music')) details.push('For music, preserve the requested genre, instruments, tempo, mood and vocal or instrumental preference in a track brief.');
  if (kinds.includes('sfx')) details.push('For sfx, describe the requested sound effect or ambience. Do not convert it into a spoken voiceover, music track, image or video.');
  return details.join('\n');
}

export function supportsGenerationOp(op: unknown, kinds: readonly GenerationKind[]): boolean {
  if (!op || typeof op !== 'object') return false;
  const value = op as Record<string, unknown>;
  return value.op !== 'generate' || kinds.some(kind => kind === value.kind);
}

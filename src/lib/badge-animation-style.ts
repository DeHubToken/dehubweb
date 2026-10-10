/** Only the opened showcase and promotion use this; inline badges keep their artwork. */
export function badgeAnimationStyle(theme: string): 'metallic' | 'sticker' {
  return theme === 'system' || theme === 'immersive' || theme === 'light' || theme === 'minimal' ? 'metallic' : 'sticker';
}

/** Themes whose page background continues behind glass surfaces. */
export const CANVAS_THEMES = ['glass', 'cosmic', 'hazy', 'swarms', 'lavalamp', 'winter', 'war', 'osaka', 'jungle', 'island', 'hacker', 'horror'] as const;

export function isCanvasTheme(theme: string | undefined): boolean {
  return !!theme && (CANVAS_THEMES as readonly string[]).includes(theme);
}

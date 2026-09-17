// Match the resolved asset URLs so every badge surface, including cached tier
// tables and bare images, switches with the root theme without changing layout.
const originals = import.meta.glob<string>('../assets/badges/*.webp', { eager: true, import: 'default' });
const light = import.meta.glob<string>('../assets/badges/light/*.webp', { eager: true, import: 'default' });

function rules(root: string): string {
  return Object.entries(originals).map(([path, url]) => {
    const filename = path.split('/').pop();
    const replacement = light[`../assets/badges/light/${filename}`];
    if (!replacement) return '';
    return `${root} img[src=${JSON.stringify(url)}] { content: url(${JSON.stringify(replacement)}); filter: none; }`;
  }).join('\n');
}

export const badgeLightArtworkCss = `${rules('html[data-theme="light"]')}
@media (prefers-color-scheme: light) { ${rules('html[data-theme="system"]')} }`;

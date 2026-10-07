/** Keep complete JSON and selected layers when large timelines exceed the input budget. */
export function sceneJson(value: unknown, maxChars = 16000): string {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const full = JSON.stringify(source);
  if (full.length <= maxChars) return full;
  const selection = new Set(Array.isArray(source.selected) ? source.selected.filter(x => typeof x === "string" && x.length <= 96).slice(0, 100) : []);
  const layers = (Array.isArray(source.layers) ? source.layers : []).filter(x => x && typeof x === "object") as Record<string, unknown>[];
  const fields = ["id", "kind", "trackId", "start", "duration", "trimIn", "sourceDuration", "mediaId", "speed", "locked", "hidden", "hiddenLayer", "x", "y", "scale", "volume", "fontSize", "color"];
  const compact = layers.map(c => {
    const out: Record<string, unknown> = {};
    for (const key of fields) if (typeof c[key] === "number" || typeof c[key] === "boolean" || (typeof c[key] === "string" && c[key].length <= 96)) out[key] = c[key];
    for (const key of ["text", "name", "font"]) if (typeof c[key] === "string") out[key] = c[key].slice(0, selection.has(String(c.id)) ? 200 : 60);
    return out;
  });
  const scene: Record<string, unknown> = {
    capabilities: Array.isArray(source.capabilities) ? source.capabilities.filter(x => typeof x === "string" && x.length < 40).slice(0, 80) : undefined,
    page: source.page, playhead: source.playhead, selected: [...selection],
    tracks: Array.isArray(source.tracks) ? source.tracks.slice(0, 100) : undefined,
    pages: Array.isArray(source.pages) ? source.pages.slice(0, 100) : undefined,
    currentPage: source.currentPage, brand: source.brand,
    library: Array.isArray(source.library) ? source.library.slice(0, 30) : undefined,
    layers: compact, omittedLayers: 0,
  };
  // Never cut through JSON text or omit a selected clip before an unselected one.
  while (JSON.stringify(scene).length > maxChars && compact.length) {
    const index = compact.findLastIndex(c => !selection.has(String(c.id)));
    if (index < 0) break;
    compact.splice(index, 1); scene.omittedLayers = Number(scene.omittedLayers) + 1;
  }
  if (JSON.stringify(scene).length > maxChars) {
    delete scene.brand; delete scene.library; delete scene.pages;
    scene.page = source.page && typeof source.page === "object" ? Object.fromEntries(Object.entries(source.page).filter(([, x]) => typeof x === "number" || (typeof x === "string" && x.length < 40))) : undefined;
    scene.tracks = undefined;
  }
  while (JSON.stringify(scene).length > maxChars && compact.length) { compact.pop(); scene.omittedLayers = Number(scene.omittedLayers) + 1; }
  if (JSON.stringify(scene).length > maxChars) return JSON.stringify({ layers: [], selected: [], omittedLayers: layers.length, page: scene.page });
  return JSON.stringify(scene);
}

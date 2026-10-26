/**
 * Keyboard layouts borrowed from other editors, so muscle memory carries over.
 * Only timeline keys change; DeHub's own shortcuts keep working underneath.
 */
export const SHORTCUT_PRESETS = ["dehub", "premiere", "resolve", "finalcut", "capcut"] as const;
export type ShortcutPreset = typeof SHORTCUT_PRESETS[number];
export const SHORTCUT_PRESET_LABELS: Record<ShortcutPreset, string> = {
  dehub: "DeHub", premiere: "Premiere Pro", resolve: "DaVinci Resolve", finalcut: "Final Cut Pro", capcut: "CapCut",
};
export type ShortcutAction = "split" | "play" | "pause" | "back" | "frameBack" | "frameForward" | "rippleDelete" | "liftDelete" | "start" | "end";

export interface KeyLike { key: string; code?: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }
type Binding = [combo: string, action: ShortcutAction];

const TRANSPORT: Binding[] = [["j", "back"], ["k", "pause"], ["l", "play"], ["arrowleft", "frameBack"], ["arrowright", "frameForward"], ["home", "start"], ["end", "end"]];
const BINDINGS: Record<ShortcutPreset, Binding[]> = {
  dehub: [],
  premiere: [...TRANSPORT, ["mod+k", "split"], ["shift+delete", "rippleDelete"], ["shift+backspace", "rippleDelete"], ["delete", "liftDelete"], ["backspace", "liftDelete"]],
  resolve: [...TRANSPORT, ["mod+b", "split"], ["mod+\\", "split"], ["delete", "rippleDelete"], ["backspace", "liftDelete"]],
  finalcut: [...TRANSPORT, ["mod+b", "split"], ["delete", "rippleDelete"], ["backspace", "rippleDelete"], ["shift+delete", "liftDelete"]],
  capcut: [["mod+b", "split"], ["arrowleft", "frameBack"], ["arrowright", "frameForward"], ["home", "start"], ["end", "end"], ["delete", "rippleDelete"], ["backspace", "rippleDelete"]],
};

function combo(event: KeyLike) {
  const key = event.key.toLowerCase();
  return `${event.metaKey || event.ctrlKey ? "mod+" : ""}${event.shiftKey ? "shift+" : ""}${event.altKey ? "alt+" : ""}${key}`;
}

export function shortcutAction(preset: ShortcutPreset, event: KeyLike): ShortcutAction | null {
  const pressed = combo(event);
  return BINDINGS[preset].find(([keys]) => keys === pressed)?.[1] ?? null;
}

/** Human-readable list for the help panel. */
export function shortcutList(preset: ShortcutPreset, mac: boolean): { keys: string; action: ShortcutAction }[] {
  return BINDINGS[preset].map(([keys, action]) => ({
    action,
    keys: keys.split("+").map(part => part === "mod" ? (mac ? "⌘" : "Ctrl") : part === "shift" ? "Shift" : part === "arrowleft" ? "←" : part === "arrowright" ? "→" : part.length === 1 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)).join(" + "),
  }));
}

export const isShortcutPreset = (value: unknown): value is ShortcutPreset => SHORTCUT_PRESETS.includes(value as ShortcutPreset);
const STORAGE_KEY = "dehub.editor.shortcutPreset";
export function readShortcutPreset(): ShortcutPreset {
  try { const value = localStorage.getItem(STORAGE_KEY); return isShortcutPreset(value) ? value : "dehub"; } catch { return "dehub"; }
}
export function saveShortcutPreset(preset: ShortcutPreset) {
  try { localStorage.setItem(STORAGE_KEY, preset); } catch { /* private mode keeps the default */ }
}

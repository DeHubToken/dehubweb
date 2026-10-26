import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SHORTCUT_PRESETS, SHORTCUT_PRESET_LABELS, readShortcutPreset, saveShortcutPreset, shortcutList, type ShortcutPreset } from "@/lib/editor/shortcutPresets";

/** Lets creators keep the keyboard layout of the editor they came from. */
export function ShortcutPresetPicker() {
  const { t } = useTranslation();
  const [preset, setPreset] = useState<ShortcutPreset>(readShortcutPreset);
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const list = shortcutList(preset, mac);
  return (
    <section className="space-y-2 rounded-lg border border-white/15 p-3">
      <label className="block text-xs font-medium text-white/85">
        {t("editor.shortcuts.preset")}
        <select value={preset} onChange={event => { const next = event.target.value as ShortcutPreset; setPreset(next); saveShortcutPreset(next); }}
          className="mt-1 min-h-9 w-full rounded-lg border border-white/20 bg-neutral-900 px-2 text-xs text-white">
          {SHORTCUT_PRESETS.map(id => <option key={id} value={id}>{SHORTCUT_PRESET_LABELS[id]}</option>)}
        </select>
      </label>
      {list.length > 0 && (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
          {list.map(item => (
            <li key={`${item.keys}-${item.action}`} className="flex items-center justify-between gap-2 text-[11px] text-white/60">
              <span>{t(`editor.shortcuts.action.${item.action}`)}</span>
              <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/70">{item.keys}</kbd>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] text-white/45">{t("editor.shortcuts.presetHint")}</p>
    </section>
  );
}

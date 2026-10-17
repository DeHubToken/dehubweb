import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cancelDesignColourPick, getDesignColourPick, startDesignColourPick, useDesignColourPick } from "@/lib/editor/designColourPicker";

export function ColourPickerButton({ projectId, onPick, label }: { projectId: string; onPick: (colour: string) => void; label?: string }) {
  const { t } = useTranslation(), state = useDesignColourPick(), token = useRef<number | null>(null), receive = useRef(onPick); receive.current = onPick;
  const active = state?.projectId === projectId && state.token === token.current;
  useEffect(() => () => { if (getDesignColourPick()?.projectId === projectId && token.current !== null) cancelDesignColourPick(token.current); }, [projectId]);
  useEffect(() => { if (!active) return; const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (token.current !== null) cancelDesignColourPick(token.current); } }; window.addEventListener("keydown", key, true); return () => window.removeEventListener("keydown", key, true); }, [active]);
  return <button type="button" aria-pressed={active} onClick={() => { if (active && token.current !== null) cancelDesignColourPick(token.current); else token.current = startDesignColourPick(projectId, colour => receive.current(colour)); }} className={`min-h-9 rounded-lg border px-3 text-xs ${active ? "border-cyan-300 bg-cyan-300/10 text-cyan-100" : "border-white/20 text-white/65"}`}>{active ? t("editor.colourPicker.cancel", { defaultValue: "Cancel colour picker" }) : label || t("editor.colourPicker.pick", { defaultValue: "Pick from canvas" })}</button>;
}

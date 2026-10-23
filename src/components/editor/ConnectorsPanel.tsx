import { DiagramTemplatesPanel } from "./DiagramTemplatesPanel";
import { useEffect, useId, useState } from "react";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { CONNECTOR_CAPS, CONNECTOR_ROUTES, DEFAULT_CONNECTOR, connectorSvgPath, putConnector, type ConnectorStyle } from "@/lib/editor/connectors";

export function ConnectorsPanel() {
  const { t } = useTranslation();
  const clips = useEditorStore(s => s.clips), ids = useEditorStore(s => s.selectedClipIds);
  const selected = clips.find(clip => ids.length === 1 && clip.id === ids[0]);
  const existing = selected?.kind === "shape" && (selected.connector || selected.shape === "line" || selected.shape === "arrow") ? selected : undefined;
  const [style, setStyle] = useState<ConnectorStyle>({ ...DEFAULT_CONNECTOR });
  const [colour, setColour] = useState("#ffffff"), [width, setWidth] = useState(6), [dash, setDash] = useState<"solid" | "dashed" | "dotted">("solid");
  const markerId = useId().replace(/:/g, "");
  useEffect(() => {
    if (!existing) return;
    setStyle(existing.connector ?? { route: "straight", start: "none", end: existing.shape === "arrow" ? "arrow" : "none", bend: 0.5 });
    setColour(existing.stroke?.color ?? existing.fill ?? "#ffffff"); setWidth(existing.stroke?.width ?? 6);
    setDash(existing.stroke?.dash?.length ? (existing.stroke.dash[0] <= 2 ? "dotted" : "dashed") : "solid");
  }, [existing?.id, existing?.connector, existing?.stroke]);
  const chip = (label: string, active: boolean, onClick: () => void) => <button key={label} type="button" aria-pressed={active} onClick={onClick} className={`min-h-9 rounded-lg border px-3 text-xs ${active ? "border-white bg-white text-black" : "border-white/20 text-white/75 hover:bg-white/10"}`}>{label}</button>;
  const capNames = { none: "None", arrow: "Arrow", circle: "Circle", diamond: "Diamond" };
  const marker = (cap: ConnectorStyle["start"], id: string) => cap !== "none" && <marker id={id} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">{cap === "circle" ? <circle cx="5" cy="5" r="4" fill={colour} /> : <path d={cap === "diamond" ? "M 10 5 L 5 0 L 0 5 L 5 10 Z" : "M 10 5 L 0 0 L 2 5 L 0 10 Z"} fill={colour} />}</marker>;
  return <div className="space-y-3">
    <svg viewBox="-75 -35 150 70" role="img" aria-label={t("editor.connectors.preview", { defaultValue: "Connector preview" })} className="h-24 w-full rounded-lg border border-white/10 bg-white/5"><defs>{marker(style.start, `${markerId}-start`)}{marker(style.end, `${markerId}-end`)}</defs><path d={connectorSvgPath(110, 30, style)} fill="none" stroke={colour} strokeWidth={Math.max(1, width / 3)} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash === "solid" ? undefined : dash === "dashed" ? "7 5" : "1 5"} markerStart={style.start !== "none" ? `url(#${markerId}-start)` : undefined} markerEnd={style.end !== "none" ? `url(#${markerId}-end)` : undefined} /></svg>
    <div className="flex flex-wrap gap-2">{CONNECTOR_ROUTES.map(route => chip(t(`editor.connectors.route.${route}`, { defaultValue: ({ straight: "Straight", elbow: "Elbow", curve: "Curved" })[route] }), style.route === route, () => setStyle(value => ({ ...value, route }))))}</div>
    {(["start", "end"] as const).map(edge => <fieldset key={edge}><legend className="mb-2 text-xs text-white/60">{t(`editor.connectors.${edge}`, { defaultValue: edge === "start" ? "Start endpoint" : "End endpoint" })}</legend><div className="flex flex-wrap gap-2">{CONNECTOR_CAPS.map(cap => chip(t(`editor.connectors.cap.${cap}`, { defaultValue: capNames[cap] }), style[edge] === cap, () => setStyle(value => ({ ...value, [edge]: cap }))))}</div></fieldset>)}
    <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-xs text-white/60">{t("editor.connectors.colour", { defaultValue: "Line colour" })}<input type="color" value={colour} onChange={e => setColour(e.target.value)} className="h-8 w-12 bg-transparent" /></label><label className="flex items-center gap-2 text-xs text-white/60">{t("editor.connectors.width", { defaultValue: "Line weight" })}<input type="range" min={1} max={40} value={width} onChange={e => setWidth(Number(e.target.value))} />{width}</label></div>
    <div className="flex flex-wrap gap-2">{(["solid", "dashed", "dotted"] as const).map(value => chip(t(`editor.connectors.stroke.${value}`, { defaultValue: ({ solid: "Solid", dashed: "Dashed", dotted: "Dotted" })[value] }), dash === value, () => setDash(value)))}</div>
    {style.route !== "straight" && <label className="flex items-center gap-3 text-xs text-white/60">{t("editor.connectors.bend", { defaultValue: "Bend position" })}<input type="range" min={10} max={90} value={Math.round(style.bend * 100)} onChange={e => setStyle(value => ({ ...value, bend: Number(e.target.value) / 100 }))} /><span>{Math.round(style.bend * 100)}%</span></label>}
    <button type="button" disabled={!!existing?.locked} onClick={() => { const store = useEditorStore.getState(), before = store.toSnapshot(); const result = putConnector(before, store.currentTime, style, colour, width, dash === "solid" ? [] : dash === "dashed" ? [width * 3, width * 2] : [1, width * 2], () => nanoid(10), existing?.id); if (result && store.applyDesignEdit(before, result.project)) store.selectClip(result.id); }} className="min-h-9 rounded-lg bg-white px-3 text-xs font-medium text-black disabled:opacity-35">{t(existing ? "editor.connectors.update" : "editor.connectors.insert", { defaultValue: existing ? "Update connector" : "Insert connector" })}</button>
    <p className="text-xs text-white/45">{t("editor.connectors.hint", { defaultValue: "Resize, stretch, rotate, or flip the connector on the canvas. Choose it again to edit its route and endpoints." })}</p>
    <DiagramTemplatesPanel />
  </div>;
}

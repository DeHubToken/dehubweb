import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DRAWING_SHAPES, drawingShapePatch, suggestDrawingShape, type DrawingShape } from "@/lib/editor/freehandShapeConversion";
import { SHAPE_NAMES } from "@/lib/editor/shapeGeometry";
import type { ShapeClip } from "@/lib/editor/types";
import { editorErrorText } from "@/lib/editor/editorErrorText";
export function FreehandShapeControls({ value, onChange }: { value: ShapeClip; onChange: (patch: Partial<ShapeClip>) => void }) {
  const { t } = useTranslation(), [error, setError] = useState("");
  const suggestion = useMemo(() => suggestDrawingShape(value.points ?? [], !!value.closedPath), [value.points, value.closedPath]);
  const convert = (shape: DrawingShape) => { try { onChange(drawingShapePatch(value, shape)); setError(""); } catch (reason) { setError(editorErrorText(reason, t("copy.be1f8c793246", { defaultValue: "Could not convert this drawing" }))); } };
  return <details className="rounded-lg border border-white/10 p-2"><summary className="min-h-9 cursor-pointer text-xs text-white/70">{t("editor.brush.convertShape", { defaultValue: "Tidy drawing into a shape" })}</summary><div className="space-y-2 pt-2">{suggestion && <button type="button" disabled={!!value.locked} onClick={() => convert(suggestion)} className="min-h-9 rounded-lg border border-sky-300/50 bg-sky-300/10 px-3 text-xs text-white/80 disabled:opacity-35">{t("editor.brush.suggestedShape", { defaultValue: "Suggested: {{shape}}", shape: t(`editor.shape.${suggestion}`, { defaultValue: SHAPE_NAMES[suggestion] }) })}</button>}<div className="grid grid-cols-2 gap-2">{DRAWING_SHAPES.map(shape => <button key={shape} type="button" disabled={!!value.locked} onClick={() => convert(shape)} className="min-h-9 rounded-lg border border-white/20 px-2 text-xs text-white/70 disabled:opacity-35">{t(`editor.shape.${shape}`, { defaultValue: SHAPE_NAMES[shape] })}</button>)}</div><p className="text-[10px] text-white/45">{t("editor.brush.convertHint", { defaultValue: "Replaces the path inside its current box with an editable shape. Position, size, rotation, outline, effects, grouping and timing are kept. Open drawings become outlines. Undo restores the drawn path." })}</p>{error && <p role="alert" className="text-xs text-red-300">{error}</p>}</div></details>;
}

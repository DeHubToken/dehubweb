import { validGradientFill, type GradientFill } from "./gradientFill";
import { EditorError } from "./editorError";
function captureGradient(fill: GradientFill): GradientFill {
  if (!fill || !validGradientFill(fill)) throw new EditorError("copy.0cc638962549", "Complete the gradient before exporting");
  return { type: fill.type, angle: fill.angle % 360, stops: fill.stops.map(stop => ({ offset: stop.offset, colour: stop.colour, opacity: stop.opacity })), ...(fill.focus ? { focus: { x: fill.focus.x, y: fill.focus.y } } : {}), spread: fill.spread };
}
export function gradientStyleFile(fill: GradientFill, name: string): string {
  return JSON.stringify({ kind: "dehub-gradient-style", version: 1, name: name.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 60) || "Gradient", style: captureGradient(fill) }) + "\n";
}
export function parseGradientStyleFile(text: string): { name: string; style: GradientFill } {
  if (text.length > 32768) throw new EditorError("copy.b0a722b56cdb", "Choose a gradient-style file smaller than 32 KB");
  let raw: unknown; try { raw = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { throw new EditorError("copy.225e5570d7ca", "Choose an exported gradient-style JSON file"); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new EditorError("copy.2f67092ed2e4", "Choose an exported gradient-style file");
  const file = raw as Record<string, unknown>;
  if (file.kind !== "dehub-gradient-style" || file.version !== 1 || typeof file.name !== "string" || !file.style || !validGradientFill(file.style)) throw new EditorError("copy.d840bfa9db13", "Choose a supported gradient-style file with valid stops");
  return { name: file.name.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 60) || "Gradient", style: captureGradient(file.style as GradientFill) };
}

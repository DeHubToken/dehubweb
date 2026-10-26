import { multiplySvgMatrices, parseSvgTransform, SVG_IDENTITY, type SvgMatrix } from "./svgTransform";
import { EditorError } from "./editorError";
export interface SvgGeometrySource { data: string; matrix: SvgMatrix }
/** Read supported static geometry as numbers; source markup is never rendered. */
export function svgGeometrySources(source: string): SvgGeometrySource[] {
  if (!source.includes("<")) return [{ data: source, matrix: [...SVG_IDENTITY] }];
  if (source.length > 32768 || /<!DOCTYPE|<!ENTITY/i.test(source)) throw new EditorError("copy.ad87d3c935d3", "Use a static SVG smaller than 32 KB without document declarations");
  const input = source.replace(/<\?xml[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<(title|desc)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  const tags = /<(?:(?:[^>"'])|"[^"]*"|'[^']*')*>/g, stack: string[] = [], paths: string[] = [], sources: SvgGeometrySource[] = [], matrices: SvgMatrix[] = [];
  let offset = 0, match: RegExpExecArray | null;
  while ((match = tags.exec(input))) {
    if (input.slice(offset, match.index).trim()) throw new EditorError("copy.ea4d654c5dbc", "Use SVG paths and shapes without embedded text");
    offset = tags.lastIndex;
    const tag = /^<\s*(\/?)\s*([a-z][\w:-]*)\b([\s\S]*?)(\/?)\s*>$/i.exec(match[0]);
    if (!tag) throw new EditorError("copy.3139b72aa2f7", "This SVG contains unsupported markup");
    const name = tag[2].toLowerCase();
    if (!["svg", "g", "path", "rect", "circle", "ellipse", "line", "polygon", "polyline"].includes(name)) throw new EditorError("copy.0532a5cee094", "Use paths, rectangles, ellipses, lines and polygons; text, images, definitions, masks and references are unsupported");
    if (tag[1]) { if (tag[3].trim() || tag[4] || stack.pop() !== name) throw new EditorError("copy.a1e089fcf978", "This SVG has mismatched closing tags"); matrices.pop(); continue; }
    if (name === "svg" && stack.length) throw new EditorError("copy.ae508fc7342e", "Flatten nested SVG viewports before importing editable geometry");
    const attributes: Record<string, string> = {}, attribute = /([a-z_][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/gi;
    let at = 0, item: RegExpExecArray | null;
    while ((item = attribute.exec(tag[3]))) {
      if (tag[3].slice(at, item.index).trim()) throw new EditorError("copy.6d40c01bafbf", "Use quoted SVG attributes");
      const key = item[1].toLowerCase(); if (Object.prototype.hasOwnProperty.call(attributes, key)) throw new EditorError("copy.85af2aa36a80", "Remove duplicate SVG attributes");
      const value = item[3] ?? item[4];
      if (key.startsWith("on") || ["clip-path", "mask", "filter", "href", "xlink:href", "display", "visibility"].includes(key) || key === "style" && /(?:transform|display|visibility|clip|mask|filter|(?:^|;)\s*d)\s*:/i.test(value)) throw new EditorError("copy.c5937296e04d", "Flatten SVG clipping and visibility before importing editable geometry");
      if (/&/.test(value) && ["d", "points", "x", "y", "x1", "y1", "x2", "y2", "rx", "ry", "cx", "cy", "r", "width", "height"].includes(key)) throw new EditorError("copy.a7435f123b07", "Use literal numbers in SVG geometry");
      attributes[key] = value; at = attribute.lastIndex;
    }
    if (tag[3].slice(at).trim()) throw new EditorError("copy.6d40c01bafbf", "Use quoted SVG attributes");
    const matrix = multiplySvgMatrices(matrices[matrices.length - 1] ?? SVG_IDENTITY, parseSvgTransform(attributes.transform)), before = paths.length;
    if (name !== "svg" && name !== "g" && stack.some(parent => parent !== "svg" && parent !== "g")) throw new EditorError("copy.f1b52d6c9456", "SVG geometry must not contain child shapes");
    const number = (key: string, fallback = 0) => { const value = attributes[key]; if (value === undefined) return fallback; if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?(?:px)?$/i.test(value.trim())) throw new EditorError("copy.12649960fb33", "Use unitless SVG geometry or pixel values"); const result = Number(value.trim().replace(/px$/i, "")); if (!Number.isFinite(result) || Math.abs(result) > 1000000) throw new EditorError("copy.8173c5a1403d", "Keep SVG coordinates within one million units"); return result; };
    if (name === "path") { const data = attributes.d?.trim(); if (!data) throw new EditorError("copy.c7c568e3bb83", "Each SVG path needs a d value"); paths.push(data.replace(/^m/, "M")); }
    else if (name === "rect") {
      const x = number("x"), y = number("y"), width = number("width"), height = number("height"); if (width <= 0 || height <= 0) throw new EditorError("copy.8cdeb180d5a4", "SVG rectangles need positive dimensions");
      const rx = Math.min(width / 2, number("rx", attributes.ry === undefined ? 0 : number("ry"))), ry = Math.min(height / 2, number("ry", rx));
      if (rx < 0 || ry < 0) throw new EditorError("copy.9f9f6e2545b4", "Use nonnegative SVG corner radii");
      paths.push(rx && ry ? `M${x + rx} ${y}H${x + width - rx}A${rx} ${ry} 0 0 1 ${x + width} ${y + ry}V${y + height - ry}A${rx} ${ry} 0 0 1 ${x + width - rx} ${y + height}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + height - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z` : `M${x} ${y}H${x + width}V${y + height}H${x}Z`);
    } else if (name === "circle" || name === "ellipse") {
      const x = number("cx"), y = number("cy"), rx = number(name === "circle" ? "r" : "rx"), ry = number(name === "circle" ? "r" : "ry"); if (rx <= 0 || ry <= 0) throw new EditorError("copy.e5a1b0315376", "SVG ellipses need positive radii"); paths.push(`M${x + rx} ${y}A${rx} ${ry} 0 1 0 ${x - rx} ${y}A${rx} ${ry} 0 1 0 ${x + rx} ${y}Z`);
    } else if (name === "line") paths.push(`M${number("x1")} ${number("y1")}L${number("x2")} ${number("y2")}`);
    else if (name === "polygon" || name === "polyline") {
      const raw = attributes.points ?? "", values = raw.trim().split(/[\s,]+/); if (values.length < 4 || values.length % 2 || values.some(value => !/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(value) || !Number.isFinite(Number(value)) || Math.abs(Number(value)) > 1000000)) throw new EditorError("copy.179fba372d26", "Use pairs of literal numbers for polygon points");
      paths.push(values.map((value, index) => index % 2 ? value : (index ? "L" : "M") + value).join(" ") + (name === "polygon" ? "Z" : ""));
    }
    if (paths.length > before) sources.push({ data: paths[paths.length - 1], matrix });
    if (paths.length > 100) throw new EditorError("copy.567b9c79d9d2", "Import up to one hundred SVG shapes at a time");
    if (!tag[4]) { stack.push(name); matrices.push(matrix); }
  }
  if (input.slice(offset).trim() || stack.length || !paths.length) throw new EditorError("copy.f04a65d80539", "Choose a complete SVG with supported static geometry");
  const result = paths.join(" "); if (result.length > 32768) throw new EditorError("copy.f5d45a38565b", "Simplify the SVG before importing it"); return sources;
}

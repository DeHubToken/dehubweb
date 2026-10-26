import { normaliseBrandStyles, validBrandStyles, type BrandStyles } from "./brandStyles";
import { EditorError } from "./editorError";
export interface BrandStylesFile { name: string; styles: BrandStyles }
const cleanName = (name: string) => name.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 60) || "Brand styles";
export function brandStylesFile(name: string, input: BrandStyles): string {
  if (!input || !validBrandStyles(input)) throw new EditorError("copy.515c8ef71c75", "Choose valid brand colours and fonts");
  const styles = normaliseBrandStyles(input);
  if (!styles.colors.length && !styles.headingFont && !styles.bodyFont) throw new EditorError("copy.458ea514f9df", "Choose brand colours or fonts before exporting");
  return JSON.stringify({ kind: "dehub-brand-styles", version: 1, name: cleanName(name), styles }, null, 2) + "\n";
}
export function parseBrandStylesFile(text: string): BrandStylesFile {
  if (text.length > 32768) throw new EditorError("copy.70953e5fe9b4", "Choose a brand styles file smaller than 32 KB");
  let value: unknown;
  try { value = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { throw new EditorError("copy.a79d3cbc2e27", "This file does not contain valid brand styles"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new EditorError("copy.dd389333d443", "Choose an exported DeHub brand styles file");
  const file = value as Record<string, unknown>;
  if (file.kind !== "dehub-brand-styles" || file.version !== 1 || typeof file.name !== "string" || !file.styles || !validBrandStyles(file.styles)) throw new EditorError("copy.84ce290a42a6", "Choose a supported DeHub brand styles file");
  const styles = normaliseBrandStyles(file.styles as BrandStyles);
  if (!styles.colors.length && !styles.headingFont && !styles.bodyFont) throw new EditorError("copy.255953aa6425", "This file contains no colours or fonts");
  return { name: cleanName(file.name), styles };
}

import { normaliseBrandStyles } from "./brandStyles";
import { gradientFromColours, type GradientFill } from "./gradientFill";
import { EditorError } from "./editorError";
export function gradientFromBrandPalette(value: GradientFill, colours: readonly string[]): GradientFill {
  const palette = normaliseBrandStyles({ colors: [...colours], headingFont: null, bodyFont: null }).colors;
  if (palette.length < 2) throw new EditorError("copy.d39dee373794", "Choose a saved palette with at least two colours");
  const sampled = palette.length <= 8 ? palette : Array.from({ length: 8 }, (_, index) => palette[Math.round(index * (palette.length - 1) / 7)]);
  return { ...value, stops: gradientFromColours(sampled).stops };
}

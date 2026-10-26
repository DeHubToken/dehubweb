import { formatDelimitedData, parseDelimitedData } from "./delimitedData";
import { EditorError } from "./editorError";
export function histogramObservationSource(source: string, header: boolean): { source: string; count: number } {
  const rows = parseDelimitedData(source, 51, 50).slice(header ? 1 : 0), values: number[] = [];
  for (const row of rows) for (const cell of row) {
    if (!cell.trim()) continue;
    const value = Number(cell);
    if (!Number.isFinite(value) || Math.abs(value) > 1e12) throw new EditorError("copy.b7a218edc80a", "Use numeric observations within one trillion. Skip a header row if needed");
    values.push(value);
    if (values.length > 50) throw new EditorError("copy.84f46f13c324", "Use at most 50 observations");
  }
  if (!values.length) throw new EditorError("copy.7d029f5d4dba", "Paste at least one numeric observation");
  return { source: formatDelimitedData(values.map((value, index) => [`Observation ${index + 1}`, value]), "\t"), count: values.length };
}

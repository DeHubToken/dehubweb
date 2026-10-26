import { parseTableData } from "./dataVisuals";
import { tableCellRange } from "./tableCellStyles";
import { formatDelimitedData } from "./delimitedData";
import { EditorError } from "./editorError";
export interface TableTextSearch { query: string; replacement: string; caseSensitive: boolean; wholeCell: boolean; range: string }
export function replaceTableText(source: string, options: TableTextSearch): { source: string; cells: number; occurrences: number } {
  if (!options.query || options.query.length > 200 || options.replacement.length > 200) throw new EditorError("copy.d8a13591a815", "Find text needs 1–200 characters; replacement supports up to 200");
  const rows = parseTableData(source), columns = Math.max(0, ...rows.map(row => row.length));
  if (!rows.length || !columns) throw new EditorError("copy.1ef84302682d", "Add table cells before searching");
  const range = options.range.trim() ? tableCellRange(options.range, rows.length, columns) : { row: 0, column: 0, rowSpan: rows.length, columnSpan: columns };
  const slash = String.fromCharCode(92), literal = Array.from(options.query, character => "^$.*+?()[]{}|".includes(character) || character === slash ? slash + character : character).join("");
  const pattern = new RegExp(options.wholeCell ? "^(?:" + literal + ")$" : literal, options.caseSensitive ? "gu" : "giu");
  let cells = 0, occurrences = 0;
  const result = rows.map((row, r) => row.map((text, c) => {
    if (r < range.row || r >= range.row + range.rowSpan || c < range.column || c >= range.column + range.columnSpan) return text;
    pattern.lastIndex = 0; const matches = [...text.matchAll(pattern)]; if (!matches.length || options.wholeCell && matches[0][0] !== text) return text;
    pattern.lastIndex = 0; const next = text.replace(pattern, () => options.replacement);
    if (next.length > 200) throw new EditorError("copy.b1fee9bb72b1", "Replacement makes cell {{cell}} longer than 200 characters", { cell: String.fromCharCode(65 + c) + (r + 1) });
    cells++; occurrences += matches.length; return next;
  }));
  return { source: formatDelimitedData(result, "	"), cells, occurrences };
}

export type TableTextCleanup = "trim" | "upper" | "lower";
export function cleanTableText(source: string, cells: string, action: TableTextCleanup): { source: string; cells: number } {
  if (!["trim", "upper", "lower"].includes(action)) throw new EditorError("copy.37e84dcd2412", "Choose a text cleanup action");
  const rows = parseTableData(source), columns = Math.max(0, ...rows.map(row => row.length));
  if (!rows.length || !columns) throw new EditorError("copy.58bb9356472b", "Add table cells before cleaning text");
  const range = cells.trim() ? tableCellRange(cells, rows.length, columns) : { row: 0, column: 0, rowSpan: rows.length, columnSpan: columns }; let changed = 0;
  const result = rows.map((row, r) => row.map((text, c) => {
    if (r < range.row || r >= range.row + range.rowSpan || c < range.column || c >= range.column + range.columnSpan) return text;
    const next = action === "trim" ? text.trim() : action === "upper" ? text.toUpperCase() : text.toLowerCase();
    if (next.length > 200) throw new EditorError("copy.e23315c213ad", "Cleaned text makes cell {{cell}} longer than 200 characters", { cell: String.fromCharCode(65 + c) + (r + 1) });
    if (next !== text) changed++; return next;
  }));
  return { source: changed ? formatDelimitedData(result, "\t") : source, cells: changed };
}

/**
 * Shared draggable text presets used by the media panel, timeline drop
 * handlers, and preview compositor.
 */
export interface TextPreset {
  id: string;
  label: string;
  text: string;
  fontSize: number;
  fontWeight: number;
  /** Preview px shown in the media-panel chip. */
  previewSize: number;
}

export const TEXT_PRESETS: TextPreset[] = [
  { id: "heading", label: "Heading", text: "Heading", fontSize: 140, fontWeight: 800, previewSize: 22 },
  { id: "subheading", label: "Subhead", text: "Subheading", fontSize: 90, fontWeight: 600, previewSize: 16 },
  { id: "body", label: "Body", text: "Body text", fontSize: 56, fontWeight: 400, previewSize: 13 },
];

export const TEXT_DRAG_MIME = "application/x-dehub-text";

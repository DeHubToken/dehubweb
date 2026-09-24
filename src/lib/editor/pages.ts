/**
 * Pages are slices of the timeline. See ProjectSettings.pages.
 */
import type { Clip, ProjectSettings } from "./types";

/** Shortest a page can be; a new blank page gets this much room. */
export const PAGE_MIN = 5;

export interface Page {
  index: number;
  start: number;
  end: number;
}

export function timelineEnd(clips: Clip[]): number {
  return clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
}

export function getPages(settings: ProjectSettings, clips: Clip[]): Page[] {
  const starts = settings.pages && settings.pages.length ? settings.pages : [0];
  const end = timelineEnd(clips);
  return starts.map((start, index) => {
    const next = starts[index + 1];
    return { index, start, end: next ?? Math.max(end, start + PAGE_MIN) };
  });
}

export function pageAt(pages: Page[], t: number): Page {
  return pages.find((p) => t >= p.start && t < p.end) ?? pages[pages.length - 1];
}

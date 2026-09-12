import { describe, expect, it } from 'vitest';
import {
  BUTTON_CLASSES,
  TOAST_CLASSES,
  TOAST_FIT_CLASSES,
  TOASTER_COLUMN_CLASSES,
} from '@/components/ui/toast-classes';

describe('desktop toast positioning', () => {
  it('keeps paired action labels on one line at equal widths', () => {
    expect(BUTTON_CLASSES).toContain('flex-1');
    expect(BUTTON_CLASSES).toContain('min-w-0');
    expect(BUTTON_CLASSES).toContain('whitespace-nowrap');
    expect(BUTTON_CLASSES).toContain('text-ellipsis');
  });

  it('keeps loading indicators and their status on one row', () => {
    expect(TOAST_CLASSES).toContain('[&[data-type=loading]]:flex-row');
    expect(TOAST_CLASSES).toContain('[&[data-type=loading]]:items-center');
    expect(TOAST_CLASSES).toContain('[&[data-type=loading]_[data-title]]:whitespace-nowrap');
    expect(TOAST_CLASSES).not.toContain('group-[[data-type=loading]]');
  });

  it('only applies the app-column anchor to centered toaster groups', () => {
    expect(TOASTER_COLUMN_CLASSES).toContain('data-[x-position=center]:left-');
    expect(TOASTER_COLUMN_CLASSES).not.toMatch(/^left-/);
  });

  it('only applies auto-margin centering to centered toast groups', () => {
    expect(TOAST_FIT_CLASSES).toContain('group-data-[x-position=center]:inset-x-0');
    expect(TOAST_FIT_CLASSES).toContain('group-data-[x-position=center]:mx-auto');
    expect(TOAST_FIT_CLASSES).not.toMatch(/(?:^|\s)inset-x-0(?:\s|$)/);
    expect(TOAST_FIT_CLASSES).not.toMatch(/(?:^|\s)mx-auto(?:\s|$)/);
  });

  it('pins shrink-wrapped corner toasts to the matching rail edge', () => {
    expect(TOAST_FIT_CLASSES).toContain('group-data-[x-position=right]:left-auto');
    expect(TOAST_FIT_CLASSES).toContain('group-data-[x-position=right]:right-0');
    expect(TOAST_FIT_CLASSES).toContain('group-data-[x-position=left]:left-0');
    expect(TOAST_FIT_CLASSES).toContain('group-data-[x-position=left]:right-auto');
  });
});

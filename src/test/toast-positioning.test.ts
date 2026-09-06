import { describe, expect, it } from 'vitest';
import { TOAST_FIT_CLASSES, TOASTER_COLUMN_CLASSES } from '@/components/ui/toast-classes';

describe('desktop toast positioning', () => {
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
});

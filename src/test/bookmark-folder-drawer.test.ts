import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const drawer = readFileSync(
  join(process.cwd(), 'src', 'components', 'app', 'bookmarks', 'SaveToFolderDrawer.tsx'),
  'utf8',
);
const foldersHook = readFileSync(
  join(process.cwd(), 'src', 'hooks', 'use-bookmark-folders.ts'),
  'utf8',
);

describe('bookmark folder drawer regression contract', () => {
  it('fills the visible mobile viewport and protects the bottom safe area', () => {
    expect(drawer).toContain('h-[calc(100dvh_-_env(safe-area-inset-top)_-_0.75rem)]');
    expect(drawer).toContain('max-h-none');
    expect(drawer).toContain('env(safe-area-inset-bottom)');
    expect(drawer).toContain('md:h-[min(85dvh,640px)]');
  });

  it('keeps drawer controls monochrome', () => {
    expect(drawer).not.toMatch(/yellow-[0-9]+/);
    expect(drawer).toContain('border-zinc-100 bg-zinc-100');
    expect(drawer).toContain('bg-zinc-100 font-semibold text-zinc-950');
  });

  it('owns feedback above its content without duplicate global toasts', () => {
    expect(drawer).toContain('role="status"');
    expect(drawer).toContain("suppressToast: true");
    expect(drawer).not.toContain("import { toast } from 'sonner'");
    expect(drawer).toContain("setNotice({ message: `Saved to ${created.name}`, tone: 'success' })");
    expect(foldersHook).toContain('if (!suppressToast)');
  });
});

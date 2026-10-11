import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MediaPanel } from './MediaPanel';
import { useEditorStore } from '@/store/editorStore';
import { importFiles } from '@/lib/editor/importFiles';

const quota = vi.hoisted(() => ({ walletAddress: 'creator', badgeBalance: 12000000, username: 'maldoteth', quota: { tierName: 'Megalodon', bytes: 5 * 1024 ** 4 }, usedBytes: 0, overQuota: false, isAuthenticated: true, refetchUsage: vi.fn(async () => {}) }));
vi.mock('@/hooks/use-editor-quota', () => ({ useEditorQuota: () => quota }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key }) }));
vi.mock('@/lib/editor/importFiles', () => ({ importFiles: vi.fn(async () => []) }));
vi.mock('@/lib/editor/mediaStore', () => ({ deleteMedia: vi.fn() }));
vi.mock('@/lib/editor/cloudMedia', () => ({ deleteEditorAsset: vi.fn() }));
vi.mock('@/components/editor/RecordingPanel', () => ({ RecordingPanel: () => null }));
vi.mock('@/components/app/AppState', () => ({ AppState: () => null }));
vi.mock('@/store/editorMediaStore', () => ({ useEditorMediaStore: (select: (state: unknown) => unknown) => select({ cloudAssets: {}, hydrated: true, removeCloudAsset: vi.fn() }) }));
beforeEach(() => { vi.clearAllMocks(); useEditorStore.getState().newProject(); useEditorStore.setState({ media: [] }); });
afterEach(cleanup);
it('passes the displayed storage tier when files are uploaded', async () => {
  const view = render(<MediaPanel />), file = new File(['audio'], 'track.mp3', { type: 'audio/mpeg' });
  await act(async () => fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [file] } }));
  expect(importFiles).toHaveBeenCalledWith([file], { wallet: 'creator', badgeBalance: 12000000, username: 'maldoteth' });
  expect(quota.refetchUsage).toHaveBeenCalledOnce();
});

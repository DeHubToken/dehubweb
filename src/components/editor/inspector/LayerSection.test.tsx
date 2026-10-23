import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LayerSection } from './LayerSection';
import { useEditorStore } from '@/store/editorStore';
import type { Clip } from '@/lib/editor/types';

vi.mock('@/hooks/use-editor-quota', () => ({ useEditorQuota: () => ({ walletAddress: 'creator', badgeBalance: 0, username: 'creator', quota: null, usedBytes: 0, overQuota: false, isAuthenticated: true, refetchUsage: vi.fn() }) }));
vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => undefined }, Trans: ({ children }: { children?: unknown }) => children, useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key }) }));
class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal('ResizeObserver', NoResize); useEditorStore.getState().newProject(); useEditorStore.setState({ media: [] }); });
afterEach(cleanup);

const base = { trackId: 't', start: 0, duration: 4, trimIn: 0 };
const layers: Clip[] = [
  { ...base, id: 'video', kind: 'video', mediaId: 'm1' } as Clip,
  { ...base, id: 'bordered', kind: 'image', mediaId: 'm2', border: { color: '#ffffff', width: 6 } } as Clip,
  { ...base, id: 'text', kind: 'text', text: 'Hi', color: '#ffffff', stroke: { color: '#000000', width: 4 } } as Clip,
  { ...base, id: 'shape', kind: 'shape', shape: 'rect', fill: '#ffffff', stroke: { color: '#000000', width: 4 } } as Clip,
];

it.each(layers.map(clip => [clip.id, clip] as const))('opens the layer panel for a %s layer without crashing', (_, clip) => {
  expect(() => render(<LayerSection clip={clip} />)).not.toThrow();
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { RemakeEditorHandoff } from './RemakeEditorHandoff';

const mocks = vi.hoisted(() => ({ wallet: `0x${'1'.repeat(40)}`, load: vi.fn(), send: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ walletAddress: mocks.wallet }) }));
vi.mock('@/hooks/use-editor-quota', () => ({ useEditorQuota: () => ({ badgeBalance: 0, username: null }) }));
vi.mock('@/lib/creator/cloudLibrary', () => ({ loadCloudGenerationPage: mocks.load }));
vi.mock('@/lib/creator/sendToEditor', () => ({ sendJobToEditor: mocks.send }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const id = `remake-${'a'.repeat(48)}`;
let locationState: unknown;
function View({ show = true }: { show?: boolean }) {
  locationState = useLocation().state;
  return show ? <RemakeEditorHandoff /> : null;
}
function app(show = true) {
  return <MemoryRouter initialEntries={[{ pathname: '/editor', state: { remakeAssetId: id, wallet: `0x${'1'.repeat(40)}`, unrelated: true } }]}><View show={show} /></MemoryRouter>;
}
beforeEach(() => {
  mocks.wallet = `0x${'1'.repeat(40)}`;
  mocks.load.mockResolvedValue({ jobs: [{ id, kind: 'video', url: 'https://private.test/fresh' }], nextOffset: null });
  mocks.send.mockResolvedValue('media-1');
});
afterEach(() => vi.clearAllMocks());
describe('saved Remake editor delivery', () => {
  it('consumes only the handoff state so remounting cannot insert the clip again', async () => {
    const view = render(app());
    await waitFor(() => expect(locationState).toEqual({ unrelated: true }));
    expect(mocks.send).toHaveBeenCalledTimes(1);
    view.rerender(app(false)); view.rerender(app(true));
    await act(async () => {});
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('does not import an old account result when the account changes during lookup', async () => {
    let finish!: (value: unknown) => void;
    mocks.load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = render(app());
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));
    mocks.wallet = `0x${'2'.repeat(40)}`; view.rerender(app());
    await act(async () => { finish({ jobs: [{ id, kind: 'video' }], nextOffset: null }); });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('leaves a hydration/project-change refusal retryable and re-fetches its private link', async () => {
    mocks.send.mockResolvedValueOnce(null);
    render(app());
    await screen.findByText('creator.editorImportFailed');
    expect(locationState).toMatchObject({ remakeAssetId: id });
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    await waitFor(() => expect(locationState).toEqual({ unrelated: true }));
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });
});

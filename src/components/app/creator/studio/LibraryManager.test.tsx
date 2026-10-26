import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryManager } from './LibraryManager';
const mocks = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn(), apply: vi.fn() }));
vi.mock('@/lib/creator/cloudLibrary', () => ({ loadCloudGenerationPage: mocks.list, updateLibrarySelection: mocks.update }));
vi.mock('@/store/generationStore', () => ({ useGenerationStore: { getState: () => ({ applyLibraryPreferences: mocks.apply }) } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? children : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));
const rows = [{ id: 'first-asset', prompt: 'First take', hidden: false }, { id: 'second-asset', prompt: 'Second take', hidden: false }];
const open = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'multiPost.manage' }));
  await screen.findByLabelText('First take');
  fireEvent.click(screen.getByRole('button', { name: 'migrate.selectAll' }));
};
beforeEach(() => { vi.clearAllMocks(); mocks.list.mockResolvedValue({ jobs: rows, nextOffset: null }); });
describe('private generation management', () => {
  it('applies only acknowledged rows and leaves incomplete selections available for retry', async () => {
    mocks.update.mockResolvedValue({ completedIds: ['first-asset'], incompleteIds: ['second-asset'] });
    render(<LibraryManager wallet="owner" />); await open();
    fireEvent.click(screen.getByRole('button', { name: 'creator.libraryFavoriteAdd' }));
    await screen.findByText('1/100');
    expect(mocks.apply).toHaveBeenCalledWith(['first-asset'], { favorite: true });
    expect((screen.getByLabelText('Second take') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('alert')).toBeTruthy();
  });
  it('preserves selected rows after a failed mutation instead of claiming success', async () => {
    mocks.update.mockRejectedValue(new Error('offline'));
    render(<LibraryManager wallet="owner" />); await open();
    fireEvent.click(screen.getByRole('button', { name: 'editor.layers.hide' }));
    await screen.findByRole('alert');
    expect(screen.getByText('2/100')).toBeTruthy(); expect(mocks.apply).not.toHaveBeenCalled();
  });
  it('ignores a previous account response and reads the new account without stale selections', async () => {
    let finish!: (value: unknown) => void;
    mocks.update.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = render(<LibraryManager wallet="owner" />); await open();
    fireEvent.click(screen.getByRole('button', { name: 'editor.layers.hide' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    view.rerender(<LibraryManager wallet="new-owner" />);
    await act(async () => { finish({ completedIds: ['first-asset', 'second-asset'], incompleteIds: [] }); });
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(screen.getByText('0/100')).toBeTruthy();
    expect(mocks.list).toHaveBeenLastCalledWith('new-owner', 0, { hidden: false, favorites: false });
  });
  it('lists hidden media explicitly and restores it without a delete request', async () => {
    mocks.update.mockResolvedValue({ completedIds: ['first-asset', 'second-asset'], incompleteIds: [] });
    render(<LibraryManager wallet="owner" />);
    fireEvent.click(screen.getByRole('button', { name: 'multiPost.manage' }));
    await screen.findByLabelText('First take');
    mocks.list.mockResolvedValue({ jobs: rows.map(row => ({ ...row, hidden: true })), nextOffset: null });
    fireEvent.click(screen.getByRole('button', { name: 'settings.hiddenOption' }));
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith('owner', 0, { hidden: true, favorites: false }));
    await screen.findByLabelText('First take');
    fireEvent.click(screen.getByRole('button', { name: 'migrate.selectAll' }));
    fireEvent.click(screen.getByRole('button', { name: 'copy.a76e13b98392' }));
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledWith(['first-asset', 'second-asset'], { hidden: false }));
    expect(mocks.update).toHaveBeenCalledWith('owner', ['first-asset', 'second-asset'], 'restore');
  });
  it('reconciles the next page after selected rows leave the server filter', async () => {
    mocks.list.mockResolvedValueOnce({ jobs: rows, nextOffset: 2 });
    mocks.update.mockResolvedValue({ completedIds: rows.map(row => row.id), incompleteIds: [] });
    render(<LibraryManager wallet="owner" />); await open();
    fireEvent.click(screen.getByRole('button', { name: 'editor.layers.hide' }));
    await screen.findByText('0/100');
    mocks.list.mockResolvedValue({ jobs: [{ id: 'remaining-asset', prompt: 'Remaining take', hidden: false }], nextOffset: null });
    fireEvent.click(screen.getByRole('button', { name: 'common.loadMore' }));
    await screen.findByLabelText('Remaining take');
    expect(mocks.list).toHaveBeenLastCalledWith('owner', 0, { hidden: false, favorites: false });
  });
});

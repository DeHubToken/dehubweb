import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FolderPicker } from './LibraryFolders';
import { useCreatorFolderStore } from '@/store/creatorFolderStore';

vi.mock('@/lib/creator/flow/api', () => ({ canSyncFlows: () => false }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

beforeEach(() => useCreatorFolderStore.setState({ folders: [], itemFolderMap: {}, selectedFolderId: null }));
afterEach(cleanup);

describe('generation result folder picker', () => {
  it('opens an unfiled result and reacts to folder assignment without a render loop', () => {
    render(<FolderPicker itemId="generation-a" />);
    expect(screen.getByRole('button', { name: 'creatorFlow.foldersAddTo' })).toBeInTheDocument();

    act(() => useCreatorFolderStore.setState({ itemFolderMap: { 'generation-a': ['folder-a'] } }));
    expect(screen.getByRole('button', { name: 'creatorFlow.foldersInFolder' })).toBeInTheDocument();

    act(() => useCreatorFolderStore.setState({ itemFolderMap: {} }));
    expect(screen.getByRole('button', { name: 'creatorFlow.foldersAddTo' })).toBeInTheDocument();
  });
});

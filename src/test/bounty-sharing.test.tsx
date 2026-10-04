import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { JobCard } from '@/features/work/components/JobCard';
import type { WorkJob } from '@/features/work/types';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/app/war/WarHudIcon', () => ({ ThemedIcon: () => null }));
vi.mock('@/hooks/use-global-drop-zone', () => ({ useGlobalDropZone: () => ({ openPostModal: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({ open, children }: any) => open ? <div>{children}</div> : null,
  DrawerContent: ({ children }: any) => <div>{children}</div>,
  DrawerHeader: ({ children }: any) => <div>{children}</div>,
  DrawerTitle: ({ children }: any) => <h2>{children}</h2>,
}));
vi.mock('@/components/app/modals/ShareToDmModal', () => ({
  ShareToDmModal: ({ open, url }: { open: boolean; url: string }) => open ? <div data-testid="dm-share-url">{url}</div> : null,
}));

afterEach(cleanup);

describe('bounty sharing', () => {
  it('shares the canonical bounty URL from the board and keeps the message picker alive after closing the drawer', async () => {
    const job = { id: 'legacy-uuid', job_number: 14, job_type: 'contract', title: 'iPad tester', description: 'Test on iPad', total_budget: 100000, currency: 'DHB' } as WorkJob;
    render(<MemoryRouter><JobCard job={job} /></MemoryRouter>);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/bounty/14');
    expect(screen.getByRole('link')).not.toContainElement(screen.getByRole('button', { name: 'comments.share' }));
    fireEvent.click(screen.getByRole('button', { name: 'comments.share' }));
    fireEvent.click(await screen.findByRole('button', { name: /Send in a message/ }));
    expect(await screen.findByTestId('dm-share-url')).toHaveTextContent('https://dehub.io/bounty/14');
    expect(screen.queryByRole('heading', { name: 'Share' })).toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../QuotePostModal', () => ({
  QuotePostModal: ({ open }: { open: boolean }) => <div data-testid="quote-modal">{open ? 'open' : 'closed'}</div>,
}));

import { QuotePostModalLazy } from '../QuotePostModalLazy';

const post = { id: 1 } as never;

describe('QuotePostModalLazy', () => {
  it('mounts nothing until first opened, then stays mounted through close', async () => {
    const { rerender } = render(<QuotePostModalLazy open={false} onOpenChange={() => {}} quotedPost={post} />);
    expect(screen.queryByTestId('quote-modal')).toBeNull();

    rerender(<QuotePostModalLazy open onOpenChange={() => {}} quotedPost={post} />);
    expect((await screen.findByTestId('quote-modal')).textContent).toBe('open');

    rerender(<QuotePostModalLazy open={false} onOpenChange={() => {}} quotedPost={post} />);
    expect(screen.getByTestId('quote-modal').textContent).toBe('closed');
  });
});

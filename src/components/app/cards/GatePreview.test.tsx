import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GatePreview } from './GatePreview';

vi.mock('@/lib/media-url', () => ({ cdnImageSrcSet: () => undefined }));

describe('paywall cover', () => {
  it('renders a neutral panel without requesting an empty image', () => {
    const { container } = render(<GatePreview className="w-full h-full" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.firstElementChild?.className).toContain('bg-zinc-900');
  });
  it('replaces a failed cover and can load the next post cover', () => {
    const { container, rerender } = render(<GatePreview src="https://example.test/cover.jpg" />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    rerender(<GatePreview src="https://example.test/next.jpg" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://example.test/next.jpg');
  });
});

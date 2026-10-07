import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HandoffImage } from './HandoffImage';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('image recovery', () => {
  it('falls back once to the original and preserves that choice across renders', () => {
    const original = 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com/images/42.jpg';
    const transformed = `https://dehub.io/cdn-cgi/image/width=480/${original}`;
    const { container, rerender } = render(<HandoffImage mediaKey="fallback-test" src={transformed} />);
    const image = container.querySelector('img')!;
    fireEvent.error(image);
    expect(image.getAttribute('src')).toBe(original);
    rerender(<HandoffImage mediaKey="fallback-test" src={transformed} className="updated" />);
    expect(image.getAttribute('src')).toBe(original);
    fireEvent.error(image);
    expect(screen.getByRole('button', { name: 'common.retry' })).toBeTruthy();
    rerender(<HandoffImage mediaKey="fallback-test" src={transformed} />);
    expect(image.getAttribute('src')).toBe(original);
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    expect(image.getAttribute('src')).toBe(transformed);
  });
  it('does not append a cache buster to a signed source', () => {
    const signed = 'https://api.dehub.io/image/42?token=signature';
    const { container } = render(<HandoffImage mediaKey="signed-test" src={signed} />);
    const image = container.querySelector('img')!;
    fireEvent.error(image);
    expect(image.getAttribute('src')).toBe(signed);
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    expect(image.getAttribute('src')).toBe(signed);
  });
});

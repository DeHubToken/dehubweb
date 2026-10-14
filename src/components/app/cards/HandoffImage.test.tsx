import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HandoffImage } from './HandoffImage';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('image recovery', () => {
  it('does not measure or rewrite a cached image on unrelated feed updates', () => {
    const props = { mediaKey: 'layout-budget', src: '/photo.jpg', style: { width: '100%' }, onImageLoad: vi.fn() };
    const { container, rerender, unmount } = render(<HandoffImage {...props} />);
    const image = container.querySelector('img')!;
    Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 640 }, naturalHeight: { value: 480 } });
    const measure = vi.spyOn(image, 'getBoundingClientRect');
    fireEvent.load(image);
    expect(props.onImageLoad).toHaveBeenCalledTimes(1);
    measure.mockClear();
    const mutations = new MutationObserver(() => {});
    mutations.observe(image, { attributes: true, attributeFilter: ['style', 'class'] });
    rerender(<HandoffImage {...props} style={{ width: '100%' }} />);
    expect(measure).not.toHaveBeenCalled();
    expect(mutations.takeRecords()).toHaveLength(0);
    expect(props.onImageLoad).toHaveBeenCalledTimes(1);
    mutations.disconnect();
    unmount();
  });

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

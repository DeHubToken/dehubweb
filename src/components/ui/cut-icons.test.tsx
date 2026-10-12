import React from 'react';
import { render, screen } from '@testing-library/react';
import { Bell, Bookmark, MessageSquare, Share2, Coins, MicOff, EyeOff, Blog, Search, Quote, Copy, Flag, HelpCircle } from './cut-icons';
import approved from './cut-icon-paths.json';

describe('Cut icons', () => {
  it('preserves approved geometry, including the bell and aligned share node', () => {
    for (const [Component, name] of [[Bell, 'Alerts'], [MessageSquare, 'Messages'], [Share2, 'FeedShare'], [Blog, 'Blog'], [Search, 'Search'], [Quote, 'Quote'], [Copy, 'Copy'], [Flag, 'Report'], [HelpCircle, 'Help'], [Coins, 'Coins']] as const) {
      const { container, unmount } = render(<Component />);
      const reference = new DOMParser().parseFromString(`<svg>${approved[name]}</svg>`, 'image/svg+xml');
      expect([...container.querySelectorAll('path')].map(p => p.getAttribute('d')))
        .toEqual([...reference.querySelectorAll('path')].map(p => p.getAttribute('d')));
      expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 32 32');
      unmount();
    }
  });

  it('keeps muted icon masks unique when controls repeat in a feed', () => {
    const { container } = render(<><MicOff /><MicOff /><EyeOff /></>);
    const ids = [...container.querySelectorAll('mask')].map(mask => mask.id);
    expect(new Set(ids).size).toBe(3);
    for (const group of container.querySelectorAll('g[mask]')) {
      expect(ids).toContain(group.getAttribute('mask')?.slice(5, -1));
    }
  });

  it('uses vector DeHub artwork for monochrome coin controls', () => {
    const { container } = render(<Coins color="white" />);
    expect(container.querySelector('image, img')).toBeNull();
    expect(container.querySelectorAll('path').length).toBeGreaterThan(1);
    expect(container.querySelector('svg')).toHaveAttribute('color', 'white');
  });

  it('forwards refs, size, accessible names and selected-state styling', () => {
    const ref = React.createRef<SVGSVGElement>();
    render(<Bookmark ref={ref} size={20} aria-label="Saved" className="fill-current" />);
    expect(screen.getByLabelText('Saved')).toBe(ref.current);
    expect(ref.current).toHaveAttribute('width', '20');
    expect(ref.current).not.toHaveAttribute('aria-hidden');
    expect(ref.current?.querySelector('path')).toHaveAttribute('fill', 'inherit');
  });
});

import { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RetainedPostDock, RetainedPostSurface } from './RetainedPostSurface';
import { bindRetainedComments, getRetainedPost, useRetainedPost, type RetainedCommentsTab } from '@/lib/retained-post-surface';

afterEach(cleanup);

function Dock({ id }: { id: string | null }) {
  const entry = useRetainedPost(id);
  return entry ? <RetainedPostDock entry={entry} /> : null;
}

function StatefulCard({ mounted, onOpenComments }: { mounted: () => void; onOpenComments?: (tab?: RetainedCommentsTab) => void }) {
  const [count, setCount] = useState(0);
  useEffect(mounted, [mounted]);
  return <article>
    <img alt="Original photo" src="/photo.jpg" />
    <input aria-label="Card draft" defaultValue="draft" />
    <button onClick={() => setCount(value => value + 1)}>Count {count}</button>
    <button onClick={() => onOpenComments?.('quotes')}>Quotes</button>
  </article>;
}

describe('retained feed post', () => {
  it('keeps the same card, image and local state through opening and rapid Back', () => {
    const mounted = vi.fn();
    const view = (open: boolean) => <>
      <RetainedPostSurface id="retained-photo"><StatefulCard mounted={mounted} /></RetainedPostSurface>
      <Dock id={open ? 'retained-photo' : null} />
    </>;
    const result = render(view(false));
    const photo = screen.getByAltText('Original photo');
    const input = screen.getByRole('textbox', { name: 'Card draft' });
    fireEvent.change(input, { target: { value: 'still here' } });
    fireEvent.click(screen.getByRole('button', { name: 'Count 0' }));
    const source = result.container.querySelector('[data-retained-post-source]')!;
    vi.spyOn(getRetainedPost('retained-photo')!.container, 'getBoundingClientRect').mockReturnValue({ height: 321 } as DOMRect);
    result.rerender(view(true));
    expect(result.container.querySelector('[data-retained-post-dock]')!.contains(photo)).toBe(true);
    expect((source as HTMLElement).style.minHeight).toBe('321px');
    result.rerender(view(false));
    result.rerender(view(true));
    result.rerender(view(false));
    expect(source.contains(photo)).toBe(true);
    expect(screen.getByAltText('Original photo')).toBe(photo);
    expect(screen.getByRole('textbox', { name: 'Card draft' })).toBe(input);
    expect((input as HTMLInputElement).value).toBe('still here');
    expect(screen.getByRole('button', { name: 'Count 1' })).toBeTruthy();
    expect(mounted).toHaveBeenCalledTimes(1);
    expect((source as HTMLElement).style.minHeight).toBe('');
  });

  it('queues a comments action until lazy details are ready, then restores the feed callbacks', () => {
    const mounted = vi.fn();
    const view = (open: boolean) => <>
      <RetainedPostSurface id="retained-comments"><StatefulCard mounted={mounted} /></RetainedPostSurface>
      <Dock id={open ? 'retained-comments' : null} />
    </>;
    const result = render(view(true));
    fireEvent.click(screen.getByRole('button', { name: 'Quotes' }));
    const openComments = vi.fn();
    let unbind = () => {};
    act(() => { unbind = bindRetainedComments('retained-comments', openComments); });
    expect(openComments).toHaveBeenCalledExactlyOnceWith('quotes');
    result.rerender(view(false));
    fireEvent.click(screen.getByRole('button', { name: 'Quotes' }));
    expect(openComments).toHaveBeenCalledTimes(1);
    unbind();
  });

  it('releases the dock when the source post is removed', () => {
    const mounted = vi.fn();
    const view = (present: boolean) => <>
      {present && <RetainedPostSurface id="removed-post"><StatefulCard mounted={mounted} /></RetainedPostSurface>}
      <Dock id="removed-post" />
    </>;
    const result = render(view(true));
    expect(getRetainedPost('removed-post')?.dock).toBeTruthy();
    result.rerender(view(false));
    expect(getRetainedPost('removed-post')).toBeNull();
    expect(result.container.querySelector('[data-retained-post-dock]')).toBeNull();
    expect(result.container.querySelector('article')).toBeNull();
  });
});

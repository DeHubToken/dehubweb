import React, { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { useFeedSwallowClip } from '../../src/hooks/use-feed-swallow-clip';
import { FeedSwallowMotion } from '../../src/components/app/feeds/FeedSwallowMotion';

function Fixture() {
  const ref = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(ref, '[data-feed-nav]', [], { allThemes: true });
  return <><div data-feed-nav-outer><div data-feed-nav>Feed<span style={{ position: 'absolute', top: 0, left: '50%', width: 8, height: 2, background: '#ff0000' }} /></div></div><div data-feed-swallow-bounds><div ref={ref} id="feed"><FeedSwallowMotion><div id="posts" style={{ height: 12000, background: '#00ff00' }} /></FeedSwallowMotion></div></div></>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);

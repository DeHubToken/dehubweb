import React, { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { useFeedSwallowClip } from '../../src/hooks/use-feed-swallow-clip';

function Fixture() {
  const ref = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(ref, '[data-feed-nav]');
  return <><div data-feed-nav-outer><div data-feed-nav>Feed</div></div><div ref={ref} id="feed"><div style={{ height: 12000, background: '#00ff00' }} /></div></>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);

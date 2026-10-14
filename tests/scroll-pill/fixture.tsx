import React, { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { useFeedSwallowClip } from '../../src/hooks/use-feed-swallow-clip';
import { FeedSwallowMotion } from '../../src/components/app/feeds/FeedSwallowMotion';

function Fixture() {
  const ref = useRef<HTMLDivElement>(null);
  const welcome = new URLSearchParams(location.search).has('welcome');
  useFeedSwallowClip(ref, '[data-feed-nav]', [], { allThemes: true });
  return <><div data-feed-nav-outer><div data-feed-nav>Feed<span style={{ position: 'absolute', top: 0, left: '50%', width: 8, height: 2, background: '#ff0000' }} /></div></div><div data-feed-swallow-bounds><div ref={ref} id="feed"><FeedSwallowMotion>
    {welcome && <section className="dehub-intro" style={{ position: 'relative', height: 240, background: 'repeating-linear-gradient(90deg, #000 0 10px, #fff 10px 20px)' }} />}
    <div id="posts" style={{ height: 12000, background: welcome ? 'repeating-linear-gradient(90deg, #000 0 10px, #00ff00 10px 20px)' : '#00ff00' }} />
  </FeedSwallowMotion></div></div></>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);

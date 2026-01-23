import { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { TRENDING_TOPICS, EXTENDED_TRENDING_TOPICS, GENERATED_TRENDING_TOPICS } from '@/constants/app.constants';

// Parse post count and sort by most to least
const parsePostCount = (postCount: string): number => {
  const match = postCount.match(/([\d.]+)([KM]?)/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const suffix = match[2].toUpperCase();
  if (suffix === 'M') return num * 1000000;
  if (suffix === 'K') return num * 1000;
  return num;
};

const ALL_TOPICS = [...TRENDING_TOPICS, ...EXTENDED_TRENDING_TOPICS, ...GENERATED_TRENDING_TOPICS]
  .sort((a, b) => parsePostCount(b.postCount) - parsePostCount(a.postCount));
const BATCH_SIZE = 20;

export function WhatsHappening() {
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollTop + clientHeight >= scrollHeight - 50) {
      setVisibleCount(prev => Math.min(prev + BATCH_SIZE, ALL_TOPICS.length));
    }
  }, []);

  const visibleTopics = ALL_TOPICS.slice(0, visibleCount);

  return (
    <div className="bg-zinc-900 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-4 -mr-1.5">
        <h3 className="font-bold text-lg text-white">What's happening</h3>
        <Link 
          to="/app/explore" 
          className="text-sm text-white/70 hover:text-white transition-colors font-medium"
        >
          All
        </Link>
      </div>
      <div className="relative">
        {/* Bottom fade */}
        <div className="absolute left-0 right-0 bottom-0 h-8 bg-gradient-to-t from-zinc-900 to-transparent pointer-events-none z-10" />
        
        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          className="max-h-[240px] overflow-y-auto overflow-x-hidden scrollbar-invisible space-y-4 pr-1 pb-2"
        >
          {visibleTopics.map((item, index) => (
            <div key={`${item.tag}-${index}`}>
              <p className="font-semibold text-white">{item.tag}</p>
              <p className="text-white/70 text-sm">{item.postCount}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

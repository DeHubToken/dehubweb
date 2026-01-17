import { useState, useRef, useCallback } from 'react';
import { TRENDING_TOPICS, EXTENDED_TRENDING_TOPICS, GENERATED_TRENDING_TOPICS } from '@/constants/app.constants';

const ALL_TOPICS = [...TRENDING_TOPICS, ...EXTENDED_TRENDING_TOPICS, ...GENERATED_TRENDING_TOPICS];
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
      <h3 className="font-bold text-lg mb-4 text-white">What's happening</h3>
      <div className="relative">
        {/* Bottom fade */}
        <div className="absolute left-0 right-0 bottom-0 h-8 bg-gradient-to-t from-zinc-900 to-transparent pointer-events-none z-10" />
        
        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          className="max-h-[240px] overflow-y-auto scrollbar-invisible space-y-4 pr-1 pb-2"
        >
          {visibleTopics.map((item, index) => (
            <div
              key={`${item.tag}-${index}`}
              className="hover:bg-zinc-800 -mx-2 px-2 py-1 rounded-lg cursor-pointer transition-colors"
            >
              <p className="font-semibold text-white">{item.tag}</p>
              <p className="text-white/70 text-sm">{item.postCount}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

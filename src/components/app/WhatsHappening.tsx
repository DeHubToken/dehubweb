import { useState } from 'react';
import { TRENDING_TOPICS, EXTENDED_TRENDING_TOPICS } from '@/constants/app.constants';

export function WhatsHappening() {
  const [showMore, setShowMore] = useState(false);

  const allTopics = [...TRENDING_TOPICS, ...EXTENDED_TRENDING_TOPICS];
  const displayedTopics = showMore ? allTopics : TRENDING_TOPICS;

  return (
    <div className="bg-zinc-900 rounded-2xl p-4">
      <h3 className="font-bold text-lg mb-4 text-white">What's happening</h3>
      <div className="space-y-4">
        {displayedTopics.map((item) => (
          <div
            key={item.tag}
            className="hover:bg-zinc-800 -mx-2 px-2 py-1 rounded-lg cursor-pointer transition-colors"
          >
            <p className="font-semibold text-white">{item.tag}</p>
            <p className="text-white/70 text-sm">{item.postCount}</p>
          </div>
        ))}
      </div>
      <button
        onClick={() => setShowMore(!showMore)}
        className="w-full mt-1 py-2 text-white hover:text-zinc-300 transition-colors text-sm font-medium"
      >
        {showMore ? 'Show less' : 'Show more'}
      </button>
    </div>
  );
}

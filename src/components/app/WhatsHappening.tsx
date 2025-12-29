import { TRENDING_TOPICS } from '@/constants/app.constants';

export function WhatsHappening() {
  return (
    <div className="bg-zinc-900 rounded-2xl p-4">
      <h3 className="font-bold text-lg mb-4 text-white">What's happening</h3>
      <div className="space-y-4">
        {TRENDING_TOPICS.map((item) => (
          <div
            key={item.tag}
            className="hover:bg-zinc-800 -mx-2 px-2 py-1 rounded-lg cursor-pointer transition-colors"
          >
            <p className="font-semibold text-white">{item.tag}</p>
            <p className="text-zinc-500 text-sm">{item.postCount}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

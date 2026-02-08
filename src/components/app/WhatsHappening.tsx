import { Link } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';

export function WhatsHappening() {
  return (
    <div className="bg-zinc-900 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-4 pr-1.5">
        <h3 className="font-bold text-lg text-white">Talk of the Town</h3>
        <Link 
          to="/app/explore" 
          className="text-sm text-white/70 hover:text-white transition-colors font-medium"
        >
          All
        </Link>
      </div>
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center mb-3">
          <TrendingUp className="w-6 h-6 text-zinc-500" />
        </div>
        <p className="text-zinc-400 text-sm">No trending topics yet</p>
      </div>
    </div>
  );
}
import { UserPlus } from 'lucide-react';

export function WhoToFollow() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-3">
        <UserPlus className="w-6 h-6 text-zinc-500" />
      </div>
      <p className="text-zinc-400 text-sm">No suggestions yet</p>
    </div>
  );
}
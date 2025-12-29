import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { WhoToFollow } from './WhoToFollow';
import { WhatsHappening } from './WhatsHappening';

interface RightSidebarProps {
  showSearch?: boolean;
}

export function RightSidebar({ showSearch = true }: RightSidebarProps) {
  return (
    <aside className="hidden xl:block w-80 h-screen sticky top-0 p-4 space-y-4 overflow-y-auto scrollbar-invisible">
      {showSearch && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
          <Input
            placeholder="Search..."
            className="w-full pl-10 bg-zinc-900 border-zinc-800 rounded-full text-white placeholder:text-zinc-500 focus:border-zinc-700"
          />
        </div>
      )}
      <WhoToFollow />
      <WhatsHappening />
    </aside>
  );
}

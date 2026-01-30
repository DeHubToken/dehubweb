import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { TabbedSidePanel } from './sidebar';
import { WhatsHappening } from './WhatsHappening';

interface RightSidebarProps {
  showSearch?: boolean;
}

export function RightSidebar({ showSearch = true }: RightSidebarProps) {
  const [searchValue, setSearchValue] = useState('');
  const navigate = useNavigate();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchValue.trim()) {
      navigate(`/app/explore?q=${encodeURIComponent(searchValue.trim())}`);
      setSearchValue('');
    }
  };

  return (
    <aside className="hidden xl:block w-80 h-screen sticky top-0 p-4 space-y-4 overflow-y-auto scrollbar-invisible">
      {showSearch && (
        <div className="bg-zinc-900 rounded-2xl p-2 -mt-[5px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search..."
              className="w-full pl-10 bg-zinc-800 border-0 rounded-xl text-white placeholder:text-zinc-500 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-9"
            />
          </div>
        </div>
      )}
      <div className="-mt-[10px] space-y-4">
        <TabbedSidePanel />
        <WhatsHappening />
      </div>
    </aside>
  );
}

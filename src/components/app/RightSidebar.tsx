import { useState, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { TabbedSidePanel } from './sidebar';
import { WhatsHappening } from './WhatsHappening';
import { useSearchHistory } from '@/hooks/use-search-history';

interface RightSidebarProps {
  showSearch?: boolean;
}

// Inner search component that uses router hooks (isolates re-renders)
function SearchBar() {
  const [searchValue, setSearchValue] = useState('');
  const navigate = useNavigate();
  const { addToHistory } = useSearchHistory();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchValue.trim()) {
      addToHistory(searchValue.trim());
      navigate(`/app/explore?q=${encodeURIComponent(searchValue.trim())}`);
      setSearchValue('');
    }
  };

  return (
    <div className="bg-zinc-900 rounded-xl p-[3px] -mt-[5px]">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search..."
          className="w-full pl-10 bg-zinc-800 border-0 rounded-[9px] text-white placeholder:text-zinc-500 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-9"
        />
      </div>
    </div>
  );
}

export const RightSidebar = memo(function RightSidebar({ showSearch = true }: RightSidebarProps) {
  return (
    <aside className="hidden lg:block w-80 xl:w-88 h-screen sticky top-0 p-4 overflow-y-auto scrollbar-hide z-0 isolate">
      {showSearch && <SearchBar />}
      <div className="mt-[11px] space-y-4">
        <TabbedSidePanel />
        <WhatsHappening />
      </div>
    </aside>
  );
});

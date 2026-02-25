import { useState, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { TabbedSidePanel } from './sidebar';
import { WhatsHappening } from './WhatsHappening';
import { useSearchHistory } from '@/hooks/use-search-history';
import { useSidebarCollapse } from '@/contexts/SidebarCollapseContext';
import { cn } from '@/lib/utils';

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
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
      <Input
        value={searchValue}
        onChange={(e) => setSearchValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search..."
        className="w-full pl-10 bg-zinc-900 border-0 rounded-xl text-white placeholder:text-zinc-500 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-[38px]"
      />
    </div>
  );
}

export const RightSidebar = memo(function RightSidebar({ showSearch = true }: RightSidebarProps) {
  const { isCollapsed } = useSidebarCollapse();
  return (
    <aside className={cn("hidden lg:block w-72 xl:w-80 2xl:w-88 h-screen sticky top-0 pb-4 overflow-y-auto scrollbar-hide z-0 isolate transition-[padding] duration-500 ease-in-out motion-reduce:transition-none will-change-[padding]", isCollapsed ? "pl-0 pr-2 pt-[6px]" : "px-4 pt-[8px]")}>
      {showSearch && <SearchBar />}
      <div className="mt-[11px] space-y-4">
        <TabbedSidePanel />
        <WhatsHappening />
      </div>
    </aside>
  );
});

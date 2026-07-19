
import React from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDocsSearch } from '@/hooks/useDocsSearch';

export const SearchTrigger = () => {
  const { setIsOpen } = useDocsSearch();

  const handleClick = () => {
    setIsOpen(true);
  };

  return (
    <Button
      variant="ghost"
      className="relative h-9 w-full justify-start text-sm border border-border bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground sm:pr-12 md:w-40 lg:w-64 rounded-lg"
      onClick={handleClick}
    >
      <Search className="mr-2 h-4 w-4" />
      <span className="hidden lg:inline-flex">Search docs & blog...</span>
      <span className="inline-flex lg:hidden">Search...</span>
      <kbd className="pointer-events-none absolute right-1.5 top-1.5 hidden h-5 select-none items-center gap-1 rounded border border-border bg-background/60 px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100 sm:flex">
        <span className="text-xs">⌘</span>K
      </kbd>
    </Button>
  );
};

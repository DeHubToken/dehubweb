import React, { useEffect } from 'react';
import { Search, Clock, Hash, FileText, Book, ArrowRight } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useDocsSearch } from '@/hooks/useDocsSearch';

export const SearchDialog = () => {
  const {
    isOpen,
    setIsOpen,
    query,
    setQuery,
    results,
    isLoading,
    recentSearches,
    highlightedIndex,
    navigateToResult,
    clearRecentSearches
  } = useDocsSearch();

  const getIconForType = (type: string) => {
    switch (type) {
      case 'blog':
        return <Book className="w-4 h-4" />;
      case 'section':
        return <Hash className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const highlightText = (text: string, highlight: string) => {
    if (!highlight.trim()) return text;
    
    const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200 dark:bg-yellow-800 px-1 rounded">
          {part}
        </mark>
      ) : part
    );
  };

  const truncateContent = (content: string, maxLength: number = 100) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
  };

  return (
    <CommandDialog 
      open={isOpen} 
      onOpenChange={handleOpenChange} 
      shouldFilter={false}
    >
      <CommandInput
        placeholder="Search documentation..."
        value={query}
        onValueChange={setQuery}
      />

      <CommandList className="max-h-[400px] overflow-y-auto">
        {!query && recentSearches.length > 0 && (
          <>
            <CommandGroup heading="Recent Searches">
              {recentSearches.map((search, index) => (
                <CommandItem
                  key={search}
                  onSelect={() => setQuery(search)}
                  className="cursor-pointer"
                >
                  <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{search}</span>
                </CommandItem>
              ))}
              <CommandItem
                onSelect={clearRecentSearches}
                className="cursor-pointer text-muted-foreground"
              >
                Clear recent searches
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {!query && !recentSearches.length && (
          <CommandGroup heading="Popular Searches">
            <CommandItem onSelect={() => setQuery('token economics')}>
              <Hash className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>Token Economics</span>
            </CommandItem>
            <CommandItem onSelect={() => setQuery('staking')}>
              <Hash className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>Staking</span>
            </CommandItem>
            <CommandItem onSelect={() => setQuery('depin')}>
              <Hash className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>DePIN</span>
            </CommandItem>
            <CommandItem onSelect={() => setQuery('governance')}>
              <Hash className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>Governance</span>
            </CommandItem>
          </CommandGroup>
        )}

        {query && isLoading && (
          <CommandEmpty>
            <div className="flex items-center justify-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              <span className="ml-2">Searching...</span>
            </div>
          </CommandEmpty>
        )}

        {query && !isLoading && results.length === 0 && (
          <CommandEmpty>
            <div className="py-6 text-center">
              <Search className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No results found for "{query}"
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Try different keywords or check spelling
              </p>
            </div>
          </CommandEmpty>
        )}

        {query && !isLoading && results.length > 0 && (
          <>
            {['Main', 'Token', 'Development', 'Blog', 'Legal', 'Brand', 'Support'].map(category => {
              const categoryResults = results.filter(result => result.category === category);
              if (categoryResults.length === 0) return null;

              return (
                <CommandGroup key={category} heading={category}>
                  {categoryResults.map((result, index) => {
                    const globalIndex = results.findIndex(r => r.id === result.id);
                    const isHighlighted = globalIndex === highlightedIndex;
                    
                    return (
                      <CommandItem
                        key={result.id}
                        onSelect={() => navigateToResult(result, query)}
                        className={`cursor-pointer p-3 ${isHighlighted ? 'bg-accent' : ''}`}
                      >
                        <div className="flex items-start w-full">
                          <div className="mr-3 mt-0.5 flex-shrink-0">
                            {getIconForType(result.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-medium truncate">
                                {highlightText(result.title, query)}
                              </h4>
                              <ArrowRight className="h-3 w-3 text-muted-foreground ml-2 flex-shrink-0" />
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {highlightText(truncateContent(result.content), query)}
                            </p>
                            <div className="flex items-center mt-2 text-xs text-muted-foreground">
                              <span className="bg-muted px-2 py-0.5 rounded text-xs">
                                {result.category}
                              </span>
                              {result.score && (
                                <span className="ml-2">
                                  {Math.round((1 - result.score) * 100)}% match
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              );
            })}
          </>
        )}
      </CommandList>

      <div className="border-t px-3 py-2 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>Use ↑↓ to navigate, ↵ to select, ⎋ to close</span>
          <span>{results.length > 0 && `${results.length} result${results.length === 1 ? '' : 's'}`}</span>
        </div>
      </div>
    </CommandDialog>
  );
};

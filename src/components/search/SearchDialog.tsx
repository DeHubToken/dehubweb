import React from 'react';
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
    recentSearches,
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

    // split() with a capture group alternates non-match / match — odd indices
    // are the matches. (Testing each part against a stateful /g regex here
    // mis-highlighted every other occurrence via lastIndex carry-over.)
    return parts.map((part, index) =>
      index % 2 === 1 ? (
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
    if (!open) setQuery('');
  };

  // Group by category while preserving Fuse's relevance order: categories
  // appear in the order of their best-ranked result.
  const categories = Array.from(new Set(results.map(r => r.category)));

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={handleOpenChange}
      shouldFilter={false}
    >
      <CommandInput
        placeholder="Search docs & blog..."
        value={query}
        onValueChange={setQuery}
      />

      <CommandList className="max-h-[400px] overflow-y-auto">
        {!query && recentSearches.length > 0 && (
          <>
            <CommandGroup heading="Recent Searches">
              {recentSearches.map(search => (
                <CommandItem
                  key={search}
                  value={`recent-${search}`}
                  onSelect={() => setQuery(search)}
                  className="cursor-pointer"
                >
                  <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{search}</span>
                </CommandItem>
              ))}
              <CommandItem
                value="recent-clear"
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
            {['Token Economics', 'Staking', 'Watch to Earn', 'DePIN', 'Governance'].map(term => (
              <CommandItem key={term} value={`popular-${term}`} onSelect={() => setQuery(term.toLowerCase())}>
                <Hash className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>{term}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {query && results.length === 0 && (
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

        {query && results.length > 0 && categories.map(category => {
          const categoryResults = results.filter(result => result.category === category);

          return (
            <CommandGroup key={category} heading={category}>
              {categoryResults.map(result => (
                <CommandItem
                  key={result.id}
                  value={result.id}
                  onSelect={() => navigateToResult(result, query)}
                  className="cursor-pointer p-3"
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
                          {result.type === 'blog' && result.category === 'Blog' ? 'Blog post' : result.category}
                        </span>
                        {typeof result.score === 'number' && (
                          <span className="ml-2">
                            {Math.round((1 - result.score) * 100)}% match
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
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

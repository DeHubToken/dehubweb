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
import { AppState } from '@/components/app/AppState';
import { useLanguage } from '@/contexts/LanguageContext';

// The query each popular chip runs stays English, the language the index is
// built in; only the label is translated.
const POPULAR_SEARCHES = [
  { key: 'popularTokenEconomics', query: 'token economics' },
  { key: 'popularStaking', query: 'staking' },
  { key: 'popularWatchToEarn', query: 'watch to earn' },
  { key: 'popularDepin', query: 'depin' },
  { key: 'popularGovernance', query: 'governance' },
] as const;

export const SearchDialog = () => {
  const { t } = useLanguage();
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
        <mark key={index} className="bg-foreground/15 text-foreground px-1 rounded">
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
      title={t('docsSearch.title')}
      contentClassName="bg-popover text-popover-foreground border-border"
      contentProps={{ 'data-docs-dialog': true }}
    >
      <CommandInput
        placeholder={t('docsSearch.placeholder')}
        value={query}
        onValueChange={setQuery}
      />

      <CommandList className="max-h-[400px] overflow-y-auto">
        {!query && recentSearches.length > 0 && (
          <>
            <CommandGroup heading={t('docsSearch.recent')}>
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
                {t('docsSearch.clearRecent')}
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {!query && !recentSearches.length && (
          <CommandGroup heading={t('docsSearch.popular')}>
            {POPULAR_SEARCHES.map(({ key, query: term }) => (
              <CommandItem key={key} value={`popular-${key}`} onSelect={() => setQuery(term)}>
                <Hash className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>{t(`docsSearch.${key}`)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {query && results.length === 0 && (
          <CommandEmpty>
            <AppState
              icon="search"
              title={t('docsSearch.noResults').replace('{query}', query)}
              description={t('docsSearch.noResultsHint')}
              kind="search-empty"
              size="compact"
            />
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
                          {result.type === 'blog' && result.category === 'Blog' ? t('docsSearch.blogPost') : result.category}
                        </span>
                        {typeof result.score === 'number' && (
                          <span className="ml-2">
                            {t('docsSearch.match').replace('{percent}', String(Math.round((1 - result.score) * 100)))}
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
          <span>{t('docsSearch.keyboardHint')}</span>
          <span>{results.length > 0 && (results.length === 1 ? t('docsSearch.resultOne') : t('docsSearch.resultMany').replace('{count}', String(results.length)))}</span>
        </div>
      </div>
    </CommandDialog>
  );
};

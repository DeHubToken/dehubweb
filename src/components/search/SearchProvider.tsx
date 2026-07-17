
import React from 'react';
import { SearchProvider as SearchContextProvider } from '@/contexts/SearchContext';
import { SearchDialog } from './SearchDialog';

interface SearchProviderProps {
  children: React.ReactNode;
}

export const SearchProvider: React.FC<SearchProviderProps> = ({ children }) => {
  return (
    <SearchContextProvider>
      {children}
      <SearchDialog />
      <style>{`
        @keyframes searchHighlight {
          0%, 100% { 
            background-color: rgb(254 240 138); 
            transform: scale(1);
          }
          50% { 
            background-color: rgb(251 191 36); 
            transform: scale(1.05);
          }
        }
        
        .dark .search-highlight {
          background-color: rgb(133 77 14) !important;
        }
        
        .dark .search-highlight:nth-child(even) {
          background-color: rgb(146 64 14) !important;
        }
      `}</style>
    </SearchContextProvider>
  );
};

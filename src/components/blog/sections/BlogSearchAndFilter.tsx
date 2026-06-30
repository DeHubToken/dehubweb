import React from 'react';
import { Search, Tag } from 'lucide-react';
import { BlogTag } from '@/types/blog';
import { useLanguage } from '@/contexts/LanguageContext';

interface BlogSearchAndFilterProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedTag: string;
  setSelectedTag: (tag: string) => void;
  allTags: BlogTag[];
}

export const BlogSearchAndFilter: React.FC<BlogSearchAndFilterProps> = ({
  searchQuery,
  setSearchQuery,
  selectedTag,
  setSelectedTag,
  allTags
}) => {
  const { t } = useLanguage();

  return (
    <div className="bg-plain-white rounded-2xl border border-sky-blue/20 p-6">
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-royal-blue/40 w-5 h-5" />
          <input
            type="text"
            placeholder={t('blog.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-sky-blue/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-middle-blue/20 focus:border-middle-blue font-exo"
          />
        </div>

        <div className="lg:w-64 relative">
          <Tag className="absolute left-3 top-1/2 transform -translate-y-1/2 text-royal-blue/40 w-5 h-5" />
          <select
            value={selectedTag}
            onChange={(e) => setSelectedTag(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-sky-blue/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-middle-blue/20 focus:border-middle-blue font-exo appearance-none bg-white"
          >
            <option value="">{t('blog.allTags')}</option>
            {allTags.map(tag => (
              <option key={tag.name} value={tag.name}>
                {tag.name} ({tag.count})
              </option>
            ))}
          </select>
        </div>

        {(searchQuery || selectedTag) && (
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedTag('');
            }}
            className="px-4 py-3 border border-sky-blue/20 text-royal-blue rounded-lg hover:bg-sky-blue/10 transition-colors duration-200 font-exo"
          >
            {t('blog.clearFilters')}
          </button>
        )}
      </div>
    </div>
  );
};

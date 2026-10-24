import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Filter, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { KEYWORD_FILTERS_QUERY_KEY, useKeywordFilters } from '@/hooks/use-keyword-filters';
import {
  createKeywordFilter,
  deleteKeywordFilter,
  FILTER_CONTEXTS,
  type FilterAction,
  type FilterContext,
  type KeywordFilter,
} from '@/lib/api/dehub/keyword-filters';
import { SETTINGS_CONTROL_CLASS, SETTINGS_FIELD_CLASS, SETTINGS_HEADING_CLASS, SETTINGS_INLINE_ACTION_CLASS } from './SettingsRow';

/** "For how long" choices, in seconds; null keeps the filter until removed. */
const DURATIONS: Array<{ key: string; seconds: number | null }> = [
  { key: 'forever', seconds: null },
  { key: 'duration1h', seconds: 60 * 60 },
  { key: 'duration1d', seconds: 24 * 60 * 60 },
  { key: 'duration7d', seconds: 7 * 24 * 60 * 60 },
  { key: 'duration30d', seconds: 30 * 24 * 60 * 60 },
];

/**
 * Settings → Privacy → Muted words. The viewer's keyword filters: posts and
 * comments containing one are hidden, or folded behind a line naming it, in
 * the places picked. Matching is KeywordFilterGate's; this only edits the list.
 */
export function KeywordFiltersSection() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const filters = useKeywordFilters();
  const [phrase, setPhrase] = useState('');
  const [wholeWord, setWholeWord] = useState(true);
  const [action, setAction] = useState<FilterAction>('warn');
  const [duration, setDuration] = useState(0);
  const [contexts, setContexts] = useState<FilterContext[]>([...FILTER_CONTEXTS]);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: KEYWORD_FILTERS_QUERY_KEY });

  const toggleContext = (context: FilterContext) =>
    setContexts((prev) => (prev.includes(context) ? prev.filter((c) => c !== context) : [...prev, context]));

  const handleAdd = async () => {
    const text = phrase.trim();
    if (!text || !contexts.length || saving) return;
    setSaving(true);
    try {
      await createKeywordFilter({ phrase: text, wholeWord, action, contexts, expiresIn: DURATIONS[duration].seconds });
      toast.success(t('keywordFilters.added', { phrase: text }));
      setPhrase('');
      await refresh();
    } catch {
      toast.error(t('keywordFilters.failed'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (filter: KeywordFilter) => {
    setRemoving(filter.id);
    try {
      await deleteKeywordFilter(filter.id);
      await refresh();
    } catch {
      toast.error(t('keywordFilters.failed'));
    } finally {
      setRemoving(null);
    }
  };

  const summary = (filter: KeywordFilter) => {
    const parts = [
      t(filter.action === 'hide' ? 'keywordFilters.hide' : 'keywordFilters.warn'),
      filter.contexts.length === FILTER_CONTEXTS.length ? null : filter.contexts.map((c) => t(`keywordFilters.${c}`)).join(', '),
      filter.expiresAt
        ? t('keywordFilters.until', {
            date: new Date(filter.expiresAt).toLocaleString(i18n.resolvedLanguage, { dateStyle: 'medium', timeStyle: 'short' }),
          })
        : null,
    ];
    return parts.filter(Boolean).join(' · ');
  };

  return (
    <div>
      <h3 className={SETTINGS_HEADING_CLASS}>
        <Filter className="size-4" />
        {t('keywordFilters.title')}
      </h3>
      <p className="mb-4 text-sm text-zinc-500">{t('keywordFilters.description')}</p>

      <div className="space-y-3 rounded-xl border border-zinc-700/50 bg-zinc-800/50 p-3">
        <div className="flex gap-2">
          <Input
            value={phrase}
            onChange={(e) => setPhrase(e.target.value.slice(0, 100))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleAdd();
            }}
            placeholder={t('keywordFilters.placeholder')}
            aria-label={t('keywordFilters.placeholder')}
            maxLength={100}
            className={SETTINGS_FIELD_CLASS}
          />
          <Button
            type="button"
            variant="outline"
            className={SETTINGS_INLINE_ACTION_CLASS}
            onClick={() => void handleAdd()}
            disabled={!phrase.trim() || !contexts.length}
            loading={saving}
          >
            {t('keywordFilters.add')}
          </Button>
        </div>

        <label className="flex items-center justify-between gap-3 text-sm text-white">
          {t('keywordFilters.wholeWord')}
          <Switch checked={wholeWord} onCheckedChange={setWholeWord} className="data-[state=checked]:bg-white" />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as FilterAction)}
            aria-label={t('keywordFilters.whenMatches')}
            className={cn(SETTINGS_CONTROL_CLASS, 'outline-none')}
          >
            <option value="warn">{t('keywordFilters.warn')}</option>
            <option value="hide">{t('keywordFilters.hide')}</option>
          </select>
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            aria-label={t('keywordFilters.howLong')}
            className={cn(SETTINGS_CONTROL_CLASS, 'outline-none')}
          >
            {DURATIONS.map((d, index) => (
              <option key={d.key} value={index}>
                {t(`keywordFilters.${d.key}`)}
              </option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className="mb-2 text-xs font-medium text-zinc-400">{t('keywordFilters.where')}</legend>
          <div className="flex flex-wrap gap-2">
            {FILTER_CONTEXTS.map((context) => {
              const on = contexts.includes(context);
              return (
                <button
                  key={context}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleContext(context)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    on ? 'border-white bg-white text-black' : 'border-zinc-700 text-zinc-300 hover:bg-zinc-700',
                  )}
                >
                  {t(`keywordFilters.${context}`)}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      {filters.length === 0 ? (
        <p className="py-3 text-sm text-zinc-500">{t('keywordFilters.empty')}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {filters.map((filter) => (
            <li
              key={filter.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-zinc-700/50 bg-zinc-800/50 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{filter.phrase}</p>
                <p className="truncate text-xs text-zinc-500">{summary(filter)}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(SETTINGS_CONTROL_CLASS, 'shrink-0')}
                onClick={() => void handleRemove(filter)}
                loading={removing === filter.id}
                aria-label={`${t('keywordFilters.remove')}: ${filter.phrase}`}
              >
                <X className="size-4" />
                {t('keywordFilters.remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

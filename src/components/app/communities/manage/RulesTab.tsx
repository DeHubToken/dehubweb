/**
 * Rules tab
 * =========
 * `communities.rules` is a free-form JSON array: historically it has held plain
 * strings and objects shaped `{ text }` or `{ title }`. Everything is flattened
 * to strings on read (matching the reader in CommunityAbout) and always written
 * back as a clean string[].
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Loader2, Plus, ScrollText, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCommunityAbilities, useUpdateCommunitySettings } from '@/hooks/use-community-admin';
import type { Community, CommunityMember } from '@/hooks/use-communities';

export interface RulesTabProps {
  community: Community;
  membership: CommunityMember | null | undefined;
}

const MAX_RULES = 20;
const MAX_RULE_LENGTH = 200;

function normaliseRules(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(rule => {
    if (typeof rule === 'string') return rule;
    if (rule && typeof rule === 'object') {
      const record = rule as { text?: unknown; title?: unknown };
      if (typeof record.text === 'string') return record.text;
      if (typeof record.title === 'string') return record.title;
    }
    return '';
  });
}

function clean(rules: string[]): string[] {
  return rules.map(rule => rule.trim()).filter(rule => rule.length > 0);
}

export function RulesTab({ community, membership }: RulesTabProps) {
  const { t } = useTranslation();
  const abilities = useCommunityAbilities(community, membership);
  const updateMutation = useUpdateCommunitySettings();

  const savedRules = useMemo(() => normaliseRules(community.rules), [community.rules]);
  // Serialised so a refetch returning the same content does not wipe an edit in
  // progress just because the array identity changed.
  const savedKey = JSON.stringify(clean(savedRules));

  const [rules, setRules] = useState<string[]>(() => clean(savedRules));

  useEffect(() => {
    setRules(JSON.parse(savedKey) as string[]);
  }, [savedKey]);

  const canEdit = abilities.can('change_info');
  const cleaned = clean(rules);
  const isDirty = JSON.stringify(cleaned) !== savedKey;
  const isSaving = updateMutation.isPending;

  const updateRule = (index: number, value: string) =>
    setRules(current => current.map((rule, i) => (i === index ? value : rule)));

  const removeRule = (index: number) =>
    setRules(current => current.filter((_, i) => i !== index));

  const moveRule = (index: number, direction: -1 | 1) =>
    setRules(current => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });

  const addRule = () =>
    setRules(current => (current.length >= MAX_RULES ? current : [...current, '']));

  const handleSave = () => {
    updateMutation.mutate(
      { communityId: community.id, patch: { rules: cleaned } },
      {
        onSuccess: () =>
          toast.success(t('communities.manage.rulesUpdated', { defaultValue: 'Rules updated' })),
      },
    );
  };

  if (!canEdit) {
    return (
      <p className="text-center text-zinc-500 text-sm py-8">
        {t('communities.manage.rulesNoAccess', {
          defaultValue: 'You do not have permission to edit the rules.',
        })}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-white font-medium text-sm flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-zinc-400" />
            {t('communities.manage.rules', { defaultValue: 'Community rules' })}
          </h3>
          <span className="text-zinc-500 text-xs shrink-0">
            {rules.length}/{MAX_RULES}
          </span>
        </div>
        <p className="text-zinc-500 text-xs mt-1">
          {t('communities.manage.rulesHint', {
            defaultValue: 'Shown on the About tab. Empty rules are dropped when you save.',
          })}
        </p>

        {rules.length === 0 ? (
          <p className="text-center text-zinc-500 text-sm py-6">
            {t('communities.manage.rulesEmpty', { defaultValue: 'No rules yet.' })}
          </p>
        ) : (
          <ol className="mt-2.5 space-y-1.5">
            {rules.map((rule, index) => (
              <li key={index} className="flex items-center gap-2">
                <span className="text-zinc-600 text-xs w-4 text-right shrink-0">{index + 1}.</span>
                <Input
                  value={rule}
                  maxLength={MAX_RULE_LENGTH}
                  onChange={event => updateRule(index, event.target.value)}
                  placeholder={t('communities.manage.rulePlaceholder', {
                    defaultValue: 'Describe the rule',
                  })}
                  aria-label={t('communities.manage.ruleNumber', {
                    defaultValue: 'Rule {{number}}',
                    number: index + 1,
                  })}
                  className="h-9 flex-1 min-w-0 rounded-xl border-white/10 bg-white/[0.04] text-white text-sm placeholder:text-zinc-600"
                />
                <span className="text-zinc-600 text-[11px] w-12 text-right shrink-0 tabular-nums">
                  {rule.length}/{MAX_RULE_LENGTH}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => moveRule(index, -1)}
                    disabled={index === 0 || isSaving}
                    className="h-9 w-9 p-0 rounded-xl text-zinc-400 border border-white/[0.08]"
                    title={t('communities.manage.moveUp', { defaultValue: 'Move up' })}
                    aria-label={t('communities.manage.moveUp', { defaultValue: 'Move up' })}
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => moveRule(index, 1)}
                    disabled={index === rules.length - 1 || isSaving}
                    className="h-9 w-9 p-0 rounded-xl text-zinc-400 border border-white/[0.08]"
                    title={t('communities.manage.moveDown', { defaultValue: 'Move down' })}
                    aria-label={t('communities.manage.moveDown', { defaultValue: 'Move down' })}
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeRule(index)}
                    disabled={isSaving}
                    className="h-9 w-9 p-0 rounded-xl text-red-400 hover:bg-red-500/15 border border-white/[0.08]"
                    title={t('communities.manage.removeRule', { defaultValue: 'Remove rule' })}
                    aria-label={t('communities.manage.removeRule', { defaultValue: 'Remove rule' })}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={addRule}
            disabled={rules.length >= MAX_RULES || isSaving}
            className="rounded-xl h-9 px-3 text-zinc-300 hover:bg-white/[0.06] border border-white/[0.08] gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('communities.manage.addRule', { defaultValue: 'Add rule' })}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            className="rounded-xl h-9 px-3 bg-white text-black hover:bg-white/90 gap-1.5"
          >
            {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t('communities.manage.saveRules', { defaultValue: 'Save rules' })}
          </Button>
        </div>
      </section>
    </div>
  );
}

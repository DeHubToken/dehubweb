import { useState } from 'react';
import { Shield, Calendar, Lock, Globe, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useUpdateCommunity, type Community } from '@/hooks/use-communities';
import { DescriptionWithLinks } from './DescriptionWithLinks';

interface CommunityAboutProps {
  community: Community;
  isOwner?: boolean;
}

export function CommunityAbout({ community, isOwner = false }: CommunityAboutProps) {
  const { t } = useTranslation();
  const rules = Array.isArray(community.rules) ? community.rules : [];
  const updateMutation = useUpdateCommunity();
  const [confirmPrivate, setConfirmPrivate] = useState(false);

  const handleToggle = (next: boolean) => {
    if (next && !confirmPrivate) {
      // Going Public -> Private: ask once
      setConfirmPrivate(true);
      return;
    }
    setConfirmPrivate(false);
    updateMutation.mutate({ id: community.id, is_private: next } as any);
  };

  return (
    <div className="space-y-6">
      {community.description && (
        <div>
          <h3 className="text-white font-medium text-sm mb-2">{t('communities.description')}</h3>
          <DescriptionWithLinks text={community.description} />
        </div>
      )}

      {isOwner && (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5 space-y-3">
          <label className={`flex items-center justify-between gap-3 ${updateMutation.isPending ? '' : 'cursor-pointer'}`}>
            <div className="flex items-center gap-2 min-w-0">
              {community.is_private ? (
                <Lock className="w-4 h-4 text-zinc-400 flex-shrink-0" />
              ) : (
                <Globe className="w-4 h-4 text-zinc-400 flex-shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-white text-sm font-medium">
                  {community.is_private ? 'Private' : 'Public'}
                </div>
                <div className="text-zinc-500 text-xs">
                  {community.is_private
                    ? 'New members must be approved to join.'
                    : 'Anyone can join instantly.'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {updateMutation.isPending && (
                <Loader2 className="w-3.5 h-3.5 text-zinc-400 animate-spin" />
              )}
              <Switch
                checked={community.is_private}
                onCheckedChange={handleToggle}
                disabled={updateMutation.isPending}
              />
            </div>
          </label>

          {confirmPrivate && !community.is_private && (
            <div className="rounded-lg border border-white/10 bg-black/40 p-3 space-y-2">
              <p className="text-xs text-zinc-300">
                Make this community private? Existing members stay; new joiners will need approval.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmPrivate(false)}
                  className="h-7 px-3 text-xs rounded-lg"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleToggle(true)}
                  className="h-7 px-3 text-xs rounded-lg bg-white text-black hover:bg-white/90"
                >
                  Make Private
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {!isOwner && (
          <div className="flex items-center gap-2 text-zinc-400 text-sm">
            {community.is_private ? (
              <><Lock className="w-4 h-4" /> {t('communities.privateLabel')}</>
            ) : (
              <><Globe className="w-4 h-4" /> {t('communities.publicLabel')}</>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 text-zinc-400 text-sm">
          <Calendar className="w-4 h-4" />
          {t('communities.createdDate', { date: new Date(community.created_at).toLocaleDateString() })}
        </div>
      </div>

      {rules.length > 0 && (
        <div>
          <h3 className="text-white font-medium text-sm mb-2 flex items-center gap-1.5">
            <Shield className="w-4 h-4" />
            {t('communities.communityRules')}
          </h3>
          <ol className="space-y-2">
            {rules.map((rule: any, i: number) => (
              <li key={i} className="text-zinc-400 text-sm flex gap-2">
                <span className="text-zinc-600 font-medium">{i + 1}.</span>
                <span>{typeof rule === 'string' ? rule : rule.text || rule.title || JSON.stringify(rule)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

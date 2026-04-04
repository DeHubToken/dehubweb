import { Shield, Calendar, Lock, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Community } from '@/hooks/use-communities';

interface CommunityAboutProps {
  community: Community;
}

export function CommunityAbout({ community }: CommunityAboutProps) {
  const { t } = useTranslation();
  const rules = Array.isArray(community.rules) ? community.rules : [];

  return (
    <div className="space-y-6">
      {community.description && (
        <div>
          <h3 className="text-white font-medium text-sm mb-2">{t('communities.description')}</h3>
          <p className="text-zinc-400 text-sm">{community.description}</p>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-zinc-400 text-sm">
          {community.is_private ? (
            <><Lock className="w-4 h-4" /> {t('communities.privateLabel')}</>
          ) : (
            <><Globe className="w-4 h-4" /> {t('communities.publicLabel')}</>
          )}
        </div>
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

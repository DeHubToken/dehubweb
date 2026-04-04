import { Shield, Calendar, Lock, Globe } from 'lucide-react';
import type { Community } from '@/hooks/use-communities';

interface CommunityAboutProps {
  community: Community;
}

export function CommunityAbout({ community }: CommunityAboutProps) {
  const rules = Array.isArray(community.rules) ? community.rules : [];

  return (
    <div className="space-y-6">
      {/* Description */}
      {community.description && (
        <div>
          <h3 className="text-white font-medium text-sm mb-2">Description</h3>
          <p className="text-zinc-400 text-sm">{community.description}</p>
        </div>
      )}

      {/* Info */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-zinc-400 text-sm">
          {community.is_private ? (
            <><Lock className="w-4 h-4" /> Private community</>
          ) : (
            <><Globe className="w-4 h-4" /> Public community</>
          )}
        </div>
        <div className="flex items-center gap-2 text-zinc-400 text-sm">
          <Calendar className="w-4 h-4" />
          Created {new Date(community.created_at).toLocaleDateString()}
        </div>
      </div>

      {/* Rules */}
      {rules.length > 0 && (
        <div>
          <h3 className="text-white font-medium text-sm mb-2 flex items-center gap-1.5">
            <Shield className="w-4 h-4" />
            Community Rules
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

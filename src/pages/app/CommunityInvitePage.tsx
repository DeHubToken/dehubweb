/**
 * Community Invite Landing
 * ========================
 * What somebody sees when they open /app/communities/join/:code. The preview
 * RPC is public — it answers for signed-out visitors too — so the page can
 * show the community before asking anyone to connect a wallet.
 */

import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SEOHead } from '@/components/SEOHead';
import { useAuth } from '@/contexts/AuthContext';
import { useInvitePreview, useJoinViaInvite } from '@/hooks/use-community-admin';

export default function CommunityInvitePage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, openLoginModal } = useAuth();
  const { t } = useTranslation();

  const { data: preview, isLoading } = useInvitePreview(code);
  const joinMutation = useJoinViaInvite();

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-3 py-4 space-y-4">
        <div className="h-32 rounded-xl bg-white/[0.04] animate-pulse" />
        <div className="h-16 rounded-xl bg-white/[0.04] animate-pulse" />
      </div>
    );
  }

  if (!preview || !preview.is_valid) {
    const reason = preview?.reason ?? 'not_found';
    const message =
      reason === 'revoked'
        ? t('communities.invite.revoked', { defaultValue: 'This invite link was revoked.' })
        : reason === 'expired'
        ? t('communities.invite.expired', { defaultValue: 'This invite link has expired.' })
        : reason === 'exhausted'
        ? t('communities.invite.exhausted', {
            defaultValue: 'This invite link has reached its member limit.',
          })
        : t('communities.invite.notFound', { defaultValue: 'This invite link is not valid.' });

    return (
      <div className="max-w-2xl mx-auto px-3 py-4">
        <SEOHead
          title={t('communities.invite.invalidTitle', { defaultValue: 'Invite link - DeHub Community' })}
          description={message}
        />
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5 text-center space-y-3">
          <p className="text-white font-medium text-sm">
            {t('communities.invite.invalidHeading', { defaultValue: 'This invite cannot be used' })}
          </p>
          <p className="text-zinc-400 text-sm">{message}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate('/app/communities')}
            className="rounded-xl h-9 px-3 border-white/10 text-white"
          >
            {t('communities.invite.browse', { defaultValue: 'Browse communities' })}
          </Button>
        </div>
      </div>
    );
  }

  const communityName = preview.name || t('communities.invite.fallbackName', { defaultValue: 'this community' });
  const requiresApproval = !!preview.requires_approval;

  const handleJoin = () => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    if (!code) return;
    joinMutation.mutate(code, {
      onSuccess: () => {
        if (preview.slug) navigate(`/app/communities/${preview.slug}`);
      },
    });
  };

  const joinLabel = !isAuthenticated
    ? t('communities.invite.connect', { defaultValue: 'Connect to join' })
    : requiresApproval
    ? t('communities.invite.requestToJoin', { defaultValue: 'Request to join' })
    : t('communities.invite.join', { defaultValue: 'Join' });

  return (
    <div className="max-w-2xl mx-auto px-3 py-4">
      <SEOHead
        title={`${communityName} - DeHub Community`}
        description={preview.description || `Join ${communityName} on DeHub`}
      />

      <div className="rounded-xl border border-white/10 bg-white/[0.04] overflow-hidden">
        <div className="h-24 bg-white/[0.06]">
          {preview.banner_url && (
            <img src={preview.banner_url} alt="" className="w-full h-full object-cover" />
          )}
        </div>

        <div className="p-3.5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-lg bg-white/[0.08] flex items-center justify-center overflow-hidden flex-shrink-0 -mt-10 border border-white/10">
              {preview.avatar_url ? (
                <img src={preview.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <Users className="w-5 h-5 text-zinc-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-white font-medium text-sm truncate">{communityName}</h1>
              <p className="text-zinc-500 text-xs">
                {t('communities.invite.memberCount', {
                  defaultValue: '{{n}} members',
                  n: preview.member_count ?? 0,
                })}
              </p>
            </div>
          </div>

          {preview.description && (
            <p className="text-zinc-400 text-sm whitespace-pre-wrap break-words">{preview.description}</p>
          )}

          <Button
            onClick={handleJoin}
            disabled={joinMutation.isPending}
            className="w-full rounded-xl bg-white text-black hover:bg-white/90 font-medium"
          >
            {joinMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {joinLabel}
          </Button>

          {requiresApproval && (
            <p className="text-zinc-500 text-xs text-center">
              {t('communities.invite.approvalNote', {
                defaultValue: 'An admin has to approve your request before you can join.',
              })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

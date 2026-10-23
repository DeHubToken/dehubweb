import { useTranslation as _useCopy } from 'react-i18next';
import { useState } from 'react';
import { AtSign, Handshake, UserMinus, Loader2, Award, Rss } from "lucide-react";
import Copy from "@/components/ui/cut-icons/copy";
import Wallet from "@/components/ui/cut-icons/wallet";
import Gift from "@/components/ui/cut-icons/gifts";
import Ban from "@/components/ui/cut-icons/blocked";
import LayoutDashboard from "@/components/ui/cut-icons/command";
import ShieldCheck from "@/components/ui/cut-icons/security";
import Flag from "@/components/ui/cut-icons/report";

import MessageCircle from "@/components/ui/cut-icons/messages";
import Bell from "@/components/ui/cut-icons/alerts";

import { ReportModal } from '@/components/app/modals/ReportModal';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { openDmDock } from '@/hooks/use-dm-dock';
import { useTranslation } from 'react-i18next';
import { DISPLAY_WALLET_OVERRIDES } from './ProfileConstants';
import type { ProfileData } from '@/hooks/use-dehub-profile';
import { LendBadgeRows } from './LendBadgeRows';
import { viewerShareUrl } from '@/lib/share-url';
import { trackShare } from '@/lib/analytics';
import { profileFeedUrl } from '../../../../server/rss-feeds.js';

interface ProfileOptionsDrawerProps {
  profile: ProfileData;
  isViewingOwnProfile: boolean | undefined;
  isFollowing: boolean;
  handleUnfollow: () => void;
  setShareSheetOpen: (open: boolean) => void;
  onMakeOffer: () => void;
  onTip?: () => void;
  isBlocked?: boolean;
  isBlockLoading?: boolean;
  handleBlock?: () => void;
}

export function ProfileOptionsContent({
  profile,
  isViewingOwnProfile,
  isFollowing,
  handleUnfollow,
  setShareSheetOpen,
  onMakeOffer,
  onTip,
  isBlocked = false,
  isBlockLoading = false,
  handleBlock,
}: ProfileOptionsDrawerProps) {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [lendingBadge, setLendingBadge] = useState(false);

  const handleCopyProfileUrl = () => {
    navigator.clipboard.writeText(viewerShareUrl(`https://dehub.io/${profile.handle.replace('@', '')}`));
    trackShare('copy_link', { kind: 'profile' });
    toast.success(t('profileOptions.profileUrlCopied'));
    setShareSheetOpen(false);
  };

  const handleCopyUsername = () => {
    navigator.clipboard.writeText(profile.handle);
    toast.success(t('profileOptions.usernameCopied'));
    setShareSheetOpen(false);
  };

  // A private account has no feed: the worker answers its .rss with a 404.
  const handleCopyRssFeed = () => {
    navigator.clipboard.writeText(profileFeedUrl('https://dehub.io', profile.handle));
    trackShare('copy_link', { kind: 'profile_rss' });
    toast.success(t('profileOptions.rssFeedCopied'));
    setShareSheetOpen(false);
  };

  const handleToggleNotifications = () => {
    toast.success(t('profileOptions.notificationsEnabled'));
    setShareSheetOpen(false);
  };

  const onBlockClick = async () => {
    if (handleBlock) {
      await handleBlock();
    }
    setShareSheetOpen(false);
  };

  // Swapped in place over the whole menu rather than nested under it: this is a
  // two-step action with its own back row, not one more option in the list.
  if (lendingBadge && profile.walletAddress) {
    return (
      <LendBadgeRows
        address={profile.walletAddress}
        handle={profile.handle}
        onBack={() => setLendingBadge(false)}
        onDone={() => { setLendingBadge(false); setShareSheetOpen(false); }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleCopyProfileUrl}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 active:scale-[0.98] transition-[background-color,transform] text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <Copy className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">{t('profileOptions.copyProfileUrl')}</span>
      </button>
      <button
        onClick={handleCopyUsername}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 active:scale-[0.98] transition-[background-color,transform] text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <AtSign className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">{t('profileOptions.copyUsername')}</span>
      </button>
      {!profile.isPrivate && (
        <button
          onClick={handleCopyRssFeed}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 active:scale-[0.98] transition-[background-color,transform] text-left"
        >
          <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
            <Rss className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-medium">{t('profileOptions.copyRssFeed')}</span>
        </button>
      )}
      {isViewingOwnProfile && (
        <button
          onClick={() => {
            setShareSheetOpen(false);
            navigate('/app/wallet');
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 active:scale-[0.98] transition-[background-color,transform] text-left"
        >
          <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
            <Wallet className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-medium">{t('profileOptions.openWallet')}</span>
        </button>
      )}
      {!isViewingOwnProfile && (
        <>
          {!isBlocked && (
            <>
              <button
                onClick={() => {
                  setShareSheetOpen(false);
                  openDmDock({ address: profile.walletAddress, username: profile.handle?.replace('@', '') });
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 active:scale-[0.98] transition-[background-color,transform] text-left"
              >
                <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                  <MessageCircle className="w-4 h-4 text-white" />
                </div>
                <span className="text-white font-medium">{t('profileOptions.message')}</span>
              </button>
              {onTip && (
                <button
                  onClick={() => { setShareSheetOpen(false); onTip(); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 active:scale-[0.98] transition-[background-color,transform] text-left"
                >
                  <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                    <Gift className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-white font-medium">{t('profileOptions.sendTip')}</span>
                </button>
              )}
              <button
                onClick={handleToggleNotifications}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 active:scale-[0.98] transition-[background-color,transform] text-left"
              >
                <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                  <Bell className="w-4 h-4 text-white" />
                </div>
                <span className="text-white font-medium">{t('profileOptions.notify')}</span>
              </button>
              <button
                onClick={onMakeOffer}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 active:scale-[0.98] transition-[background-color,transform] text-left"
              >
                <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                  <Handshake className="w-4 h-4 text-white" />
                </div>
                <span className="text-white font-medium">{t('profileOptions.makeOffer')}</span>
              </button>
              {profile.walletAddress && (
                <button
                  onClick={() => setLendingBadge(true)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 active:scale-[0.98] transition-[background-color,transform] text-left"
                >
                  <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                    <Award className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-white font-medium">{t('settings.badgeDelegation')}</span>
                </button>
              )}
              <div className="my-1.5 h-px bg-white/10" />
              {isFollowing && (
                <button
                  onClick={handleUnfollow}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-red-500/10 backdrop-blur-md border border-red-500/20 hover:bg-red-500/20 active:scale-[0.98] transition-[background-color,transform] text-left"
                >
                  <div className="w-8 h-8 rounded-xl bg-red-500/20 backdrop-blur-sm flex items-center justify-center">
                    <UserMinus className="w-4 h-4 text-red-400" />
                  </div>
                  <span className="text-red-400 font-medium">{t('profileOptions.unfollow')}</span>
                </button>
              )}
              {/* Report User */}
              <button
                onClick={() => { setShareSheetOpen(false); setReportModalOpen(true); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-red-500/10 backdrop-blur-md border border-red-500/20 hover:bg-red-500/20 active:scale-[0.98] transition-[background-color,transform] text-left"
              >
                <div className="w-8 h-8 rounded-xl bg-red-500/20 backdrop-blur-sm flex items-center justify-center">
                  <Flag className="w-4 h-4 text-red-400" />
                </div>
                <span className="text-red-400 font-medium">{_copy("copy.ae89cfa0886b", { defaultValue: "Report User" })}</span>
              </button>
            </>
          )}
          <button
            onClick={onBlockClick}
            disabled={isBlockLoading}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-red-500/10 backdrop-blur-md border border-red-500/20 hover:bg-red-500/20 active:scale-[0.98] transition-[background-color,transform] text-left disabled:opacity-50"
          >
            <div className="w-8 h-8 rounded-xl bg-red-500/20 backdrop-blur-sm flex items-center justify-center">
              {isBlockLoading ? (
                <Loader2 className="w-4 h-4 text-red-400 animate-spin" />
              ) : isBlocked ? (
                <ShieldCheck className="w-4 h-4 text-red-400" />
              ) : (
                <Ban className="w-4 h-4 text-red-400" />
              )}
            </div>
            <span className="text-red-400 font-medium">
              {isBlocked ? t('profileOptions.unblock') : t('profileOptions.block')}
            </span>
          </button>
        </>
      )}
      <ReportModal
        open={reportModalOpen}
        onOpenChange={setReportModalOpen}
        reportType="user"
        userId={profile.walletAddress}
      />
    </div>
  );
}

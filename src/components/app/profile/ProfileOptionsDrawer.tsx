import { Copy, AtSign, Wallet, MessageCircle, Send, Bell, Handshake, UserMinus, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { DISPLAY_WALLET_OVERRIDES } from './ProfileConstants';
import type { ProfileData } from '@/hooks/use-dehub-profile';

interface ProfileOptionsDrawerProps {
  profile: ProfileData;
  isViewingOwnProfile: boolean | undefined;
  isFollowing: boolean;
  handleUnfollow: () => void;
  setShareSheetOpen: (open: boolean) => void;
  onMakeOffer: () => void;
}

export function ProfileOptionsContent({
  profile,
  isViewingOwnProfile,
  isFollowing,
  handleUnfollow,
  setShareSheetOpen,
  onMakeOffer,
}: ProfileOptionsDrawerProps) {
  const navigate = useNavigate();
  const handleCopyProfileUrl = () => {
    navigator.clipboard.writeText(`https://dehub.io/${profile.handle.replace('@', '')}`);
    toast.success('Profile URL copied to clipboard');
    setShareSheetOpen(false);
  };

  const handleCopyUsername = () => {
    navigator.clipboard.writeText(profile.handle);
    toast.success('Username copied to clipboard');
    setShareSheetOpen(false);
  };

  const handleCopyAddress = () => {
    if (!profile.walletAddress) {
      toast.error('No wallet address available');
      return;
    }
    const displayAddress = DISPLAY_WALLET_OVERRIDES[profile.walletAddress.toLowerCase()] || profile.walletAddress;
    navigator.clipboard.writeText(displayAddress);
    toast.success('Address copied to clipboard');
    setShareSheetOpen(false);
  };

  const handleSendCoins = () => {
    toast.info('Send coins feature coming soon');
    setShareSheetOpen(false);
  };

  const handleToggleNotifications = () => {
    toast.success('Notifications enabled for this profile');
    setShareSheetOpen(false);
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleCopyProfileUrl}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <Copy className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Copy profile URL</span>
      </button>
      <button
        onClick={handleCopyUsername}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <AtSign className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Copy username</span>
      </button>
      <button
        onClick={handleCopyAddress}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <Wallet className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Copy address</span>
      </button>
      {!isViewingOwnProfile && (
        <>
          <button
            onClick={() => {
              setShareSheetOpen(false);
              navigate('/app/messages', { state: { openDmWith: profile.walletAddress, username: profile.handle?.replace('@', '') } });
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-medium">Message</span>
          </button>
          <button
            onClick={handleSendCoins}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
              <Send className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-medium">Send coins</span>
          </button>
          <button
            onClick={handleToggleNotifications}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
              <Bell className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-medium">Notify</span>
          </button>
          <button
            onClick={onMakeOffer}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
              <Handshake className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-medium">Make Offer</span>
          </button>
          {isFollowing && (
            <button
              onClick={handleUnfollow}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-red-500/10 backdrop-blur-md border border-red-500/20 hover:bg-red-500/20 transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-xl bg-red-500/20 backdrop-blur-sm flex items-center justify-center">
                <UserMinus className="w-4 h-4 text-red-400" />
              </div>
              <span className="text-red-400 font-medium">Unfollow</span>
            </button>
          )}
          <button
            onClick={() => {
              toast.info('User blocked');
              setShareSheetOpen(false);
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-red-500/10 backdrop-blur-md border border-red-500/20 hover:bg-red-500/20 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-xl bg-red-500/20 backdrop-blur-sm flex items-center justify-center">
              <Ban className="w-4 h-4 text-red-400" />
            </div>
            <span className="text-red-400 font-medium">Block</span>
          </button>
        </>
      )}
    </div>
  );
}

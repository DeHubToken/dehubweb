import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTabIndicator } from '@/hooks/use-tab-indicator';
import { GlassIndicator } from '@/components/app/feeds/GlassIndicator';
import { 
  Settings as SettingsIcon, 
  User, 
  Bell, 
  Shield, 
  Palette, 
  Eye,
  Camera,
  Link2,
  Mail,
  ThumbsUp,
  MessageSquare,
  Users,
  Moon,
  Clock,
  Globe,
  Lock,
  MessageCircle,
  Filter,
  AlertTriangle,
  Repeat2,
  Sun,
  Monitor,
  LayoutGrid,
  Play,
  Sparkles,
  Save,
  FileText,
  MapPin,
  Wallet,
  ExternalLink,
  AtSign,
  Handshake,
  PieChart,
  UserPlus,
  X,
  Check,
  Download,
  Copy,
  Loader2,
  LogOut,
  Coins,
  Gift,
  Palmtree,
  Terminal,
  Skull,
  Orbit,
  Ban
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { SettingDrawerSelect } from '@/components/app/settings/SettingDrawerSelect';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGate } from '@/components/app/AuthGate';
import { Search } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { updateProfile, getAccountInfo, type UpdateProfileData, type DeHubUser } from '@/lib/api/dehub';
import type { ProfileData } from '@/hooks/use-dehub-profile';
import { getBlockListPaginated, unblockUser as apiUnblockUser, type BlockedUser, checkUsernameAvailability } from '@/lib/api/dehub';
import { buildAvatarUrl, buildCoverUrl } from '@/lib/media-url';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useAuth as useAuthContext } from '@/contexts/AuthContext';
import { useCoinPlacement } from '@/hooks/use-coin-placement';
import { usePrivacySettings } from '@/hooks/use-privacy-settings';
import { useSidebarCollapse } from '@/contexts/SidebarCollapseContext';
import { useAutoplay } from '@/contexts/AutoplayContext';
import { useAnimations } from '@/contexts/AnimationsContext';
import { useBrowserNotifications, requestNotificationPermission } from '@/hooks/use-browser-notifications';
import { WalletMenuContent } from '@/components/app/CoinBalanceMenu';
import { FollowRequestsDrawer } from '@/components/app/profile/FollowRequestsDrawer';
import dehubCoin from '@/assets/dehub-coin.png';
import settingsIcon from '@/assets/icons/settings-icon.png';
import { useUserLanguage } from '@/hooks/use-user-language';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { useTranslation } from 'react-i18next';
import { ChainSelector, type ChainId } from '@/components/app/ChainSelector';
import { BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';

const TAB_KEYS: Record<string, string> = {
  profile: 'settings.profile',
  notifications: 'settings.notifications',
  privacy: 'settings.privacy',
  appearance: 'settings.appearance',
  content: 'settings.content',
  messages: 'settings.messages',
  assets: 'settings.assets',
};

const tabs = [
  { icon: User, value: 'profile', label: 'settings.profile' },
  { icon: Palette, value: 'appearance', label: 'settings.appearance' },
  { icon: Bell, value: 'notifications', label: 'settings.notifications' },
  { icon: Shield, value: 'privacy', label: 'settings.privacy' },
  { icon: Eye, value: 'content', label: 'settings.content' },
  { icon: MessageSquare, value: 'messages', label: 'settings.messages' },
  { icon: Wallet, value: 'assets', label: 'settings.assets' },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');
  const { layerRef: settingsTabLayerRef, setRef: setSettingsTabRef, rect: settingsTabRect } = useTabIndicator(activeTab);
  const [theme, setTheme] = useState('system');
  const [selectedChainId, setSelectedChainId] = useState<ChainId>(() => {
    const stored = localStorage.getItem('preferred-chain-id');
    return stored ? (Number(stored) as ChainId) : (BASE_CHAIN_ID as ChainId);
  });
  const handleChainChange = useCallback((id: ChainId) => {
    setSelectedChainId(id);
    localStorage.setItem('preferred-chain-id', String(id));
  }, []);
  const { isAuthenticated, disconnect } = useAuth();

  const { t } = useTranslation();

  const handleLogout = async () => {
    try {
      await disconnect();
      toast.success(t('settings.loggedOut'));
    } catch {
      toast.error(t('settings.logoutFailed'));
    }
  };

  // Block access for unauthenticated users (AuthGate handles loading state internally)
  if (!isAuthenticated) {
    return (
      <AuthGate description={t('settings.loginDescription')} />
    );
  }

  return (
    <div className="min-h-screen px-2 pt-1 pb-2 sm:px-3 sm:pt-1 sm:pb-3 lg:pt-2">
      {/* Header */}
      <div className="bg-zinc-900 rounded-2xl p-4 sm:p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <img src={settingsIcon} alt="Settings" className="w-10 h-10 object-contain" />
            <div>
              <h1 className="text-xl font-bold text-white">{t('settings.title')}</h1>
              <p className="text-zinc-500 text-sm">{t('settings.manageAccount')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ChainSelector
              selectedChainId={selectedChainId}
              onChainChange={handleChainChange}
              variant="icon"
            />
            <button
              onClick={handleLogout}
              className="flex items-center justify-center gap-2 px-3 h-10 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-white"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline text-sm font-medium">{t('settings.logOut')}</span>
            </button>
          </div>
        </div>

        {/* Tab Icons */}
        <div ref={settingsTabLayerRef} className="relative overflow-visible">
          <GlassIndicator rect={settingsTabRect} />
          <div className="relative z-20 flex gap-[6px] sm:gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.value}
                  ref={setSettingsTabRef(tab.value)}
                  onClick={() => setActiveTab(tab.value)}
                  className={`relative z-40 p-[11px] sm:p-3 rounded-xl transition-colors ${
                    activeTab === tab.value
                      ? 'text-white'
                      : 'text-zinc-500 hover:text-white'
                  }`}
                  title={t(tab.label)}
                >
                  <Icon className="relative z-10 w-[18px] h-[18px] sm:w-5 sm:h-5" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="bg-zinc-900 rounded-2xl p-4 sm:p-6">
        {activeTab === 'profile' && <ProfileSettings />}
        {activeTab === 'notifications' && <NotificationSettings />}
        {activeTab === 'privacy' && <PrivacySettings />}
        {activeTab === 'appearance' && <AppearanceSettings theme={theme} setTheme={setTheme} />}
        {activeTab === 'content' && <ContentSettings />}
        {activeTab === 'messages' && <MessagesSettings />}
        {activeTab === 'assets' && <AssetsSettings />}
      </div>
    </div>
  );
}

function ProfileSettings() {
  const { t } = useTranslation();
  const { user: authUser, refreshUser } = useAuthContext();
  const queryClient = useQueryClient();
  
  // Form state declarations
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [twitterLink, setTwitterLink] = useState('');
  const [discordLink, setDiscordLink] = useState('');
  const [instagramLink, setInstagramLink] = useState('');
  const [tiktokLink, setTiktokLink] = useState('');
  const [youtubeLink, setYoutubeLink] = useState('');
  const [telegramLink, setTelegramLink] = useState('');
  const [facebookLink, setFacebookLink] = useState('');
  
  const [originalValues, setOriginalValues] = useState({
    displayName: '',
    username: '',
    bio: '',
    twitterLink: '',
    discordLink: '',
    instagramLink: '',
    tiktokLink: '',
    youtubeLink: '',
    telegramLink: '',
    facebookLink: '',
  });
  
  const [avatarPreview, setAvatarPreview] = useState<string | undefined>();
  const [coverPreview, setCoverPreview] = useState<string | undefined>();
  const [avatarFile, setAvatarFile] = useState<File | undefined>();
  const [coverFile, setCoverFile] = useState<File | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const debouncedUsername = useDebouncedValue(username, 300);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  
  // Load profile data on mount or authUser change
  useEffect(() => {
    async function loadProfile() {
      if (!authUser?.address) return;
      
      try {
        setIsLoading(true);
        const userData = await getAccountInfo(authUser.address);
        
        const loadedDisplayName = userData.displayName || userData.display_name || '';
        const loadedUsername = userData.username || '';
        const loadedBio = userData.aboutMe || userData.bio || '';
        
        const customs = userData.customs as Record<string, string> | undefined;
        const loadedTwitter = customs?.twitterLink || '';
        const loadedDiscord = customs?.discordLink || '';
        const loadedInstagram = customs?.instagramLink || '';
        const loadedTiktok = customs?.tiktokLink || '';
        const loadedYoutube = customs?.youtubeLink || '';
        const loadedTelegram = customs?.telegramLink || '';
        const loadedFacebook = customs?.facebookLink || '';
        
        setDisplayName(loadedDisplayName);
        setUsername(loadedUsername);
        setBio(loadedBio);
        setTwitterLink(loadedTwitter);
        setDiscordLink(loadedDiscord);
        setInstagramLink(loadedInstagram);
        setTiktokLink(loadedTiktok);
        setYoutubeLink(loadedYoutube);
        setTelegramLink(loadedTelegram);
        setFacebookLink(loadedFacebook);
        
        setOriginalValues({
          displayName: loadedDisplayName,
          username: loadedUsername,
          bio: loadedBio,
          twitterLink: loadedTwitter,
          discordLink: loadedDiscord,
          instagramLink: loadedInstagram,
          tiktokLink: loadedTiktok,
          youtubeLink: loadedYoutube,
          telegramLink: loadedTelegram,
          facebookLink: loadedFacebook,
        });
        
        const address = userData.address || userData.wallet_address || '';
        const rawAvatarUrl = userData.avatarImageUrl || userData.avatarUrl || userData.avatar_url;
        const rawCoverUrl = userData.coverImageUrl || userData.coverUrl || userData.cover_url;
        setAvatarPreview(buildAvatarUrl(address, rawAvatarUrl));
        setCoverPreview(buildCoverUrl(address, rawCoverUrl));
      } catch (error) {
        console.error('Failed to load profile:', error);
        toast.error(t('settings.failedLoadProfile'));
      } finally {
        setIsLoading(false);
      }
    }
    
    loadProfile();
  }, [authUser?.address]);
  
  // Check username availability
  useEffect(() => {
    if (!debouncedUsername || debouncedUsername === originalValues.username) {
      setUsernameAvailable(null);
      setIsCheckingUsername(false);
      return;
    }
    if (debouncedUsername.length < 3) {
      setUsernameAvailable(null);
      setIsCheckingUsername(false);
      return;
    }
    let cancelled = false;
    setIsCheckingUsername(true);
    checkUsernameAvailability(debouncedUsername)
      .then((res) => {
        if (!cancelled) {
          setUsernameAvailable(res.available);
          setIsCheckingUsername(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUsernameAvailable(null);
          setIsCheckingUsername(false);
        }
      });
    return () => { cancelled = true; };
  }, [debouncedUsername, originalValues.username]);

  const hasChanges = 
    displayName !== originalValues.displayName ||
    username !== originalValues.username ||
    bio !== originalValues.bio ||
    twitterLink !== originalValues.twitterLink ||
    discordLink !== originalValues.discordLink ||
    instagramLink !== originalValues.instagramLink ||
    tiktokLink !== originalValues.tiktokLink ||
    youtubeLink !== originalValues.youtubeLink ||
    telegramLink !== originalValues.telegramLink ||
    facebookLink !== originalValues.facebookLink ||
    !!avatarFile ||
    !!coverFile;

  const canSave = hasChanges && !isCheckingUsername && usernameAvailable !== false;
  
  const updateMutation = useMutation({
    mutationFn: async (data: UpdateProfileData) => {
      return updateProfile(data);
    },
    onSuccess: async (_result, variables) => {
      toast.success(t('settings.profileUpdated'));
      
      // Optimistically update profile cache with local previews so avatar/cover
      // appear instantly everywhere, instead of waiting for CDN propagation.
      if (variables.avatarImg || variables.coverImg) {
        queryClient.setQueriesData<ProfileData>(
          { queryKey: ['dehub-profile'] },
          (old) => {
            if (!old) return old;
            return {
              ...old,
              ...(variables.avatarImg && avatarPreview ? { avatarUrl: avatarPreview } : {}),
              ...(variables.coverImg && coverPreview ? { coverUrl: coverPreview } : {}),
            };
          }
        );
        // Also update user in AuthContext immediately
        if (variables.avatarImg && avatarPreview) {
          queryClient.invalidateQueries({ queryKey: ['profile-avatar'] });
        }
      }

      setAvatarFile(undefined);
      setCoverFile(undefined);
      await refreshUser();
      if (authUser?.address) {
        const userData = await getAccountInfo(authUser.address);
        const rawUser = userData as Record<string, unknown>;
        setOriginalValues({
          displayName: userData.displayName || userData.display_name || '',
          username: userData.username || '',
          bio: userData.aboutMe || userData.bio || '',
          twitterLink: (rawUser.twitterLink as string) || '',
          discordLink: (rawUser.discordLink as string) || '',
          instagramLink: (rawUser.instagramLink as string) || '',
          tiktokLink: (rawUser.tiktokLink as string) || '',
          youtubeLink: (rawUser.youtubeLink as string) || '',
          telegramLink: (rawUser.telegramLink as string) || '',
          facebookLink: (rawUser.facebookLink as string) || '',
        });
      }
      queryClient.invalidateQueries({ queryKey: ['dehub-profile'] });
      queryClient.invalidateQueries({ queryKey: ['dehub-user-content'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || t('settings.failedUpdateProfile'));
    },
  });
  
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(t('settings.imageTooLarge5'));
        return;
      }
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };
  
  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(t('settings.imageTooLarge10'));
        return;
      }
      setCoverFile(file);
      setCoverPreview(URL.createObjectURL(file));
    }
  };
  
  const handleSave = () => {
    if (usernameAvailable === false) {
      toast.error(t('settings.usernameTaken') || 'Username is already taken');
      return;
    }
    if (isCheckingUsername) {
      toast.error('Please wait, checking username availability...');
      return;
    }
    const data: UpdateProfileData = {};
    
    if (displayName) data.displayName = displayName;
    if (username) data.username = username;
    if (bio) data.aboutMe = bio;
    if (twitterLink) data.twitterLink = twitterLink;
    if (discordLink) data.discordLink = discordLink;
    if (instagramLink) data.instagramLink = instagramLink;
    if (tiktokLink) data.tiktokLink = tiktokLink;
    if (telegramLink) data.telegramLink = telegramLink;
    if (youtubeLink) data.youtubeLink = youtubeLink;
    if (facebookLink) data.facebookLink = facebookLink;
    if (avatarFile) data.avatarImg = avatarFile;
    if (coverFile) data.coverImg = coverFile;
    
    updateMutation.mutate(data);
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <User className="w-5 h-5 text-zinc-400" />
          <h2 className="text-lg font-semibold text-white">{t('settings.profileSettings')}</h2>
        </div>
        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending || !canSave}
          size="icon"
          className={`bg-white/10 backdrop-blur-md border border-white/10 text-white hover:bg-white/15 hover:shadow-[0_0_15px_rgba(255,255,255,0.08)] rounded-xl transition-all duration-200 w-9 h-9 ${
            hasChanges ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {updateMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* Cover Image */}
      <div className="relative aspect-[3/1] bg-zinc-800 rounded-xl overflow-hidden group">
        {coverPreview && (
          <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
        )}
        <button
          onClick={() => coverInputRef.current?.click()}
          className="absolute inset-0 bg-black/30 transition-opacity hover:bg-black/50 flex items-center justify-center"
        >
          <Camera className="w-6 h-6 text-white/70" />
        </button>
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleCoverChange}
        />
      </div>

      {/* Profile Picture */}
      <div className="flex items-center gap-4 -mt-10">
        <div className="relative">
          <Avatar className="w-20 h-20 border-4 border-zinc-900">
            <AvatarImage src={avatarPreview} />
            <AvatarFallback className="bg-zinc-700 text-white text-xl font-medium">
              {displayName?.[0]?.toUpperCase() || username?.[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <button
            onClick={() => avatarInputRef.current?.click()}
            className="absolute bottom-0 right-0 w-8 h-8 bg-zinc-700 rounded-xl flex items-center justify-center hover:bg-zinc-600 transition-colors"
          >
            <Camera className="w-4 h-4 text-white" />
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>
        <div>
          <h3 className="font-medium text-white">{t('settings.profilePicture')}</h3>
          <p className="text-zinc-500 text-sm">{t('settings.clickCameraUpload')}</p>
        </div>
      </div>

      {/* Display Name & Username */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-white mb-2">{t('settings.displayName')}</label>
          <Input 
            placeholder={t('settings.enterDisplayName')}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-white mb-2">{t('settings.username')}</label>
          <Input 
            placeholder={t('settings.usernamePlaceholder')}
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            className={`bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 ${
              usernameAvailable === false ? 'border-red-500' : usernameAvailable === true ? 'border-green-500' : ''
            }`}
          />
          <div className="mt-1 flex items-center gap-1 min-h-[18px]">
            {isCheckingUsername && (
              <>
                <Loader2 className="w-3 h-3 text-zinc-400 animate-spin" />
                <span className="text-zinc-400 text-xs">Checking...</span>
              </>
            )}
            {!isCheckingUsername && usernameAvailable === true && username !== originalValues.username && (
              <>
                <Check className="w-3 h-3 text-green-500" />
                <span className="text-green-500 text-xs">Available</span>
              </>
            )}
            {!isCheckingUsername && usernameAvailable === false && (
              <>
                <X className="w-3 h-3 text-red-500" />
                <span className="text-red-500 text-xs">Username is already taken</span>
              </>
            )}
            {!isCheckingUsername && usernameAvailable === null && (
              <span className="text-zinc-500 text-xs">{t('settings.usernameHint')}</span>
            )}
          </div>
        </div>
      </div>

      {/* Bio */}
      <div>
        <label className="block text-sm font-medium text-white mb-2">{t('settings.bio')}</label>
        <Textarea 
          placeholder={t('settings.bioPlaceholder')}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 min-h-[100px]"
        />
      </div>

      {/* Social Links */}
      <div>
        <h3 className="font-medium text-white mb-4">{t('settings.socialLinks')}</h3>
        <div className="space-y-5">
          <SocialLinkInput 
            label="X (Twitter)" 
            placeholder="https://x.com/username"
            value={twitterLink}
            onChange={setTwitterLink}
            icon={
              <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            }
          />
          <SocialLinkInput 
            label="Instagram" 
            placeholder="https://instagram.com/username"
            value={instagramLink}
            onChange={setInstagramLink}
            icon={
              <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
            }
          />
          <SocialLinkInput 
            label="TikTok" 
            placeholder="https://tiktok.com/@username"
            value={tiktokLink}
            onChange={setTiktokLink}
            icon={
              <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
              </svg>
            }
          />
          <SocialLinkInput 
            label="YouTube" 
            placeholder="https://youtube.com/@channel"
            value={youtubeLink}
            onChange={setYoutubeLink}
            icon={
              <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
            }
          />
          <SocialLinkInput 
            label="Discord" 
            placeholder="discord_username"
            value={discordLink}
            onChange={setDiscordLink}
            icon={
              <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>
              </svg>
            }
          />
          <SocialLinkInput 
            label="Telegram" 
            placeholder="https://t.me/username"
            value={telegramLink}
            onChange={setTelegramLink}
            icon={
              <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
            }
          />
        </div>
      </div>
    </div>
  );
}

function NotificationSettings() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthContext();
  const { isEnabled: browserNotifsEnabled, setEnabled: setBrowserNotifsEnabled } = useBrowserNotifications();

  const { data: pushPrefs, isLoading: prefsLoading } = useQuery({
    queryKey: ['push-preferences'],
    queryFn: () => import('@/lib/api/dehub').then(m => m.getPushPreferences()),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  const queryClient = useQueryClient();

  const updatePrefMutation = useMutation({
    mutationFn: (prefs: Record<string, boolean>) =>
      import('@/lib/api/dehub').then(m => m.updatePushPreferences(prefs)),
    onMutate: async (newPrefs) => {
      await queryClient.cancelQueries({ queryKey: ['push-preferences'] });
      const prev = queryClient.getQueryData(['push-preferences']);
      queryClient.setQueryData(['push-preferences'], (old: any) => ({ ...old, ...newPrefs }));
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(['push-preferences'], context.prev);
      toast.error(t('settings.failedUpdateProfile'));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['push-preferences'] }),
  });

  const handleToggle = (key: string) => (checked: boolean) => {
    updatePrefMutation.mutate({ [key]: checked });
  };

  const isDisabled = prefsLoading || updatePrefMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Bell className="w-5 h-5 text-zinc-400" />
        <h2 className="text-lg font-semibold text-white">{t('settings.notificationSettings')}</h2>
      </div>

      {/* General */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">{t('settings.general')}</h3>
        <div className="space-y-4">
          <SettingToggle
            icon={Mail}
            title={t('settings.emailNotifications')}
            description={t('settings.emailNotificationsDesc')}
            defaultChecked={false}
            comingSoon
          />
          <SettingToggle
            icon={Bell}
            title={t('settings.pushNotifications')}
            description={t('settings.pushNotificationsDesc')}
            defaultChecked={browserNotifsEnabled}
            onCheckedChange={async (checked) => {
              if (checked) {
                const result = await requestNotificationPermission();
                if (result === 'granted') {
                  setBrowserNotifsEnabled(true);
                  toast.success(t('settings.browserNotificationsEnabled', 'Browser notifications enabled'));
                } else if (result === 'denied') {
                  setBrowserNotifsEnabled(false);
                  toast.error(t('settings.browserNotificationsDenied', 'Notifications blocked. Enable them in your browser settings.'));
                } else {
                  setBrowserNotifsEnabled(false);
                  toast.error(t('settings.browserNotificationsUnsupported', 'Browser notifications are not supported'));
                }
              } else {
                setBrowserNotifsEnabled(false);
              }
            }}
          />
        </div>
      </div>

      {/* Activity */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">{t('settings.activity')}</h3>
        <div className="space-y-4">
          <SettingToggle
            icon={ThumbsUp}
            title={t('settings.likes')}
            description={t('settings.likesDesc')}
            defaultChecked={pushPrefs?.likes ?? true}
            onCheckedChange={handleToggle('likes')}
            disabled={isDisabled}
          />
          <SettingToggle
            icon={MessageSquare}
            title={t('settings.comments')}
            description={t('settings.commentsDesc')}
            defaultChecked={pushPrefs?.comments ?? true}
            onCheckedChange={handleToggle('comments')}
            disabled={isDisabled}
          />
          <SettingToggle
            icon={Users}
            title={t('settings.newFollowers')}
            description={t('settings.newFollowersDesc')}
            defaultChecked={pushPrefs?.follows ?? true}
            onCheckedChange={handleToggle('follows')}
            disabled={isDisabled}
          />
          <SettingToggle
            icon={MessageSquare}
            title={t('settings.directMessages')}
            description={t('settings.directMessagesDesc')}
            defaultChecked={pushPrefs?.directMessages ?? true}
            onCheckedChange={handleToggle('directMessages')}
            disabled={isDisabled}
          />
        </div>
      </div>

      {/* Quiet Hours */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">{t('settings.quietHours')}</h3>
        <SettingToggle
          icon={Clock}
          title={t('settings.enableQuietHours')}
          description={t('settings.quietHoursDesc')}
          comingSoon
        />
      </div>
    </div>
  );
}

function PrivacySettings() {
  const { t } = useTranslation();
  const { showFollowersFollowing, hideFollowerCounts, isPrivate, defaultPostVisibility, updateSettings, isUpdating, isLoading } = usePrivacySettings();
  const [whoCanMessage, setWhoCanMessage] = useState('everyone');
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const { user } = useAuthContext();
  const [followRequestsOpen, setFollowRequestsOpen] = useState(false);
  
  const handlePostVisibilityChange = async (newVisibility: 'public' | 'private') => {
    if (!user?.address) {
      toast.error(t('settings.connectWalletFirst'));
      return;
    }
    
    setIsUpdatingVisibility(true);
    
    try {
      updateSettings({ default_post_visibility: newVisibility });
      
      const { getAuthToken } = await import('@/lib/api/dehub');
      const token = getAuthToken();
      if (token) {
        const response = await fetch('https://api.dehub.io/api/batch_token_visibility', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            visibility: newVisibility === 'private' ? 'private' : 'public',
          }),
        });
        
        if (!response.ok) {
          console.warn('Batch visibility update not supported, posts will use new default going forward');
        }
      }
      
      toast.success(
        newVisibility === 'private' 
          ? t('settings.allPostsPrivate')
          : t('settings.allPostsPublic')
      );
    } catch (error) {
      console.error('Failed to update visibility:', error);
      toast.error(t('settings.failedUpdateVisibility'));
    } finally {
      setIsUpdatingVisibility(false);
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="w-5 h-5 text-zinc-400" />
        <h2 className="text-lg font-semibold text-white">{t('settings.privacySecurity')}</h2>
      </div>

      {/* Profile Visibility */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">{t('settings.profileVisibility')}</h3>
        <div className="space-y-4">
          <SettingToggle
            icon={Lock}
            title={t('settings.privateAccount')}
            description={t('settings.privateAccountDesc')}
            defaultChecked={isPrivate}
            onCheckedChange={(checked) => updateSettings({ is_private: checked })}
            disabled={isUpdating || isLoading}
          />
          {isPrivate && (
            <div className="ml-8">
              <button
                onClick={() => setFollowRequestsOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-white text-sm font-medium"
              >
                <UserPlus className="w-4 h-4" />
                {t('settings.viewFollowRequests')}
              </button>
              <FollowRequestsDrawer open={followRequestsOpen} onOpenChange={setFollowRequestsOpen} />
            </div>
          )}
          <SettingToggle
            icon={Globe}
            title={t('settings.publicProfile')}
            description={t('settings.publicProfileDesc')}
            defaultChecked
            comingSoon
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-zinc-500" />
              <div>
                <p className="text-white font-medium">{t('settings.followVisibility')}</p>
                <p className="text-zinc-500 text-sm">{t('settings.followVisibilityDesc')}</p>
              </div>
            </div>
            <SettingDrawerSelect
              value={
                hideFollowerCounts ? 'hidden' : 
                showFollowersFollowing ? 'public' : 
                'counts-only'
              }
              onValueChange={(value) => {
                if (value === 'public') {
                  updateSettings({ show_followers_following: true, hide_follower_counts: false });
                } else if (value === 'counts-only') {
                  updateSettings({ show_followers_following: false, hide_follower_counts: false });
                } else {
                  updateSettings({ show_followers_following: false, hide_follower_counts: true });
                }
              }}
              disabled={isUpdating || isLoading}
              title={t('settings.followVisibility')}
              options={[
                { value: 'public', label: t('settings.publicOption'), description: t('settings.publicOptionDesc') },
                { value: 'counts-only', label: t('settings.numbersOnly'), description: t('settings.numbersOnlyDesc') },
                { value: 'hidden', label: t('settings.hiddenOption'), description: t('settings.hiddenOptionDesc') },
              ]}
            />
          </div>
          <SettingToggle
            icon={Globe}
            title={t('settings.searchEngineIndexing')}
            description={t('settings.searchEngineIndexingDesc')}
            defaultChecked
            comingSoon
          />
        </div>
      </div>

      {/* Post Visibility */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">{t('settings.postVisibility')}</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Eye className="w-5 h-5 text-zinc-500" />
              <div>
                <p className="text-white font-medium">{t('settings.defaultPostVisibility')}</p>
                <p className="text-zinc-500 text-sm">{t('settings.defaultPostVisibilityDesc')}</p>
              </div>
            </div>
            <SettingDrawerSelect
              value={defaultPostVisibility}
              onValueChange={(value) => handlePostVisibilityChange(value as 'public' | 'private')}
              disabled={isUpdating || isLoading || isUpdatingVisibility}
              title={t('settings.defaultPostVisibility')}
              options={[
                { value: 'public', label: t('settings.public'), description: t('settings.publicDesc') },
                { value: 'private', label: t('settings.private'), description: t('settings.privateDesc') },
              ]}
            />
          </div>
          <div className="bg-zinc-800/50 rounded-xl p-4 text-sm text-zinc-400">
            <p><strong className="text-white">{t('settings.note')}:</strong> {t('settings.postVisibilityNote')}</p>
          </div>
        </div>
      </div>

      {/* Messaging */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">{t('settings.messages')}</h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageCircle className="w-5 h-5 text-zinc-500" />
            <div>
              <p className="text-white font-medium">{t('settings.whoCanMessage')}</p>
              <p className="text-zinc-500 text-sm">{t('settings.whoCanMessageDesc')}</p>
            </div>
          </div>
          <SettingDrawerSelect
            value={whoCanMessage}
            onValueChange={() => toast.info(t('settings.comingSoon', 'Coming soon'))}
            title={t('settings.whoCanMessage')}
            options={[
              { value: 'everyone', label: t('settings.everyone'), description: t('settings.everyoneDesc') },
              { value: 'followers', label: t('settings.followers'), description: t('settings.followersOnlyDesc') },
              { value: 'none', label: t('settings.noOne'), description: t('settings.noOneDesc') },
            ]}
          />
        </div>
      </div>

      {/* Account Security */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">{t('settings.accountSecurity')}</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-zinc-500" />
              <div>
                <p className="text-white font-medium">{t('settings.twoFactorAuth')}</p>
                <p className="text-zinc-500 text-sm">{t('settings.twoFactorAuthDesc')}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 rounded-md" onClick={() => toast.info(t('settings.comingSoon', 'Coming soon'))}>
              {t('settings.enable')}
            </Button>
          </div>
        </div>
      </div>

      {/* Extract Data */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">{t('settings.yourData')}</h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Download className="w-5 h-5 text-zinc-500" />
            <div>
              <p className="text-white font-medium">{t('settings.extractData')}</p>
              <p className="text-zinc-500 text-sm">{t('settings.extractDataDesc')}</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 rounded-md"
            onClick={() => toast.info(t('settings.comingSoon', 'Coming soon'))}
          >
            {t('settings.download')}
          </Button>
        </div>
      </div>

      {/* Blocked Users */}
      <BlockedUsersSection />

      {/* Geo-Blocking */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">{t('settings.geoBlocking')}</h3>
        <p className="text-zinc-500 text-sm mb-4">{t('settings.geoBlockingDesc')}</p>
        <GeoBlockingSelector />
      </div>
    </div>
  );
}

function BlockedUsersSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthContext();
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const { data: blockData, isLoading } = useQuery({
    queryKey: ['block-list-settings'],
    queryFn: () => getBlockListPaginated(1, 50),
    enabled: isAuthenticated,
    staleTime: 30 * 1000,
  });

  const items = blockData?.items ?? [];

  const handleUnblock = async (user: BlockedUser) => {
    setUnblockingId(user.address);
    try {
      await apiUnblockUser(user.address);
      toast.success(`Unblocked ${user.username || user.displayName || user.address.slice(0, 8)}`);
      queryClient.invalidateQueries({ queryKey: ['block-list-settings'] });
      queryClient.invalidateQueries({ queryKey: ['block-list'] });
    } catch {
      toast.error('Failed to unblock user');
    } finally {
      setUnblockingId(null);
    }
  };

  return (
    <div>
      <h3 className="font-medium text-zinc-400 text-sm mb-4">
        <Ban className="w-4 h-4 inline mr-2" />
        Blocked Users
      </h3>
      {isLoading ? (
        <div className="flex items-center gap-2 text-zinc-500 text-sm py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading...
        </div>
      ) : items.length === 0 ? (
        <p className="text-zinc-500 text-sm py-2">You haven't blocked anyone.</p>
      ) : (
        <div className="space-y-2">
          {items.map((user) => (
            <div
              key={user.blockId || user.address}
              className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Avatar className="w-8 h-8">
                  <AvatarImage src={user.avatarImageUrl} />
                  <AvatarFallback className="bg-zinc-700 text-white text-xs">
                    {(user.username || user.address)?.[0]?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {user.displayName || user.username || `${user.address.slice(0, 6)}...${user.address.slice(-4)}`}
                  </p>
                  {user.username && (
                    <p className="text-zinc-500 text-xs truncate">@{user.username.replace('@', '')}</p>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20 rounded-lg text-xs"
                onClick={() => handleUnblock(user)}
                disabled={unblockingId === user.address}
              >
                {unblockingId === user.address ? (
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                ) : null}
                Unblock
              </Button>
            </div>
          ))}
          {blockData && blockData.total > items.length && (
            <p className="text-zinc-500 text-xs text-center pt-2">
              Showing {items.length} of {blockData.total} blocked users
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function AutoPlayToggle() {
  const { t } = useTranslation();
  const { autoplayEnabled, setAutoplayEnabled } = useAutoplay();
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Play className="w-5 h-5 text-zinc-500" />
        <div>
          <p className="text-white font-medium">{t('settings.autoPlay')}</p>
          <p className="text-zinc-500 text-sm">{t('settings.autoPlayDesc')}</p>
        </div>
      </div>
      <Switch checked={autoplayEnabled} onCheckedChange={setAutoplayEnabled} />
    </div>
  );
}

function ShowAnimationsToggle() {
  const { t } = useTranslation();
  const { animationsEnabled, setAnimationsEnabled } = useAnimations();
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Sparkles className="w-5 h-5 text-zinc-500" />
        <div>
          <p className="text-white font-medium">{t('settings.showAnimations')}</p>
          <p className="text-zinc-500 text-sm">{t('settings.showAnimationsDesc')}</p>
        </div>
      </div>
      <Switch checked={animationsEnabled} onCheckedChange={setAnimationsEnabled} />
    </div>
  );
}

function AppearanceSettings({ theme, setTheme }: { theme: string; setTheme: (v: string) => void }) {
  const { t } = useTranslation();
  const { isCollapsed, setCollapsed } = useSidebarCollapse();
  const [feedLayout, setFeedLayout] = useState('comfortable');
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Palette className="w-5 h-5 text-zinc-400" />
        <h2 className="text-lg font-semibold text-white">{t('settings.appearance')}</h2>
      </div>

      {/* Theme */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">{t('settings.theme')}</h3>
        <div className="relative">
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none z-10" />
          
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
            {[
              { value: 'system', icon: Monitor, labelKey: 'settings.system', available: true },
              { value: 'light', icon: Sun, labelKey: 'settings.light', available: false },
              { value: 'dark', icon: Moon, labelKey: 'settings.dark', available: false },
              { value: 'cosmic', icon: Orbit, labelKey: 'settings.cosmic', available: false },
              { value: 'christmas', icon: Gift, labelKey: 'settings.christmas', available: false },
              { value: 'island', icon: Palmtree, labelKey: 'settings.island', available: false },
              { value: 'hacker', icon: Terminal, labelKey: 'settings.hacker', available: false },
              { value: 'horror', icon: Skull, labelKey: 'settings.horror', available: false },
            ].map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  onClick={() => {
                    if (option.available) {
                      setTheme(option.value);
                    } else {
                      toast.info(t('settings.comingSoon', 'Coming soon'));
                    }
                  }}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-colors flex-shrink-0 min-w-[100px] ${
                    option.available
                      ? theme === option.value
                        ? 'bg-zinc-800 border-2 border-white'
                        : 'bg-zinc-800/50 border-2 border-transparent hover:bg-zinc-800'
                      : 'bg-zinc-800/30 border-2 border-transparent opacity-40 cursor-not-allowed'
                  }`}
                >
                  <Icon className="w-6 h-6 text-zinc-400" />
                  <span className="text-white text-sm">{t(option.labelKey)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Language */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">{t('settings.language')}</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-zinc-500" />
              <div>
                <p className="text-white font-medium">{t('settings.language')}</p>
                <p className="text-zinc-500 text-sm">{t('settings.languageDesc')}</p>
              </div>
            </div>
            <LanguageSelector />
          </div>
        </div>
      </div>

      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">{t('settings.layout')}</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <LayoutGrid className="w-5 h-5 text-zinc-500" />
              <div>
                <p className="text-white font-medium">{t('settings.feedLayout')}</p>
                <p className="text-zinc-500 text-sm">{t('settings.feedLayoutDesc')}</p>
              </div>
            </div>
            <SettingDrawerSelect
              value={isCollapsed ? 'compact' : 'comfortable'}
              onValueChange={(val) => setCollapsed(val === 'compact')}
              title={t('settings.feedLayout')}
              options={[
                { value: 'comfortable', label: t('settings.comfortable'), description: t('settings.comfortableDesc') },
                { value: 'compact', label: t('settings.compact'), description: t('settings.compactDesc') },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Media */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">{t('settings.media')}</h3>
        <div className="space-y-4">
          <AutoPlayToggle />
          <ShowAnimationsToggle />
        </div>
      </div>

    </div>
  );
}

function LanguageSelector() {
  const { t } = useTranslation();
  const { language, setPreferredLanguage } = useUserLanguage();
  return (
    <SettingDrawerSelect
      value={language}
      onValueChange={setPreferredLanguage}
      title={t('settings.language')}
      searchable
      options={SUPPORTED_LANGUAGES.map(l => ({
        value: l.code,
        label: `${l.nativeName}`,
        description: l.name,
      }))}
    />
  );
}

function ContentSettings() {
  const { t } = useTranslation();
  const [postVisibility, setPostVisibility] = useState('public');
  
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Eye className="w-5 h-5 text-zinc-400" />
        <h2 className="text-lg font-semibold text-white">{t('settings.contentPreferences')}</h2>
      </div>

      {/* Post Settings */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">{t('settings.postSettings')}</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-zinc-500" />
              <div>
                <p className="text-white font-medium">{t('settings.defaultPostVisibility')}</p>
                <p className="text-zinc-500 text-sm">{t('settings.whoCanSeeDefault')}</p>
              </div>
            </div>
            <SettingDrawerSelect
              value={postVisibility}
              onValueChange={() => toast.info(t('settings.comingSoon', 'Coming soon'))}
              title={t('settings.defaultPostVisibility')}
              options={[
                { value: 'public', label: t('settings.public'), description: t('settings.publicDesc') },
                { value: 'followers', label: t('settings.followers'), description: t('settings.followersDesc') },
                { value: 'private', label: t('settings.private'), description: t('settings.privateDesc') },
              ]}
            />
          </div>
          <SettingToggle
            icon={FileText}
            title={t('settings.autoSaveDrafts')}
            description={t('settings.autoSaveDraftsDesc')}
            defaultChecked
            comingSoon
          />
        </div>
      </div>

      {/* Content Filtering */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">{t('settings.contentFiltering')}</h3>
        <div className="space-y-4">
          <SettingToggle
            icon={Filter}
            title={t('settings.filterExplicit')}
            description={t('settings.filterExplicitDesc')}
            defaultChecked={false}
            comingSoon
          />
          <SettingToggle
            icon={Eye}
            title={t('settings.showSensitive')}
            description={t('settings.showSensitiveDesc')}
            defaultChecked={false}
            comingSoon
          />
          <SettingToggle
            icon={AlertTriangle}
            title={t('settings.enableContentWarnings')}
            description={t('settings.enableContentWarningsDesc')}
            defaultChecked={false}
            comingSoon
          />
        </div>
      </div>




    </div>
  );
}

function SettingToggle({ 
  icon: Icon, 
  title, 
  description, 
  defaultChecked = false,
  onCheckedChange,
  disabled = false,
  comingSoon = false,
}: { 
  icon: any; 
  title: string; 
  description: string; 
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  comingSoon?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Icon className="w-5 h-5 text-zinc-500" />
        <div>
          <p className="text-white font-medium">{title}</p>
          <p className="text-zinc-500 text-sm">{description}</p>
        </div>
      </div>
      <Switch 
        defaultChecked={defaultChecked} 
        checked={onCheckedChange ? defaultChecked : undefined}
        onCheckedChange={comingSoon ? () => toast.info(t('settings.comingSoon', 'Coming soon')) : onCheckedChange}
        disabled={disabled}
      />
    </div>
  );
}

function SocialLinkInput({ 
  label, 
  placeholder, 
  icon,
  value,
  onChange
}: { 
  label: string; 
  placeholder: string; 
  icon: React.ReactNode;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm text-zinc-400">{label}</label>
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 w-5 h-5 [&_svg]:w-5 [&_svg]:h-5">
          {icon}
        </div>
        <Input 
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
        />
      </div>
    </div>
  );
}

function AssetsSettings() {
  const { t } = useTranslation();
  const { walletAddress } = useAuthContext();
  const navigate = useNavigate();
  const [walletDrawerOpen, setWalletDrawerOpen] = useState(false);

  const coinBalance = 0;

  const truncatedAddress = walletAddress 
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : t('settings.notConnected');

  const handleCopyWallet = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      toast.success(t('settings.walletCopied'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Wallet className="w-5 h-5 text-zinc-400" />
        <h2 className="text-lg font-semibold text-white">{t('settings.assets')}</h2>
      </div>

      {/* Wallet Address */}
      <div>
        <button
          onClick={handleCopyWallet}
          disabled={!walletAddress}
          className="w-full flex items-center justify-between p-4 bg-zinc-800 rounded-xl hover:bg-zinc-750 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-zinc-700 rounded-xl flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <span className="text-white font-mono">{truncatedAddress}</span>
          </div>
          <Copy className="w-5 h-5 text-zinc-500 group-hover:text-white transition-colors" />
        </button>
      </div>

      {/* DHB Balance */}
      <div>
        <button
          onClick={() => setWalletDrawerOpen(true)}
          className="w-full flex items-center justify-between p-4 bg-zinc-800 rounded-xl hover:bg-zinc-750 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-zinc-700 rounded-xl flex items-center justify-center">
              <img src={dehubCoin} alt="DHB" className="w-6 h-6" />
            </div>
            <span className="text-white font-semibold">{coinBalance.toLocaleString()} DHB</span>
          </div>
          <span className="text-zinc-500 group-hover:text-white transition-colors text-sm">{t('settings.manage')}</span>
        </button>
      </div>

      {/* Wallet */}
      <div>
        <button
          onClick={() => navigate('/app/wallet')}
          className="w-full flex items-center justify-between p-4 bg-zinc-800 rounded-xl hover:bg-zinc-750 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-zinc-700 rounded-xl flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <span className="text-white font-semibold">Wallet</span>
          </div>
          <ExternalLink className="w-5 h-5 text-zinc-500 group-hover:text-white transition-colors" />
        </button>
      </div>

      {/* Wallet Drawer */}
      <Drawer open={walletDrawerOpen} onOpenChange={setWalletDrawerOpen}>
        <DrawerContent glass className="px-4 pb-8">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Wallet</DrawerTitle>
          </DrawerHeader>
          <WalletMenuContent balance={coinBalance} onClose={() => setWalletDrawerOpen(false)} />
        </DrawerContent>
      </Drawer>

      {/* Fractions */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4 flex items-center gap-2">
          <PieChart className="w-4 h-4" />
          {t('settings.fractionsOwn')}
        </h3>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <PieChart className="w-10 h-10 text-zinc-600 mb-3" />
          <p className="text-zinc-500">{t('settings.noFractions')}</p>
        </div>
      </div>

      {/* Owned Usernames */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4 flex items-center gap-2">
          <AtSign className="w-4 h-4" />
          {t('settings.usernamesOwn')}
        </h3>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <AtSign className="w-10 h-10 text-zinc-600 mb-3" />
          <p className="text-zinc-500">{t('settings.noUsernames')}</p>
        </div>
      </div>

      {/* Offers Made */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4 flex items-center gap-2">
          <Handshake className="w-4 h-4" />
          {t('settings.offersMade')}
        </h3>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Handshake className="w-10 h-10 text-zinc-600 mb-3" />
          <p className="text-zinc-500">{t('settings.noOffers')}</p>
        </div>
      </div>
    </div>
  );
}

function MessagesSettings() {
  const { t } = useTranslation();
  const [dmAccess, setDmAccess] = useState('everyone');
  
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <MessageSquare className="w-5 h-5 text-zinc-400" />
        <h2 className="text-lg font-semibold text-white">{t('settings.messageSettings')}</h2>
      </div>

      {/* DM Access Control */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">{t('settings.directMessageAccess')}</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageCircle className="w-5 h-5 text-zinc-500" />
              <div>
                <p className="text-white font-medium">{t('settings.allowDirectMessages')}</p>
                <p className="text-zinc-500 text-sm">{t('settings.controlDMs')}</p>
              </div>
            </div>
            <SettingDrawerSelect
              value={dmAccess}
              onValueChange={() => toast.info(t('settings.comingSoon', 'Coming soon'))}
              title={t('settings.allowDirectMessages')}
              options={[
                { value: 'everyone', label: t('settings.everyone'), description: t('settings.dmEveryoneHelp') },
                { value: 'following', label: t('settings.peopleIFollow'), description: t('settings.peopleIFollowDesc') },
                { value: 'none', label: t('settings.noOneClosed'), description: t('settings.noOneClosedDesc') },
              ]}
            />
          </div>
          <div className="bg-zinc-800/50 rounded-xl p-4 text-sm text-zinc-400">
            <p className="mb-2"><strong className="text-white">{t('settings.everyone')}:</strong> {t('settings.dmEveryoneHelp')}</p>
            <p className="mb-2"><strong className="text-white">{t('settings.peopleIFollow')}:</strong> {t('settings.dmFollowingHelp')}</p>
            <p><strong className="text-white">{t('settings.noOneClosed')}:</strong> {t('settings.dmClosedHelp')}</p>
          </div>
        </div>
      </div>

      {/* Message Preferences */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">{t('settings.preferences')}</h3>
        <div className="space-y-4">
          <SettingToggle
            icon={Bell}
            title={t('settings.messageNotifications')}
            description={t('settings.messageNotificationsDesc')}
            defaultChecked
            comingSoon
          />
          <SettingToggle
            icon={Eye}
            title={t('settings.readReceipts')}
            description={t('settings.readReceiptsDesc')}
            defaultChecked
            comingSoon
          />
          <SettingToggle
            icon={Lock}
            title={t('settings.e2eEncryption')}
            description={t('settings.e2eEncryptionDesc')}
            defaultChecked
            comingSoon
          />
          <SettingToggle
            icon={Filter}
            title={t('settings.filterMessageRequests')}
            description={t('settings.filterMessageRequestsDesc')}
            comingSoon
          />
        </div>
      </div>

      {/* Storage */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">{t('settings.storage')}</h3>
        <div className="bg-zinc-800 rounded-xl p-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-white font-medium">{t('settings.storageUsed')}</span>
            <span className="text-zinc-400">{t('settings.storageAmount')}</span>
          </div>
          <div className="w-full bg-zinc-700 rounded-lg h-2 mb-3">
            <div className="bg-white h-2 rounded-lg" style={{ width: '42%' }} />
          </div>
          <div className="flex justify-between text-xs text-zinc-500">
            <span>{t('settings.messagesStorage')}</span>
            <span>{t('settings.mediaStorage')}</span>
          </div>
          <p className="text-center text-xs text-zinc-600 mt-3">
            {t('settings.upgradeStorage')}
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">{t('settings.quickActions')}</h3>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => toast.info(t('settings.comingSoon', 'Coming soon'))} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors">
            <FileText className="w-6 h-6 text-zinc-400" />
            <span className="text-zinc-300 text-sm">{t('settings.archivedChats')}</span>
          </button>
          <button onClick={() => toast.info(t('settings.comingSoon', 'Coming soon'))} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors">
            <Save className="w-6 h-6 text-zinc-400" />
            <span className="text-zinc-300 text-sm">{t('settings.exportChats')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'AT', name: 'Austria' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'IE', name: 'Ireland' },
  { code: 'GR', name: 'Greece' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'RO', name: 'Romania' },
  { code: 'HU', name: 'Hungary' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'CN', name: 'China' },
  { code: 'IN', name: 'India' },
  { code: 'SG', name: 'Singapore' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'TH', name: 'Thailand' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'PH', name: 'Philippines' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'AR', name: 'Argentina' },
  { code: 'CL', name: 'Chile' },
  { code: 'CO', name: 'Colombia' },
  { code: 'PE', name: 'Peru' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'EG', name: 'Egypt' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'KE', name: 'Kenya' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'IL', name: 'Israel' },
  { code: 'TR', name: 'Turkey' },
  { code: 'RU', name: 'Russia' },
  { code: 'UA', name: 'Ukraine' },
];

function GeoBlockingSelector() {
  const { t } = useTranslation();
  const [blockedCountries, setBlockedCountries] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredCountries = COUNTRIES.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleCountry = (code: string) => {
    setBlockedCountries(prev => 
      prev.includes(code) 
        ? prev.filter(c => c !== code)
        : [...prev, code]
    );
  };

  const removeCountry = (code: string) => {
    setBlockedCountries(prev => prev.filter(c => c !== code));
  };

  return (
    <div className="space-y-3">
      {/* Selected Countries */}
      {blockedCountries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {blockedCountries.map(code => {
            const country = COUNTRIES.find(c => c.code === code);
            return (
              <span 
                key={code}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-sm"
              >
                <MapPin className="w-3 h-3" />
                {country?.name}
                <button 
                  onClick={() => removeCountry(code)}
                  className="ml-1 hover:text-red-300"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white hover:bg-zinc-700 transition-colors"
      >
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-zinc-500" />
          <span className="text-zinc-400">
            {blockedCountries.length === 0 
              ? t('settings.selectCountries')
              : `${blockedCountries.length} ${blockedCountries.length === 1 ? t('settings.countryBlocked') : t('settings.countriesBlocked')}`}
          </span>
        </div>
        <svg 
          className="w-4 h-4 text-zinc-500" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Drawer */}
      <Drawer open={isOpen} onOpenChange={setIsOpen}>
        <DrawerContent glass className="max-h-[70vh]">
          <DrawerHeader className="border-b border-white/10">
            <DrawerTitle className="text-white">{t('settings.blockCountries')}</DrawerTitle>
          </DrawerHeader>
          
          {/* Search input */}
          <div className="p-4 border-b border-white/10">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder={t('settings.searchCountries')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/20"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-zinc-500 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          
          {/* Country List */}
          <div className="flex-1 overflow-y-auto max-h-[50vh] pb-safe">
            {filteredCountries.length > 0 ? (
              filteredCountries.map(country => (
                <button
                  key={country.code}
                  onClick={() => toggleCountry(country.code)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left"
                >
                  <span className="text-white text-sm">{country.name}</span>
                  {blockedCountries.includes(country.code) && (
                    <div className="w-5 h-5 bg-red-500 rounded flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </button>
              ))
            ) : (
              <div className="px-4 py-8 text-center text-sm text-zinc-500">
                {t('settings.noCountriesFound')}
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

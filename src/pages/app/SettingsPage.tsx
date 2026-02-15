import { useState, useRef, useEffect } from 'react';
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
  Heart,
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
  Skull
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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateProfile, getAccountInfo, type UpdateProfileData, type DeHubUser } from '@/lib/api/dehub';
import { buildAvatarUrl, buildCoverUrl } from '@/lib/media-url';
import { useAuth as useAuthContext } from '@/contexts/AuthContext';
import { useCoinPlacement } from '@/hooks/use-coin-placement';
import { usePrivacySettings } from '@/hooks/use-privacy-settings';
import { WalletMenuContent } from '@/components/app/CoinBalanceMenu';
import { FollowRequestsDrawer } from '@/components/app/profile/FollowRequestsDrawer';
import dehubCoin from '@/assets/dehub-coin.png';
import settingsIcon from '@/assets/icons/settings-icon.png';

const tabs = [
  { icon: User, value: 'profile', label: 'Profile' },
  { icon: Bell, value: 'notifications', label: 'Notifications' },
  { icon: Shield, value: 'privacy', label: 'Privacy' },
  { icon: Palette, value: 'appearance', label: 'Appearance' },
  { icon: Eye, value: 'content', label: 'Content' },
  { icon: MessageSquare, value: 'messages', label: 'Messages' },
  { icon: Wallet, value: 'assets', label: 'Assets' },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');
  const [theme, setTheme] = useState('system');
  const { isAuthenticated, disconnect } = useAuth();

  const handleLogout = async () => {
    try {
      await disconnect();
      toast.success('Logged out');
    } catch {
      toast.error('Logout failed');
    }
  };

  // Block access for unauthenticated users (AuthGate handles loading state internally)
  if (!isAuthenticated) {
    return (
      <AuthGate description="Log in to access and manage your account settings." />
    );
  }

  return (
    <div className="min-h-screen p-3 sm:p-4">
      {/* Header */}
      <div className="bg-zinc-900 rounded-2xl p-4 sm:p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <img src={settingsIcon} alt="Settings" className="w-10 h-10 object-contain" />
            <div>
              <h1 className="text-xl font-bold text-white">Settings</h1>
              <p className="text-zinc-500 text-sm">Manage your account and preferences</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-white"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline text-sm font-medium">Log out</span>
          </button>
        </div>

        {/* Tab Icons */}
        <div className="flex gap-[6px] sm:gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`p-[11px] sm:p-3 rounded-xl transition-colors ${
                  activeTab === tab.value
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-500 hover:text-white hover:bg-zinc-800/50'
                }`}
                title={tab.label}
              >
                <Icon className="w-[18px] h-[18px] sm:w-5 sm:h-5" />
              </button>
            );
          })}
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
  const { user: authUser, refreshUser } = useAuthContext();
  const queryClient = useQueryClient();
  
  // Form state
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
  
  // Original values to compare against
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
  
  // Image state
  const [avatarPreview, setAvatarPreview] = useState<string | undefined>();
  const [coverPreview, setCoverPreview] = useState<string | undefined>();
  const [avatarFile, setAvatarFile] = useState<File | undefined>();
  const [coverFile, setCoverFile] = useState<File | undefined>();
  
  // Loading state
  const [isLoading, setIsLoading] = useState(true);
  
  // Refs for file inputs
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  
  // Fetch current profile data
  useEffect(() => {
    async function loadProfile() {
      if (!authUser?.address) return;
      
      try {
        setIsLoading(true);
        const userData = await getAccountInfo(authUser.address);
        
        // Populate form fields
        const loadedDisplayName = userData.displayName || userData.display_name || '';
        const loadedUsername = userData.username || '';
        const loadedBio = userData.aboutMe || userData.bio || '';
        
        // Social links from customs or direct fields
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
        
        // Store original values
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
        
        // Set avatar/cover preview from existing URLs
        const address = userData.address || userData.wallet_address || '';
        const rawAvatarUrl = userData.avatarImageUrl || userData.avatarUrl || userData.avatar_url;
        const rawCoverUrl = userData.coverImageUrl || userData.coverUrl || userData.cover_url;
        setAvatarPreview(buildAvatarUrl(address, rawAvatarUrl));
        setCoverPreview(buildCoverUrl(address, rawCoverUrl));
      } catch (error) {
        console.error('Failed to load profile:', error);
        toast.error('Failed to load profile data');
      } finally {
        setIsLoading(false);
      }
    }
    
    loadProfile();
  }, [authUser?.address]);
  
  // Compute hasChanges by comparing current values to original
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
  
  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: UpdateProfileData) => {
      return updateProfile(data);
    },
    onSuccess: async () => {
      toast.success('Profile updated successfully');
      setAvatarFile(undefined);
      setCoverFile(undefined);
      // Refresh AuthContext user to update sidebar avatar
      await refreshUser();
      // Reload profile to update original values
      if (authUser?.address) {
        const userData = await getAccountInfo(authUser.address);
        const customs = userData.customs as Record<string, string> | undefined;
        setOriginalValues({
          displayName: userData.displayName || userData.display_name || '',
          username: userData.username || '',
          bio: userData.aboutMe || userData.bio || '',
          twitterLink: customs?.twitterLink || '',
          discordLink: customs?.discordLink || '',
          instagramLink: customs?.instagramLink || '',
          tiktokLink: customs?.tiktokLink || '',
          youtubeLink: customs?.youtubeLink || '',
          telegramLink: customs?.telegramLink || '',
          facebookLink: customs?.facebookLink || '',
        });
      }
      // Invalidate profile queries to refresh data everywhere
      queryClient.invalidateQueries({ queryKey: ['dehub-profile'] });
      queryClient.invalidateQueries({ queryKey: ['dehub-user-content'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update profile');
    },
  });
  
  // Handle avatar upload
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image must be less than 5MB');
        return;
      }
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };
  
  // Handle cover upload
  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error('Image must be less than 10MB');
        return;
      }
      setCoverFile(file);
      setCoverPreview(URL.createObjectURL(file));
    }
  };
  
  // Handle save
  const handleSave = () => {
    const data: UpdateProfileData = {};
    
    // Only include changed fields
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
          <h2 className="text-lg font-semibold text-white">Profile Settings</h2>
        </div>
        {hasChanges && (
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="bg-white/10 backdrop-blur-md border border-white/10 text-white font-semibold hover:bg-white/15 hover:shadow-[0_0_15px_rgba(255,255,255,0.08)] rounded-xl transition-all duration-200"
          >
            {updateMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Changes
          </Button>
        )}
      </div>

      {/* Cover Image - same aspect ratio as Profile page */}
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
          <h3 className="font-medium text-white">Profile Picture</h3>
          <p className="text-zinc-500 text-sm">Click the camera icon to upload</p>
        </div>
      </div>

      {/* Display Name & Username */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-white mb-2">Display Name</label>
          <Input 
            placeholder="Enter your display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-white mb-2">Username</label>
          <Input 
            placeholder="username"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
          />
          <p className="text-zinc-500 text-xs mt-1">3-30 characters, letters, numbers, underscores only</p>
        </div>
      </div>

      {/* Bio */}
      <div>
        <label className="block text-sm font-medium text-white mb-2">Bio</label>
        <Textarea 
          placeholder="Tell us about yourself..."
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 min-h-[100px]"
        />
      </div>

      {/* Social Links */}
      <div>
        <h3 className="font-medium text-white mb-4">Social Links</h3>
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
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Bell className="w-5 h-5 text-zinc-400" />
        <h2 className="text-lg font-semibold text-white">Notification Settings</h2>
      </div>

      {/* General */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">General</h3>
        <div className="space-y-4">
          <SettingToggle
            icon={Mail}
            title="Email Notifications"
            description="Receive notifications via email"
            defaultChecked
          />
          <SettingToggle
            icon={Bell}
            title="Push Notifications"
            description="Receive push notifications in browser"
            defaultChecked
          />
        </div>
      </div>

      {/* Activity */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">Activity</h3>
        <div className="space-y-4">
          <SettingToggle
            icon={Heart}
            title="Likes"
            description="When someone likes your posts"
            defaultChecked
          />
          <SettingToggle
            icon={MessageSquare}
            title="Comments"
            description="When someone comments on your posts"
            defaultChecked
          />
          <SettingToggle
            icon={Users}
            title="New Followers"
            description="When someone follows you"
            defaultChecked
          />
          <SettingToggle
            icon={MessageSquare}
            title="Direct Messages"
            description="When you receive new messages"
            defaultChecked
          />
        </div>
      </div>

      {/* Quiet Hours */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">Quiet Hours</h3>
        <SettingToggle
          icon={Clock}
          title="Enable Quiet Hours"
          description="Pause notifications from 10 PM to 8 AM"
        />
      </div>
    </div>
  );
}

function PrivacySettings() {
  const { showFollowersFollowing, hideFollowerCounts, isPrivate, defaultPostVisibility, updateSettings, isUpdating, isLoading } = usePrivacySettings();
  const [whoCanMessage, setWhoCanMessage] = useState('everyone');
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const { user } = useAuthContext();
  const [followRequestsOpen, setFollowRequestsOpen] = useState(false);
  
  const handlePostVisibilityChange = async (newVisibility: 'public' | 'private') => {
    if (!user?.address) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    setIsUpdatingVisibility(true);
    
    try {
      // First update the setting in database
      updateSettings({ default_post_visibility: newVisibility });
      
      // Then call the API to update all existing posts visibility
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
          ? 'All posts set to private' 
          : 'All posts set to public'
      );
    } catch (error) {
      console.error('Failed to update visibility:', error);
      toast.error('Failed to update visibility');
    } finally {
      setIsUpdatingVisibility(false);
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="w-5 h-5 text-zinc-400" />
        <h2 className="text-lg font-semibold text-white">Privacy & Security</h2>
      </div>

      {/* Profile Visibility */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">Profile Visibility</h3>
        <div className="space-y-4">
          <SettingToggle
            icon={Lock}
            title="Private Account"
            description="Only approved followers can see your content"
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
                View Follow Requests
              </button>
              <FollowRequestsDrawer open={followRequestsOpen} onOpenChange={setFollowRequestsOpen} />
            </div>
          )}
          <SettingToggle
            icon={Globe}
            title="Public Profile"
            description="Make your profile visible to everyone"
            defaultChecked
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-zinc-500" />
              <div>
                <p className="text-white font-medium">Follow Visibility</p>
                <p className="text-zinc-500 text-sm">Control how others see your social stats</p>
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
              title="Follow Visibility"
              options={[
                { value: 'public', label: 'Public', description: 'Numbers visible and clickable' },
                { value: 'counts-only', label: 'Numbers only', description: 'Numbers visible but not clickable' },
                { value: 'hidden', label: 'Hidden', description: 'Numbers hidden from visitors' },
              ]}
            />
          </div>
          <SettingToggle
            icon={Users}
            title="Show Activity Status"
            description="Let others see when you're active"
            defaultChecked
          />
          <SettingToggle
            icon={Globe}
            title="Search Engine Indexing"
            description="Allow search engines to index your profile"
            defaultChecked
          />
        </div>
      </div>

      {/* Post Visibility */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">Post Visibility</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Eye className="w-5 h-5 text-zinc-500" />
              <div>
                <p className="text-white font-medium">Default Post Visibility</p>
                <p className="text-zinc-500 text-sm">Applies to all current and future posts</p>
              </div>
            </div>
            <SettingDrawerSelect
              value={defaultPostVisibility}
              onValueChange={(value) => handlePostVisibilityChange(value as 'public' | 'private')}
              disabled={isUpdating || isLoading || isUpdatingVisibility}
              title="Default Post Visibility"
              options={[
                { value: 'public', label: 'Public', description: 'Anyone can see your posts' },
                { value: 'private', label: 'Private', description: 'Only you can see your posts' },
              ]}
            />
          </div>
          <div className="bg-zinc-800/50 rounded-xl p-4 text-sm text-zinc-400">
            <p><strong className="text-white">Note:</strong> Changing this will update the visibility of all your existing posts and set the default for new posts.</p>
          </div>
        </div>
      </div>

      {/* Messaging */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">Messaging</h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageCircle className="w-5 h-5 text-zinc-500" />
            <div>
              <p className="text-white font-medium">Who can message you</p>
              <p className="text-zinc-500 text-sm">Control who can send you direct messages</p>
            </div>
          </div>
          <SettingDrawerSelect
            value={whoCanMessage}
            onValueChange={setWhoCanMessage}
            title="Who can message you"
            options={[
              { value: 'everyone', label: 'Everyone', description: 'Anyone can send you messages' },
              { value: 'followers', label: 'Followers', description: 'Only your followers can message you' },
              { value: 'none', label: 'No one', description: 'Disable direct messages' },
            ]}
          />
        </div>
      </div>

      {/* Account Security */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">Account Security</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-zinc-500" />
              <div>
                <p className="text-white font-medium">Two-Factor Authentication</p>
                <p className="text-zinc-500 text-sm">Add an extra layer of security</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 rounded-md">
              Enable
            </Button>
          </div>
        </div>
      </div>

      {/* Extract Data */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">Your Data</h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Download className="w-5 h-5 text-zinc-500" />
            <div>
              <p className="text-white font-medium">Extract Data</p>
              <p className="text-zinc-500 text-sm">Download a copy of all your data</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 rounded-md"
            onClick={() => toast.success('Data export request submitted. You will receive an email when your data is ready.')}
          >
            Download
          </Button>
        </div>
      </div>

      {/* Geo-Blocking */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">Geo-Blocking</h3>
        <p className="text-zinc-500 text-sm mb-4">Block users from specific countries from viewing your content</p>
        <GeoBlockingSelector />
      </div>
    </div>
  );
}

function AppearanceSettings({ theme, setTheme }: { theme: string; setTheme: (v: string) => void }) {
  const { stickToBanner, setStickToBanner } = useCoinPlacement();
  const [feedLayout, setFeedLayout] = useState('comfortable');
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Palette className="w-5 h-5 text-zinc-400" />
        <h2 className="text-lg font-semibold text-white">Appearance</h2>
      </div>

      {/* Theme */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">Theme</h3>
        <div className="relative">
          {/* Right fade only */}
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none z-10" />
          
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
            {[
              { value: 'light', icon: Sun, label: 'Light' },
              { value: 'dark', icon: Moon, label: 'Dark' },
              { value: 'system', icon: Monitor, label: 'System' },
              { value: 'cosmic', icon: Sparkles, label: 'Cosmic' },
              { value: 'christmas', icon: Gift, label: 'Christmas' },
              { value: 'island', icon: Palmtree, label: 'Island' },
              { value: 'hacker', icon: Terminal, label: 'Hacker' },
              { value: 'horror', icon: Skull, label: 'Horror' },
            ].map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  onClick={() => setTheme(option.value)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-colors flex-shrink-0 min-w-[100px] ${
                    theme === option.value
                      ? 'bg-zinc-800 border-2 border-white'
                      : 'bg-zinc-800/50 border-2 border-transparent hover:bg-zinc-800'
                  }`}
                >
                  <Icon className="w-6 h-6 text-zinc-400" />
                  <span className="text-white text-sm">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Layout */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">Layout</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <LayoutGrid className="w-5 h-5 text-zinc-500" />
              <div>
                <p className="text-white font-medium">Feed Layout</p>
                <p className="text-zinc-500 text-sm">Choose how posts are displayed</p>
              </div>
            </div>
            <SettingDrawerSelect
              value={feedLayout}
              onValueChange={setFeedLayout}
              title="Feed Layout"
              options={[
                { value: 'comfortable', label: 'Comfortable', description: 'Standard spacing for easy reading' },
                { value: 'compact', label: 'Compact', description: 'Reduced spacing for more content' },
              ]}
            />
          </div>
          <SettingToggle
            icon={LayoutGrid}
            title="Compact Mode"
            description="Reduce spacing for more content"
          />
        </div>
      </div>

      {/* Media */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">Media</h3>
        <div className="space-y-4">
          <SettingToggle
            icon={Play}
            title="Auto-play Videos"
            description="Automatically play videos in feed"
            defaultChecked
          />
          <SettingToggle
            icon={Sparkles}
            title="Show Animations"
            description="Enable smooth transitions and effects"
            defaultChecked
          />
        </div>
      </div>

      {/* Coin Placement */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">Coin Placement</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Coins className="w-5 h-5 text-zinc-500" />
              <div>
                <p className="text-white font-medium">Stick coin to banner</p>
                <p className="text-zinc-500 text-sm">Show coin in header (mobile) and sidebar (desktop)</p>
              </div>
            </div>
            <Switch
              checked={stickToBanner}
              onCheckedChange={setStickToBanner}
              className="data-[state=checked]:bg-white data-[state=unchecked]:bg-zinc-700"
            />
          </div>
        </div>
      </div>

      <div>
        <Button variant="glass" className="w-full">
          Apply Changes
        </Button>
      </div>
    </div>
  );
}

function ContentSettings() {
  const [postVisibility, setPostVisibility] = useState('public');
  
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Eye className="w-5 h-5 text-zinc-400" />
        <h2 className="text-lg font-semibold text-white">Content Preferences</h2>
      </div>

      {/* Post Settings */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">Post Settings</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-zinc-500" />
              <div>
                <p className="text-white font-medium">Default Post Visibility</p>
                <p className="text-zinc-500 text-sm">Who can see your posts by default</p>
              </div>
            </div>
            <SettingDrawerSelect
              value={postVisibility}
              onValueChange={setPostVisibility}
              title="Default Post Visibility"
              options={[
                { value: 'public', label: 'Public', description: 'Anyone can see your posts' },
                { value: 'followers', label: 'Followers', description: 'Only your followers can see' },
                { value: 'private', label: 'Private', description: 'Only you can see' },
              ]}
            />
          </div>
          <SettingToggle
            icon={FileText}
            title="Auto-save Drafts"
            description="Automatically save your posts as drafts"
            defaultChecked
          />
        </div>
      </div>

      {/* Content Filtering */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">Content Filtering</h3>
        <div className="space-y-4">
          <SettingToggle
            icon={Filter}
            title="Filter Explicit Content"
            description="Hide posts marked as explicit or mature"
            defaultChecked
          />
          <SettingToggle
            icon={Eye}
            title="Show Sensitive Content"
            description="Display content warnings for sensitive posts"
          />
          <SettingToggle
            icon={AlertTriangle}
            title="Enable Content Warnings"
            description="Show warnings before displaying sensitive content"
            defaultChecked
          />
        </div>
      </div>

      {/* Feed Preferences */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">Feed Preferences</h3>
        <SettingToggle
          icon={Repeat2}
          title="Show Reposts"
          description="Display posts shared by people you follow"
          defaultChecked
        />
      </div>

      <div className="flex justify-end">
        <Button className="bg-zinc-800 text-white hover:bg-zinc-700 border border-zinc-700">
          Save Preferences
        </Button>
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
}: { 
  icon: any; 
  title: string; 
  description: string; 
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
}) {
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
        onCheckedChange={onCheckedChange}
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
  const { walletAddress } = useAuthContext();
  const [walletDrawerOpen, setWalletDrawerOpen] = useState(false);

  // TODO: Get real balance from wallet
  const coinBalance = 0;

  // Format wallet address for display
  const truncatedAddress = walletAddress 
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : 'Not connected';

  const handleCopyWallet = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      toast.success('Wallet address copied!');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Wallet className="w-5 h-5 text-zinc-400" />
        <h2 className="text-lg font-semibold text-white">Assets</h2>
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
          <span className="text-zinc-500 group-hover:text-white transition-colors text-sm">Manage →</span>
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
          Fractions You Own
        </h3>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <PieChart className="w-10 h-10 text-zinc-600 mb-3" />
          <p className="text-zinc-500">You don't own any fractions yet</p>
        </div>
      </div>

      {/* Owned Usernames */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4 flex items-center gap-2">
          <AtSign className="w-4 h-4" />
          Usernames You Own
        </h3>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <AtSign className="w-10 h-10 text-zinc-600 mb-3" />
          <p className="text-zinc-500">You don't own any usernames yet</p>
        </div>
      </div>

      {/* Offers Made */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4 flex items-center gap-2">
          <Handshake className="w-4 h-4" />
          Offers You've Made
        </h3>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Handshake className="w-10 h-10 text-zinc-600 mb-3" />
          <p className="text-zinc-500">You haven't made any offers yet</p>
        </div>
      </div>
    </div>
  );
}

function MessagesSettings() {
  const [dmAccess, setDmAccess] = useState('everyone');
  
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <MessageSquare className="w-5 h-5 text-zinc-400" />
        <h2 className="text-lg font-semibold text-white">Message Settings</h2>
      </div>

      {/* DM Access Control */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">Direct Message Access</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageCircle className="w-5 h-5 text-zinc-500" />
              <div>
                <p className="text-white font-medium">Allow Direct Messages</p>
                <p className="text-zinc-500 text-sm">Control who can send you DMs</p>
              </div>
            </div>
            <SettingDrawerSelect
              value={dmAccess}
              onValueChange={setDmAccess}
              title="Allow Direct Messages"
              options={[
                { value: 'everyone', label: 'Everyone', description: 'Anyone can send you a DM' },
                { value: 'following', label: 'People I follow', description: 'Only users you follow can message you' },
                { value: 'none', label: 'No one (Closed)', description: 'DMs are completely disabled' },
              ]}
            />
          </div>
          <div className="bg-zinc-800/50 rounded-xl p-4 text-sm text-zinc-400">
            <p className="mb-2"><strong className="text-white">Everyone:</strong> Anyone can send you a DM</p>
            <p className="mb-2"><strong className="text-white">People I follow:</strong> Only users you follow can message you</p>
            <p><strong className="text-white">No one (Closed):</strong> DMs are completely disabled</p>
          </div>
        </div>
      </div>

      {/* Message Preferences */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">Preferences</h3>
        <div className="space-y-4">
          <SettingToggle
            icon={Bell}
            title="Message Notifications"
            description="Receive notifications for new messages"
            defaultChecked
          />
          <SettingToggle
            icon={Eye}
            title="Read Receipts"
            description="Let others know when you've read their messages"
            defaultChecked
          />
          <SettingToggle
            icon={Lock}
            title="End-to-End Encryption"
            description="Encrypt all your messages for extra security"
            defaultChecked
          />
          <SettingToggle
            icon={Filter}
            title="Filter Message Requests"
            description="Hide message requests from accounts you don't follow"
          />
        </div>
      </div>

      {/* Storage */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">Storage</h3>
        <div className="bg-zinc-800 rounded-xl p-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-white font-medium">Storage Used</span>
            <span className="text-zinc-400">2.1 GB of 5 GB</span>
          </div>
          <div className="w-full bg-zinc-700 rounded-lg h-2 mb-3">
            <div className="bg-white h-2 rounded-lg" style={{ width: '42%' }} />
          </div>
          <div className="flex justify-between text-xs text-zinc-500">
            <span>Messages: 1.2 GB</span>
            <span>Media: 900 MB</span>
          </div>
          <p className="text-center text-xs text-zinc-600 mt-3">
            Increase your stakeholdings or upgrade to premium to unlock more storage
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-3">
          <button className="flex flex-col items-center gap-2 p-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors">
            <FileText className="w-6 h-6 text-zinc-400" />
            <span className="text-zinc-300 text-sm">Archived Chats</span>
          </button>
          <button className="flex flex-col items-center gap-2 p-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors">
            <Save className="w-6 h-6 text-zinc-400" />
            <span className="text-zinc-300 text-sm">Export Chats</span>
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
              ? 'Select countries to block...' 
              : `${blockedCountries.length} ${blockedCountries.length === 1 ? 'country' : 'countries'} blocked`}
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
            <DrawerTitle className="text-white">Block Countries</DrawerTitle>
          </DrawerHeader>
          
          {/* Search input */}
          <div className="p-4 border-b border-white/10">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search countries..."
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
                No countries found
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

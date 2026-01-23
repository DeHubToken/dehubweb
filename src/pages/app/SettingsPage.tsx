import { useState } from 'react';
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
  Copy
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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

  return (
    <div className="min-h-screen p-3 sm:p-4">
      {/* Header */}
      <div className="bg-zinc-900 rounded-2xl p-4 sm:p-6 mb-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center">
            <SettingsIcon className="w-6 h-6 text-zinc-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Settings</h1>
            <p className="text-zinc-500 text-sm">Manage your account and preferences</p>
          </div>
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
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <User className="w-5 h-5 text-zinc-400" />
        <h2 className="text-lg font-semibold text-white">Profile Settings</h2>
      </div>

      {/* Profile Picture */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar className="w-20 h-20">
            <AvatarImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=felix" />
            <AvatarFallback className="bg-zinc-700 text-white text-xl">U</AvatarFallback>
          </Avatar>
          <button className="absolute bottom-0 right-0 w-8 h-8 bg-zinc-700 rounded-full flex items-center justify-center hover:bg-zinc-600 transition-colors">
            <Camera className="w-4 h-4 text-white" />
          </button>
        </div>
        <div>
          <h3 className="font-medium text-white">Profile Picture</h3>
          <p className="text-zinc-500 text-sm mb-2">Upload a profile picture to personalize your account</p>
          <Button variant="outline" size="sm" className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">
            Upload Image
          </Button>
        </div>
      </div>

      {/* Display Name & Username */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-white mb-2">Display Name</label>
          <Input 
            placeholder="Enter your display name" 
            className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-white mb-2">Username</label>
          <Input 
            placeholder="@username" 
            className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
          />
        </div>
      </div>

      {/* Bio */}
      <div>
        <label className="block text-sm font-medium text-white mb-2">Bio</label>
        <Textarea 
          placeholder="Tell us about yourself..." 
          className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 min-h-[100px]"
        />
      </div>

      {/* Social Links */}
      <div>
        <h3 className="font-medium text-white mb-4">Social Links</h3>
        <div className="space-y-3">
          <SocialLinkInput 
            label="Website" 
            placeholder="https://yourwebsite.com"
            icon={<Link2 className="w-4 h-4 text-zinc-500" />}
          />
          <SocialLinkInput 
            label="X (Twitter)" 
            placeholder="https://x.com/username"
            icon={
              <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            }
          />
          <SocialLinkInput 
            label="Instagram" 
            placeholder="https://instagram.com/username"
            icon={
              <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
            }
          />
          <SocialLinkInput 
            label="TikTok" 
            placeholder="https://tiktok.com/@username"
            icon={
              <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
              </svg>
            }
          />
          <SocialLinkInput 
            label="YouTube" 
            placeholder="https://youtube.com/@channel"
            icon={
              <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
            }
          />
          <SocialLinkInput 
            label="Discord" 
            placeholder="https://discord.gg/invite"
            icon={
              <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>
              </svg>
            }
          />
          <SocialLinkInput 
            label="Telegram" 
            placeholder="https://t.me/username"
            icon={
              <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
            }
          />
          <SocialLinkInput 
            label="LinkedIn" 
            placeholder="https://linkedin.com/in/username"
            icon={
              <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            }
          />
          <SocialLinkInput 
            label="GitHub" 
            placeholder="https://github.com/username"
            icon={
              <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
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
            icon={Globe}
            title="Public Profile"
            description="Make your profile visible to everyone"
            defaultChecked
          />
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
          <Select defaultValue="everyone">
            <SelectTrigger className="w-32 bg-zinc-800 border-zinc-700 text-white rounded-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-700">
              <SelectItem value="everyone">Everyone</SelectItem>
              <SelectItem value="followers">Followers</SelectItem>
              <SelectItem value="none">No one</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Account Security */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4">Account Security</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Lock className="w-5 h-5 text-zinc-500" />
              <div>
                <p className="text-white font-medium">Password</p>
                <p className="text-zinc-500 text-sm">Last updated 30 days ago</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 rounded-md">
              Change Password
            </Button>
          </div>
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
              { value: 'christmas', icon: Sparkles, label: 'Christmas' },
              { value: 'island', icon: Sparkles, label: 'Island' },
              { value: 'hacker', icon: Sparkles, label: 'Hacker' },
              { value: 'horror', icon: Sparkles, label: 'Horror' },
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
            <Select defaultValue="comfortable">
              <SelectTrigger className="w-36 bg-zinc-800 border-zinc-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                <SelectItem value="comfortable">Comfortable</SelectItem>
                <SelectItem value="compact">Compact</SelectItem>
              </SelectContent>
            </Select>
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

      <div>
        <Button className="w-full bg-white text-black hover:bg-zinc-200">
          Apply Changes
        </Button>
      </div>
    </div>
  );
}

function ContentSettings() {
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
            <Select defaultValue="public">
              <SelectTrigger className="w-28 bg-zinc-800 border-zinc-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="followers">Followers</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>
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
  defaultChecked = false 
}: { 
  icon: any; 
  title: string; 
  description: string; 
  defaultChecked?: boolean;
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
      <Switch defaultChecked={defaultChecked} />
    </div>
  );
}

function SocialLinkInput({ 
  label, 
  placeholder, 
  icon 
}: { 
  label: string; 
  placeholder: string; 
  icon: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm text-zinc-400 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        {icon}
        <Input 
          placeholder={placeholder} 
          className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
        />
      </div>
    </div>
  );
}

// Mock data for assets
const MOCK_OWNED_USERNAMES = [
  { handle: '@legend', acquiredDate: '2024-12-15', value: 5000 },
  { handle: '@crypto_king', acquiredDate: '2024-11-20', value: 12500 },
  { handle: '@pixel', acquiredDate: '2025-01-02', value: 3200 },
];

const MOCK_OFFERS_MADE = [
  { handle: '@diamond', amount: 8000, status: 'pending', date: '2025-01-05' },
  { handle: '@elite', amount: 15000, status: 'rejected', date: '2024-12-28' },
  { handle: '@vip', amount: 4500, status: 'pending', date: '2025-01-07' },
];

const MOCK_FRACTIONS = [
  { 
    id: 'image-1',
    creator: 'travel_adventures',
    image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&h=600&fit=crop',
    caption: 'Exploring the mountains 🏔️',
    fraction: 2.5, 
    totalValue: 12500 
  },
  { 
    id: 'image-3',
    creator: 'urban_explorer',
    image: 'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=600&h=600&fit=crop',
    caption: 'City lights never get old ✨',
    fraction: 0.8, 
    totalValue: 8500 
  },
  { 
    id: 'image-9',
    creator: 'sunset_lover',
    image: 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=600&h=600&fit=crop',
    caption: 'Golden hour magic 🌅',
    fraction: 5.0, 
    totalValue: 4200 
  },
];

const MOCK_WALLET_ADDRESS = '0x7a3B...F92d8E4c1Ab7';
const MOCK_WALLET_ADDRESS_FULL = '0x7a3B4c5D6e8F92d8E4c1Ab7C3d2E1f0A9B8C7D6E';

const MOCK_USERS_TO_ASSIGN = [
  { id: '1', handle: '@alice', name: 'Alice Smith', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice' },
  { id: '2', handle: '@bob', name: 'Bob Johnson', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob' },
  { id: '3', handle: '@charlie', name: 'Charlie Brown', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=charlie' },
  { id: '4', handle: '@diana', name: 'Diana Prince', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=diana' },
];

function AssetsSettings() {
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');

  const filteredUsers = MOCK_USERS_TO_ASSIGN.filter(u => 
    u.handle.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.name.toLowerCase().includes(userSearch.toLowerCase())
  );

  const handleAssign = (handle: string) => {
    setSelectedUsername(handle);
    setAssignModalOpen(true);
  };

  const handleConfirmAssign = () => {
    if (selectedUser && selectedUsername) {
      const user = MOCK_USERS_TO_ASSIGN.find(u => u.id === selectedUser);
      alert(`Assignment request sent to ${user?.handle}. They will need to approve the transfer of ${selectedUsername}.`);
      setAssignModalOpen(false);
      setSelectedUsername(null);
      setSelectedUser(null);
      setUserSearch('');
    }
  };

  const handleCopyWallet = () => {
    navigator.clipboard.writeText(MOCK_WALLET_ADDRESS_FULL);
    toast.success('Wallet address copied!');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Wallet className="w-5 h-5 text-zinc-400" />
        <h2 className="text-lg font-semibold text-white">Assets</h2>
      </div>

      {/* Wallet Address */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4 flex items-center gap-2">
          <Wallet className="w-4 h-4" />
          Wallet Address
        </h3>
        <button
          onClick={handleCopyWallet}
          className="w-full flex items-center justify-between p-4 bg-zinc-800 rounded-xl hover:bg-zinc-750 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-zinc-700 rounded-full flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <span className="text-white font-mono">{MOCK_WALLET_ADDRESS}</span>
          </div>
          <Copy className="w-5 h-5 text-zinc-500 group-hover:text-white transition-colors" />
        </button>
      </div>

      {/* Fractions */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4 flex items-center gap-2">
          <PieChart className="w-4 h-4" />
          Fractions You Own
        </h3>
        <div className="space-y-3">
          {MOCK_FRACTIONS.map((post) => (
            <div key={post.id} className="flex items-center justify-between p-4 bg-zinc-800 rounded-xl">
              <div className="flex items-center gap-3">
                <img 
                  src={post.image} 
                  alt={post.caption} 
                  className="w-12 h-12 rounded-lg bg-zinc-700 object-cover"
                />
                <div>
                  <p className="text-white font-medium text-sm line-clamp-1">{post.caption}</p>
                  <p className="text-zinc-500 text-sm">@{post.creator} · {post.fraction}% ownership</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-white font-medium">${((post.totalValue * post.fraction) / 100).toLocaleString()}</p>
                <p className="text-zinc-500 text-sm">of ${post.totalValue.toLocaleString()}</p>
              </div>
            </div>
          ))}
          {MOCK_FRACTIONS.length === 0 && (
            <div className="text-center py-8 text-zinc-500">
              You don't own any fractions yet
            </div>
          )}
        </div>
      </div>

      {/* Owned Usernames */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4 flex items-center gap-2">
          <AtSign className="w-4 h-4" />
          Usernames You Own
        </h3>
        <div className="space-y-3">
          {MOCK_OWNED_USERNAMES.map((username) => (
            <div key={username.handle} className="flex items-center justify-between p-4 bg-zinc-800 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-zinc-700 rounded-full flex items-center justify-center">
                  <AtSign className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-medium">{username.handle}</p>
                  <p className="text-zinc-500 text-sm">Acquired {username.acquiredDate}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-zinc-400 text-sm">{username.value.toLocaleString()} DHB</span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="bg-zinc-700 border-zinc-600 text-white hover:bg-zinc-600"
                  onClick={() => handleAssign(username.handle)}
                >
                  <UserPlus className="w-4 h-4 mr-1" />
                  Assign
                </Button>
              </div>
            </div>
          ))}
          {MOCK_OWNED_USERNAMES.length === 0 && (
            <div className="text-center py-8 text-zinc-500">
              You don't own any usernames yet
            </div>
          )}
        </div>
      </div>

      {/* Offers Made */}
      <div>
        <h3 className="font-medium text-zinc-400 text-sm mb-4 flex items-center gap-2">
          <Handshake className="w-4 h-4" />
          Offers You've Made
        </h3>
        <div className="space-y-3">
          {MOCK_OFFERS_MADE.map((offer, idx) => (
            <div key={idx} className="flex items-center justify-between p-4 bg-zinc-800 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-zinc-700 rounded-full flex items-center justify-center">
                  <Handshake className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-medium">{offer.handle}</p>
                  <p className="text-zinc-500 text-sm">{offer.date}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-zinc-400 text-sm">{offer.amount.toLocaleString()} DHB</span>
                <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                  offer.status === 'pending' 
                    ? 'bg-yellow-500/20 text-yellow-400' 
                    : offer.status === 'rejected' 
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-green-500/20 text-green-400'
                }`}>
                  {offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
                </span>
              </div>
            </div>
          ))}
          {MOCK_OFFERS_MADE.length === 0 && (
            <div className="text-center py-8 text-zinc-500">
              You haven't made any offers yet
            </div>
          )}
        </div>
      </div>

      {/* Assign Username Modal */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 rounded-2xl p-6 w-full max-w-md mx-4 border border-zinc-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Assign {selectedUsername}</h3>
              <button 
                onClick={() => {
                  setAssignModalOpen(false);
                  setSelectedUsername(null);
                  setSelectedUser(null);
                  setUserSearch('');
                }}
                className="text-zinc-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-zinc-400 text-sm mb-4">
              Select a user to assign this username to. They will need to approve the transfer.
            </p>

            <Input
              placeholder="Search users..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 mb-4"
            />

            <div className="max-h-64 overflow-y-auto space-y-2 mb-4">
              {filteredUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => setSelectedUser(user.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                    selectedUser === user.id 
                      ? 'bg-zinc-700 border border-zinc-600' 
                      : 'bg-zinc-800 hover:bg-zinc-750'
                  }`}
                >
                  <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full" />
                  <div className="text-left">
                    <p className="text-white font-medium">{user.name}</p>
                    <p className="text-zinc-500 text-sm">{user.handle}</p>
                  </div>
                  {selectedUser === user.id && (
                    <Check className="w-5 h-5 text-green-400 ml-auto" />
                  )}
                </button>
              ))}
              {filteredUsers.length === 0 && (
                <div className="text-center py-4 text-zinc-500 text-sm">
                  No users found
                </div>
              )}
            </div>

            <Button 
              onClick={handleConfirmAssign}
              disabled={!selectedUser}
              className="w-full bg-white text-black hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send Assignment Request
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MessagesSettings() {
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
            <Select defaultValue="everyone">
              <SelectTrigger className="w-40 bg-zinc-800 border-zinc-700 text-white rounded-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                <SelectItem value="everyone">Everyone</SelectItem>
                <SelectItem value="following">People I follow</SelectItem>
                <SelectItem value="none">No one (Closed)</SelectItem>
              </SelectContent>
            </Select>
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
          <div className="w-full bg-zinc-700 rounded-full h-2 mb-3">
            <div className="bg-white h-2 rounded-full" style={{ width: '42%' }} />
          </div>
          <div className="flex justify-between text-xs text-zinc-500">
            <span>Messages: 1.2 GB</span>
            <span>Media: 900 MB</span>
          </div>
          <p className="text-center text-xs text-zinc-600 mt-3">
            Increase your stakeholdings or sign up to premium to unlock more storage
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

      {/* Dropdown */}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
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
            className={`w-4 h-4 text-zinc-500 transition-transform ${isOpen ? '' : 'rotate-180'}`} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full bottom-full mb-2 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden">
            {/* Search */}
            <div className="p-2 border-b border-zinc-700">
              <input
                type="text"
                placeholder="Search countries..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-600 rounded-lg text-white placeholder:text-zinc-500 text-sm focus:outline-none focus:border-zinc-500"
              />
            </div>

            {/* Country List */}
            <div className="max-h-64 overflow-y-auto">
              {filteredCountries.map(country => (
                <button
                  key={country.code}
                  onClick={() => toggleCountry(country.code)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-zinc-700 transition-colors text-left"
                >
                  <span className="text-white text-sm">{country.name}</span>
                  {blockedCountries.includes(country.code) && (
                    <div className="w-5 h-5 bg-red-500 rounded flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
              {filteredCountries.length === 0 && (
                <div className="px-4 py-3 text-zinc-500 text-sm text-center">
                  No countries found
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

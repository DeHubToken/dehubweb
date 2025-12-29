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
  FileText
} from 'lucide-react';
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
        <div className="flex gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`p-3 rounded-xl transition-colors ${
                  activeTab === tab.value
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-500 hover:text-white hover:bg-zinc-800/50'
                }`}
                title={tab.label}
              >
                <Icon className="w-5 h-5" />
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
            <AvatarImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=user" />
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
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Website</label>
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-zinc-500" />
              <Input 
                placeholder="https://yourwebsite.com" 
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">X (Twitter)</label>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <Input 
                placeholder="https://x.com/username" 
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>
          </div>
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
            <SelectTrigger className="w-32 bg-zinc-800 border-zinc-700 text-white">
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
            <Button variant="outline" size="sm" className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">
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
            <Button variant="outline" size="sm" className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">
              Enable
            </Button>
          </div>
        </div>
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
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: 'light', icon: Sun, label: 'Light' },
            { value: 'dark', icon: Moon, label: 'Dark' },
            { value: 'system', icon: Monitor, label: 'System' },
          ].map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                onClick={() => setTheme(option.value)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-colors ${
                  theme === option.value
                    ? 'bg-zinc-800 border-2 border-purple-500'
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

      <div className="flex justify-end">
        <Button className="bg-white text-black hover:bg-zinc-200">
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
        <Button className="bg-gradient-to-r from-orange-500 to-pink-500 text-white hover:opacity-90">
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

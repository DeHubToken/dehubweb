import { MobileStatusBar } from '../MobileStatusBar';
import { MobileTopBar } from '../MobileTopBar';
import { MobileBottomBar } from '../MobileBottomBar';
import { MockAvatar } from '../MockAvatar';
import { ChevronRight, User, Bell, Shield, Globe, Moon, Palette, HelpCircle, LogOut, Smartphone } from 'lucide-react';

const SETTINGS_SECTIONS = [
  {
    title: 'Account',
    items: [
      { icon: User, label: 'Edit Profile', desc: 'Name, bio, avatar' },
      { icon: Bell, label: 'Notifications', desc: 'Push & email preferences' },
      { icon: Shield, label: 'Privacy', desc: 'Post visibility, followers' },
    ],
  },
  {
    title: 'Preferences',
    items: [
      { icon: Globe, label: 'Language', desc: 'English' },
      { icon: Moon, label: 'Dark Mode', desc: 'Always on', toggle: true },
      { icon: Palette, label: 'Appearance', desc: 'Theme & colors' },
      { icon: Smartphone, label: 'Display', desc: 'Font size, layout' },
    ],
  },
  {
    title: 'Support',
    items: [
      { icon: HelpCircle, label: 'Help Center', desc: 'FAQs & guides' },
    ],
  },
];

export function SettingsScreen() {
  return (
    <div className="min-h-full bg-black flex flex-col">
      <MobileStatusBar />
      <MobileTopBar title="Settings" showAvatar={false} />

      {/* Profile card */}
      <div className="mx-4 my-3 p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] flex items-center gap-3">
        <MockAvatar name="alice" size="lg" />
        <div className="flex-1">
          <span className="text-white text-sm font-semibold block">Alice Johnson</span>
          <span className="text-zinc-500 text-xs">@alice.eth</span>
        </div>
        <ChevronRight className="w-4 h-4 text-zinc-600" />
      </div>

      {/* Settings sections */}
      <div className="flex-1 space-y-6 px-4">
        {SETTINGS_SECTIONS.map((section) => (
          <div key={section.title}>
            <h3 className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2 px-1">
              {section.title}
            </h3>
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] divide-y divide-white/[0.04]">
              {section.items.map((item) => (
                <div key={item.label} className="flex items-center gap-3 px-3 py-3">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center">
                    <item.icon className="w-4 h-4 text-zinc-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-white text-sm block">{item.label}</span>
                    <span className="text-zinc-600 text-[11px]">{item.desc}</span>
                  </div>
                  {item.toggle ? (
                    <div className="w-10 h-6 rounded-full bg-white/20 border border-white/20 relative">
                      <div className="absolute right-0.5 top-0.5 w-5 h-5 rounded-full bg-white" />
                    </div>
                  ) : (
                    <ChevronRight className="w-4 h-4 text-zinc-600" />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Logout */}
        <button className="w-full flex items-center justify-center gap-2 h-11 rounded-xl border border-white/10 text-zinc-400 text-sm mb-4">
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>

      <MobileBottomBar />
    </div>
  );
}

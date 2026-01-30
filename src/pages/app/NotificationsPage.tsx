import { useState } from 'react';
import { Settings, Heart, MessageCircle, DollarSign, Users, Share, Bell } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGate } from '@/components/app/AuthGate';

const tabs = [
  { label: 'All', value: 'all', icon: Bell },
  { label: 'Likes', value: 'likes', icon: Heart },
  { label: 'Comments', value: 'comments', icon: MessageCircle },
  { label: 'Shares', value: 'shares', icon: Share },
  { label: 'Tips', value: 'tips', icon: DollarSign },
  { label: 'Subs', value: 'subs', icon: Users },
];

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState('all');
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return (
      <AuthGate description="Log in to view your notifications and stay updated." />
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-11 lg:top-0 bg-black z-10 p-3 sm:p-4">
        <div className="bg-zinc-900 rounded-2xl px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="font-bold text-white text-lg">Notifications</h1>
            <button className="p-2 rounded-xl hover:bg-zinc-800 transition-colors">
              <Settings className="w-5 h-5 text-zinc-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-3 sm:px-4 py-2">
        <div className="bg-zinc-900 rounded-2xl p-2">
          <div className="flex justify-evenly">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`flex-1 flex items-center justify-center gap-2 px-2 sm:px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.value
                    ? 'bg-white text-black'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Empty State */}
      <div className="px-3 sm:px-4 py-2">
        <div className="bg-zinc-900 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
          <Bell className="w-12 h-12 text-zinc-600 mb-4" />
          <h3 className="text-white font-semibold text-lg mb-2">No notifications yet</h3>
          <p className="text-zinc-500 text-sm max-w-xs">
            When you get likes, comments, tips, or new subscribers, they'll show up here.
          </p>
        </div>
      </div>
    </div>
  );
}

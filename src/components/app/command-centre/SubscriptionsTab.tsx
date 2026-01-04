import { useState } from 'react';
import { TrendingDown, Info, Settings2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import dehubCoin from '@/assets/dehub-coin.png';

const topSubscriptions = [
  { date: '12 Aug', username: 'Username', tier: 'Tier name', duration: '6m', amount: '450 DH' },
  { date: '04 Dec', username: 'Username', tier: 'Tier name', duration: '1m', amount: '150 DH' },
  { date: '21 Jan', username: 'Username', tier: 'Tier name', duration: '1m', amount: '120 DH' },
];

const transactionHistory = [
  { date: '21 Feb', description: 'Subscribed to Username - Tiername', amount: '100', status: 'Paid' },
  { date: '18 Feb', description: 'Paused subscription for Username - Tiername', amount: '-', status: 'Paused' },
  { date: '16 Feb', description: 'Cancelled subscription for Username - Tiername', amount: '-', status: 'Cancelled' },
  { date: '10 Feb', description: 'Subscribed to Username - Tiername', amount: '60', status: 'Paid' },
  { date: '3 Jan', description: 'Subscribed to Username - Tiername', amount: '100', status: 'Paid' },
  { date: '2 Jan', description: 'Subscribed to Username - Tiername', amount: '100', status: 'Paid' },
];

const subscriptionList = [
  { id: '01', creator: 'Username', tier: 'Tier name', description: 'Tier Description. Description about the tire goes here.', amount: 'Amount', dateFrom: '12 Mar 25', dateTo: '12 Apr 25', status: 'Active' },
  { id: '01', creator: 'Username', tier: 'Tier name', description: 'Tier Description. Description about the tire goes here.', amount: 'Amount', dateFrom: '12 Mar 25', dateTo: '12 Apr 25', status: 'Active' },
  { id: '01', creator: 'Username', tier: 'Tier name', description: 'Tier Description. Description about the tire goes here.', amount: 'Amount', dateFrom: '12 Mar 25', dateTo: '12 Apr 25', status: 'Active' },
  { id: '01', creator: 'Username', tier: 'Tier name', description: 'Tier Description. Description about the tire goes here.', amount: 'Amount', dateFrom: '12 Mar 25', dateTo: '12 Apr 25', status: 'Active' },
];

export function SubscriptionsTab() {
  const [activeSubTab, setActiveSubTab] = useState<'subscribers' | 'subscriptions'>('subscriptions');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Your subscriptions</h2>
        <div className="flex gap-2 bg-zinc-900 rounded-full p-1 border border-zinc-800">
          <button 
            onClick={() => setActiveSubTab('subscribers')}
            className={`px-4 py-1.5 text-sm rounded-full transition-colors ${
              activeSubTab === 'subscribers' ? 'bg-zinc-800 text-white' : 'text-zinc-400'
            }`}
          >
            Your subscribers
          </button>
          <button 
            onClick={() => setActiveSubTab('subscriptions')}
            className={`px-4 py-1.5 text-sm rounded-full transition-colors ${
              activeSubTab === 'subscriptions' ? 'bg-zinc-800 text-white' : 'text-zinc-400'
            }`}
          >
            Your subscriptions
          </button>
        </div>
      </div>

      {/* Top Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Expenditures Card */}
        <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-zinc-400 text-sm">Projected monthly expenditures</span>
            <span className="bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
              <TrendingDown className="w-3 h-3" />
              Decreased by 30%
            </span>
            <Info className="w-4 h-4 text-zinc-500" />
            <Settings2 className="w-4 h-4 text-zinc-500" />
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-3xl font-bold text-white">7670</span>
            <img src={dehubCoin} alt="DeHub" className="w-5 h-5" />
          </div>
          <p className="text-zinc-500 text-sm mb-6">You are subscribed to <span className="text-white">16 users</span></p>

          {/* Top Subscriptions */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-zinc-400 text-sm">Top subscriptions</span>
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 text-xs">01 of 02</span>
                <button className="p-1 rounded-full border border-zinc-700 text-zinc-400 hover:text-white">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button className="p-1 rounded-full border border-zinc-700 bg-white text-black">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-zinc-500 text-xs">
                    <th className="text-left font-normal pb-2">Date</th>
                    <th className="text-left font-normal pb-2">Username</th>
                    <th className="text-left font-normal pb-2">Tier</th>
                    <th className="text-left font-normal pb-2">Duration</th>
                    <th className="text-left font-normal pb-2">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {topSubscriptions.map((sub, index) => (
                    <tr key={index} className="text-zinc-400">
                      <td className="py-2">{sub.date}</td>
                      <td className="py-2 text-emerald-400">{sub.username}</td>
                      <td className="py-2">{sub.tier}</td>
                      <td className="py-2">{sub.duration}</td>
                      <td className="py-2 text-white">{sub.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Transaction History Card */}
        <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-zinc-400 text-sm">Transactions</span>
              <p className="text-zinc-500 text-xs">(last 30 days)</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-500 text-xs">01 of 03</span>
              <button className="p-1 rounded-full border border-zinc-700 text-zinc-400 hover:text-white">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button className="p-1 rounded-full border border-zinc-700 bg-white text-black">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 text-xs border-b border-zinc-800">
                <th className="text-left font-normal pb-2">Date</th>
                <th className="text-left font-normal pb-2">Description</th>
                <th className="text-left font-normal pb-2">Amount</th>
                <th className="text-left font-normal pb-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {transactionHistory.map((tx, index) => (
                <tr key={index} className="text-zinc-400">
                  <td className="py-2">{tx.date}</td>
                  <td className="py-2">{tx.description}</td>
                  <td className="py-2">
                    {tx.amount !== '-' && (
                      <span className="flex items-center gap-1">
                        {tx.amount} <img src={dehubCoin} alt="DeHub" className="w-3 h-3" />
                      </span>
                    )}
                    {tx.amount === '-' && '-'}
                  </td>
                  <td className="py-2">
                    <span className={`${
                      tx.status === 'Paid' ? 'text-emerald-400' : 
                      tx.status === 'Paused' ? 'text-yellow-400' : 'text-zinc-500'
                    }`}>
                      {tx.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Subscription List */}
      <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
        <div className="flex items-center justify-between mb-4">
          <span className="text-white font-semibold">Subscription list</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-400 text-xs h-8 rounded-full bg-transparent">
              Sort ▼
            </Button>
            <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-400 text-xs h-8 rounded-full bg-transparent">
              Export CSV
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 text-xs border-b border-zinc-800">
                <th className="text-left font-normal pb-3">#</th>
                <th className="text-left font-normal pb-3">Creators</th>
                <th className="text-left font-normal pb-3">Tier</th>
                <th className="text-left font-normal pb-3">Amount</th>
                <th className="text-left font-normal pb-3">Date</th>
                <th className="text-left font-normal pb-3">Status</th>
                <th className="text-left font-normal pb-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {subscriptionList.map((sub, index) => (
                <tr key={index} className="text-zinc-400">
                  <td className="py-4">{sub.id}</td>
                  <td className="py-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10">
                        <AvatarImage src="" />
                        <AvatarFallback className="bg-zinc-700 text-white text-xs">U</AvatarFallback>
                      </Avatar>
                      <span className="text-white">{sub.creator}</span>
                    </div>
                  </td>
                  <td className="py-4">
                    <div>
                      <p className="text-white">{sub.tier}</p>
                      <p className="text-zinc-500 text-xs">{sub.description}</p>
                    </div>
                  </td>
                  <td className="py-4 text-white">{sub.amount}</td>
                  <td className="py-4">
                    <p>{sub.dateFrom}</p>
                    <p className="text-zinc-500">to</p>
                    <p>{sub.dateTo}</p>
                  </td>
                  <td className="py-4 text-emerald-400">{sub.status}</td>
                  <td className="py-4">
                    <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-400 text-xs h-7 rounded-full bg-transparent">
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

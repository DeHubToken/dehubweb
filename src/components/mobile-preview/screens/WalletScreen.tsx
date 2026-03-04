import { MobileStatusBar } from '../MobileStatusBar';
import { MockAvatar } from '../MockAvatar';
import { ChevronLeft, Send, ArrowUpRight, ArrowDownLeft, Copy, QrCode, MoreHorizontal } from 'lucide-react';

const MOCK_TRANSACTIONS = [
  { id: '1', type: 'received', user: 'bob_dev', amount: '+50 DHB', time: '2h ago' },
  { id: '2', type: 'sent', user: 'crypto_sarah', amount: '-25 DHB', time: '5h ago' },
  { id: '3', type: 'received', user: 'defi_whale', amount: '+100 DHB', time: '1d ago' },
  { id: '4', type: 'staking', user: 'Staking Reward', amount: '+12.4 DHB', time: '1d ago' },
  { id: '5', type: 'sent', user: 'nft_artist', amount: '-200 DHB', time: '3d ago' },
];

export function WalletScreen() {
  return (
    <div className="min-h-full bg-black flex flex-col">
      <MobileStatusBar />

      <div className="flex items-center gap-3 px-4 pt-1 pb-3">
        <ChevronLeft className="w-5 h-5 text-white" />
        <h1 className="text-white text-lg font-bold">Wallet</h1>
      </div>

      {/* Balance card */}
      <div className="mx-4 mb-4 p-5 rounded-2xl border border-white/[0.1] bg-white/[0.03] backdrop-blur-xl">
        <p className="text-zinc-500 text-xs mb-1">Total Balance</p>
        <h2 className="text-white text-3xl font-bold">4,250.00 <span className="text-lg text-zinc-400">DHB</span></h2>
        <p className="text-zinc-500 text-sm mt-0.5">≈ $1,275.00 USD</p>

        {/* Action buttons */}
        <div className="flex gap-3 mt-5">
          {[
            { icon: Send, label: 'Send' },
            { icon: ArrowDownLeft, label: 'Receive' },
            { icon: Copy, label: 'Copy' },
            { icon: QrCode, label: 'QR' },
          ].map((action) => (
            <button key={action.label} className="flex-1 flex flex-col items-center gap-1.5">
              <div className="w-10 h-10 rounded-xl bg-white/[0.08] border border-white/[0.12] flex items-center justify-center">
                <action.icon className="w-4 h-4 text-white" />
              </div>
              <span className="text-[10px] text-zinc-400">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tokens */}
      <div className="px-4 mb-4">
        <h3 className="text-white text-sm font-semibold mb-3">Tokens</h3>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] divide-y divide-white/[0.04]">
          {[
            { name: 'DHB', balance: '4,250.00', value: '$1,275.00' },
            { name: 'ETH', balance: '0.52', value: '$1,820.00' },
            { name: 'USDC', balance: '350.00', value: '$350.00' },
          ].map((token) => (
            <div key={token.name} className="flex items-center gap-3 px-3 py-3">
              <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-white text-xs font-bold">
                {token.name.charAt(0)}
              </div>
              <div className="flex-1">
                <span className="text-white text-sm font-medium block">{token.name}</span>
                <span className="text-zinc-600 text-xs">{token.value}</span>
              </div>
              <span className="text-white text-sm">{token.balance}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="px-4 flex-1">
        <h3 className="text-white text-sm font-semibold mb-3">Recent Activity</h3>
        <div className="space-y-2">
          {MOCK_TRANSACTIONS.map((tx) => (
            <div key={tx.id} className="flex items-center gap-3 py-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                tx.type === 'received' || tx.type === 'staking' ? 'bg-white/[0.08]' : 'bg-white/[0.04]'
              }`}>
                {tx.type === 'sent' ? (
                  <ArrowUpRight className="w-4 h-4 text-zinc-400" />
                ) : (
                  <ArrowDownLeft className="w-4 h-4 text-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-white text-sm block truncate">{tx.user}</span>
                <span className="text-zinc-600 text-[11px]">{tx.time}</span>
              </div>
              <span className={`text-sm font-medium ${
                tx.amount.startsWith('+') ? 'text-white' : 'text-zinc-400'
              }`}>
                {tx.amount}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

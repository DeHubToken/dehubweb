import { Button } from '@/components/ui/button';

const transactions = [
  { description: 'You deposited 508 DeHub to your wallet.', date: '22 Feb' },
  { description: 'Username tipped you 6 DeHub on your video.', date: '21 Feb', highlight: ['Username', 'video'] },
  { description: 'You tipped username 20 DeHub.', date: '21 Feb', highlight: ['username'] },
  { description: 'You subscribed to username for 105 DeHub.', date: '17 Feb', highlight: ['username'] },
  { description: 'Username tipped you 78 DeHub on your post.', date: '12 Feb', highlight: ['Username', 'post'] },
  { description: 'You tipped username 20 DeHub.', date: '12 Feb', highlight: ['username'] },
  { description: 'You deposited 1800 DeHub to your wallet.', date: '9 Feb' },
  { description: 'Your subscription revenue 140,277.47 DeHub was deposited to your wallet.', date: '1 Feb' },
];

function formatDescription(desc: string, highlights?: string[]) {
  if (!highlights) return <span className="text-zinc-400">{desc}</span>;
  
  let result = desc;
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  
  highlights.forEach((word, i) => {
    const index = result.toLowerCase().indexOf(word.toLowerCase(), lastIndex);
    if (index !== -1) {
      if (index > lastIndex) {
        parts.push(result.substring(lastIndex, index));
      }
      parts.push(
        <span key={i} className="text-white font-medium">{result.substring(index, index + word.length)}</span>
      );
      lastIndex = index + word.length;
    }
  });
  
  if (lastIndex < result.length) {
    parts.push(result.substring(lastIndex));
  }
  
  return <span className="text-zinc-400">{parts}</span>;
}

export function RecentTransactions() {
  return (
    <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold">Recent transactions</h3>
        <Button variant="glass" size="sm" className="text-xs h-8 rounded-xl">
          View all
        </Button>
      </div>

      <div className="space-y-0 divide-y divide-zinc-800">
        {transactions.map((tx, index) => (
          <div key={index} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
            <p className="text-sm">{formatDescription(tx.description, tx.highlight)}</p>
            <span className="text-zinc-500 text-sm whitespace-nowrap ml-4">{tx.date}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

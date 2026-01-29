

# Fix: Bounty Amount Label - It's Per-User Reward, Not Total Pool

## The Issue
The bounty drawer currently displays:
> "Total Reward Pool: 7,500 DHB"

But this is wrong! The API field `addBountyAmount` is the **reward each qualifying user receives**, not the total pool.

## The Fix
Change the label from "Total Reward Pool" to "Reward per User" or similar.

---

## Implementation

### File: `src/components/app/cards/VideoCard.tsx`

**Line 515** - Change:
```tsx
<span className="text-zinc-300 text-sm">Total Reward Pool</span>
```

To:
```tsx
<span className="text-zinc-300 text-sm">Reward per User</span>
```

---

## Result
The bounty drawer will correctly display:
- "First 15 views get rewarded"
- "First 15 comments get rewarded"
- **"Reward per User: 7,500 DHB"** ← Fixed!

Each qualifying viewer/commenter receives 7,500 DHB individually.


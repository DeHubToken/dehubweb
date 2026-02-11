

## Fix: Profile Picture Goes See-Through on Hover

### Problem
In `src/components/app/cards/CardHeader.tsx` (line 108), the clickable profile area has `hover:opacity-80`, which reduces the opacity of the entire container -- including the avatar image -- to 80% on hover, making it appear see-through.

### Solution
Remove `hover:opacity-80 transition-opacity` from the profile button wrapper. This will keep the avatar fully opaque on hover while still showing the pointer cursor for clickable profiles.

### File Changed
- **src/components/app/cards/CardHeader.tsx** (line 108): Remove `hover:opacity-80 transition-opacity` from the className.



# Plan: Change Message to Edit Profile on Own Profile

## Summary
When viewing your own profile, the "Message" button should display "Edit Profile" instead, since you can't message yourself but you can edit your profile.

## What I Found

The profile page at `src/pages/app/ProfilePage.tsx` has:
- A "Message" button at lines 598-605 that currently shows for all profiles
- An existing `isViewingOwnProfile` variable (line 70) that correctly detects when viewing your own profile
- The button currently renders unconditionally

## Changes Required

### File: `src/pages/app/ProfilePage.tsx`

**1. Add Pencil icon import**
Add `Pencil` to the existing lucide-react import on line 4-6.

**2. Update the Message/Edit Profile button logic**
Replace the static "Message" button with a conditional that shows:
- **"Edit Profile"** with Pencil icon when `isViewingOwnProfile` is true
- **"Message"** with MessageCircle icon when viewing someone else's profile

The button will navigate to `/app/settings` when on your own profile (where profile editing options are located).

### Code Change

```tsx
// Before (always shows Message)
<Button variant="outline" size="sm" className="...">
  <MessageCircle className="w-4 h-4" />
  Message
</Button>

// After (conditional based on profile ownership)
{isViewingOwnProfile ? (
  <Button 
    variant="outline" 
    size="sm" 
    className="rounded-full border-zinc-700 text-white hover:bg-zinc-800 bg-transparent gap-2"
    onClick={() => navigate('/app/settings')}
  >
    <Pencil className="w-4 h-4" />
    Edit Profile
  </Button>
) : (
  <Button
    variant="outline" 
    size="sm" 
    className="rounded-full border-zinc-700 text-white hover:bg-zinc-800 bg-transparent gap-2"
  >
    <MessageCircle className="w-4 h-4" />
    Message
  </Button>
)}
```

## Summary of Changes

| File | Change |
|------|--------|
| `src/pages/app/ProfilePage.tsx` | Add `Pencil` import, update button to conditionally show "Edit Profile" or "Message" |


# Remove Unnecessary Scroll Behavior on Reply Input Focus

## Summary
Remove the `scrollIntoView` logic from the reply textarea's `onFocus` handler. Mobile browsers automatically handle viewport adjustment when the virtual keyboard opens, so this code is redundant and can cause a jarring double-scroll effect.

## Changes

### File: `src/components/app/cards/CommentsSection.tsx`

**Remove the `onFocus` handler** from the textarea (lines 837-841):

```tsx
// BEFORE:
<textarea
  ...
  onFocus={(e) => {
    setTimeout(() => {
      e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }}
/>

// AFTER:
<textarea
  ...
  // onFocus removed - native keyboard behavior handles this
/>
```

## Technical Details
- The `scrollIntoView({ behavior: 'smooth', block: 'center' })` call is meant to ensure the input is visible when focused
- However, mobile browsers (iOS Safari, Chrome on Android) automatically scroll to keep focused inputs visible when the virtual keyboard appears
- This native behavior is more reliable and consistent than custom JavaScript scrolling
- Removing this prevents potential double-scrolling or layout shifts

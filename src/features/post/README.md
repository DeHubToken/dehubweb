# Post Feature

The post feature handles all aspects of content creation, including text posts, media uploads, scheduling, and monetization options.

## Directory Structure

```
src/features/post/
├── components/           # UI components for post creation
│   ├── AudioTrimmer.tsx      # Audio trimming controls
│   ├── CropRotateEditor.tsx  # Image crop/rotate editor
│   ├── DraftsSheet.tsx       # Draft management drawer
│   ├── FilterEditor.tsx      # Image filter controls
│   ├── FilterPresetCard.tsx  # Filter preset thumbnail
│   ├── FilterSlider.tsx      # Individual filter slider
│   ├── LinkPreviewCard.tsx   # URL preview card
│   ├── LinkPreviews.tsx      # Link previews container
│   ├── PostAccessToggles.tsx # Monetization toggles
│   ├── PostActionBar.tsx     # Bottom action buttons
│   ├── PostContentArea.tsx   # Main content editor
│   ├── PostMediaPreview.tsx  # Media preview grid
│   ├── ScheduleSheet.tsx     # Schedule picker drawer
│   └── VideoTrimmer.tsx      # Video trimming controls
├── hooks/
│   └── usePostForm.ts        # Form state management hook
├── types/
│   └── filters.ts            # Filter-related types
├── PostModal.tsx             # Main modal component
├── types.ts                  # Feature type definitions
└── index.ts                  # Barrel exports
```

## Usage

```tsx
import { PostModal } from '@/features/post';

function App() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <PostModal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
    />
  );
}
```

## Key Components

### PostModal
The main entry point. Renders a drawer with the post creation interface.

### usePostForm Hook
Manages all form state including:
- Text content
- Media files (images, videos, audio)
- Monetization settings (PPV, Watch2Earn, Token Gating)
- Scheduling
- Drafts (persisted to localStorage)

### Monetization Options
- **Subscribers Only**: Restrict to subscribers
- **PPV (Pay-Per-View)**: Set a price in USD or DHB
- **Watch2Earn**: Reward viewers with tokens
- **Token Gated**: Require token holdings to view

## State Flow

```
User Input → usePostForm → Component State → UI Update
                ↓
         localStorage (drafts)
```

## Dependencies
- `@/components/ui/drawer` - Modal container
- `@/components/ui/slider` - Filter/trim controls
- `sonner` - Toast notifications
- `framer-motion` - Animations

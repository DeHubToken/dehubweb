
# Plan: Synchronize Image Page Comments with Video/Home Page Comments

## Problem Analysis

The `CommentsSheet` (used for image posts) looks "ugly" compared to `CommentsSection` (used for video/home feed) because:

1. **Different CommentItem components** - The sheet uses a simplified CommentItem with only a Reply button, while the video section has Like, Dislike, Reply, Share dropdown, and Bookmark buttons
2. **Missing voice note functionality** - The sheet lacks voice recording capability
3. **Different fade gradient colors** - Sheet uses `from-black/60` vs `from-zinc-900`
4. **Different container structure** - Sheet is a modal drawer vs inline expandable section

## Solution

Replace the `CommentsSheet` drawer-based implementation with the exact same UI patterns from `CommentsSection`, adapting only what's necessary for the modal context.

---

## Implementation Steps

### Step 1: Update CommentItem in CommentsSheet

Migrate the full-featured `CommentItem` from `CommentsSection` into `CommentsSheet`:

- Add Like/Dislike buttons with ThumbsUp/ThumbsDown icons
- Add Share dropdown with Repost and Copy Text options
- Add Bookmark toggle button
- Add TranslatableText support for comment text
- Add VoiceNotePlayer support

### Step 2: Add Voice Note Recording

Port the voice recording functionality from `CommentsSection`:

- Add recording state management (isRecording, recordingTime, voiceNote)
- Add MediaRecorder refs and logic
- Add AudioVisualizer for voice note preview
- Add recording indicator UI in input area
- Add mic button and stop recording controls

### Step 3: Fix Fade Gradient Colors

Update the gradients to match:

- Change `from-black/60` to `from-zinc-900` for both top and bottom fades
- This ensures visual consistency with the home/video page

### Step 4: Standardize Comment List Styling

Match the divide styling and spacing:

- Add `divide-y divide-zinc-800` to comment list container
- Match `pt-2 pb-2` padding on scroll container

---

## Technical Details

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/app/comments/CommentsSheet.tsx` | Full rewrite of CommentItem section, add voice recording, fix gradients |

### New Imports Needed

```typescript
import { ThumbsUp, ThumbsDown, Share2, Bookmark, Repeat2, Link, Mic, Square, Play, Pause, Trash2 } from 'lucide-react';
import { TranslatableText } from '../TranslatableText';
import { AudioVisualizer } from '../audio';
```

### State Variables to Add

```typescript
// Voice note recording state
const [isRecording, setIsRecording] = useState(false);
const [recordingTime, setRecordingTime] = useState(0);
const [voiceNote, setVoiceNote] = useState<VoiceNote | null>(null);
const mediaRecorderRef = useRef<MediaRecorder | null>(null);
const chunksRef = useRef<Blob[]>([]);
const timerRef = useRef<NodeJS.Timeout | null>(null);
const recordingTimeRef = useRef(0);
const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
const [isPlayingPreview, setIsPlayingPreview] = useState(false);
const MAX_VOICE_DURATION = 30;
```

### VoiceNote Type to Add

```typescript
interface VoiceNote {
  url: string;
  duration: number;
}
```

---

## Summary

After these changes, the image page comments will have:
- Like/Dislike buttons on each comment
- Share dropdown with Repost and Copy Text
- Bookmark button
- Voice note recording capability
- Voice note playback with visualizer
- Matching fade gradients (zinc-900)
- Consistent visual styling with video/home pages


# Direct Messages Implementation Plan

## Overview
This plan implements real Direct Messages functionality using the DeHub API to replace the current mock data in `MessagesPage.tsx`. The implementation will support fetching conversations, viewing message threads, sending messages (text, images, GIFs), and real-time updates.

## Current State Analysis
- `MessagesPage.tsx` uses hardcoded mock conversations
- `PublicChat.tsx` has a working chat UI with mock messages
- Existing `ChatInput.tsx` supports text, images, GIFs, and AI enhancement
- `DeHubUser` interface already includes `dmSettings` for DM preferences
- No messaging API functions exist in `src/lib/api/dehub.ts`

## Implementation Approach

### Phase 1: Add DeHub Messaging API Functions

Create new API endpoints in `src/lib/api/dehub.ts`:

**Conversations Endpoints:**
- `getConversations()` - Fetch list of user's conversations
- `getConversation(conversationId)` - Get single conversation details
- `createConversation(recipientAddress)` - Start new DM thread
- `deleteConversation(conversationId)` - Remove a conversation

**Messages Endpoints:**
- `getMessages(conversationId, page, limit)` - Fetch messages in a thread
- `sendMessage(conversationId, content, type, mediaUrl?)` - Send a message
- `markAsRead(conversationId)` - Mark conversation as read

**New TypeScript Interfaces:**
```text
DeHubConversation {
  id: string
  participants: DeHubUser[]
  lastMessage?: DeHubMessage
  unreadCount: number
  createdAt: string
  updatedAt: string
}

DeHubMessage {
  id: string
  conversationId: string
  sender: DeHubUser
  content: string
  type: 'text' | 'image' | 'gif'
  mediaUrl?: string
  createdAt: string
  readAt?: string
}
```

### Phase 2: Create Messages Hook

New file: `src/hooks/use-messages.ts`

**Features:**
- `useConversations()` - Fetch and cache conversation list
- `useMessages(conversationId)` - Fetch messages for a thread with pagination
- `useSendMessage()` - Mutation for sending messages
- `useMarkAsRead()` - Mutation to mark messages read
- Client-side search filtering
- Optimistic updates for sent messages

### Phase 3: Build DM Chat Component

New file: `src/components/app/chat/DirectMessageChat.tsx`

**Features:**
- Full-screen chat view (similar to PublicChat)
- Header with recipient info and back button
- Message list with infinite scroll (load older messages)
- Reuse existing `ChatInput` component
- Message bubbles differentiated by sender (left/right alignment)
- Timestamp grouping (Today, Yesterday, dates)
- Read receipts indicator
- Online status indicator

### Phase 4: Update MessagesPage

Modify `src/pages/app/MessagesPage.tsx`:

**Conversation List:**
- Replace mock data with `useConversations()` hook
- Real-time unread counts
- Search conversations by name/username
- New conversation button (opens user search modal)
- Pull-to-refresh support

**Conversation View States:**
- No conversations → Empty state with CTA
- Loading → Skeleton loaders
- Error → Error state with retry

**Navigation:**
- Click conversation → Open `DirectMessageChat`
- Back button → Return to list

### Phase 5: New Conversation Flow

New file: `src/components/app/chat/NewConversationModal.tsx`

**Features:**
- User search input (reuse `useDeHubUserSearch`)
- Display search results with avatars
- Check DM settings before allowing
- Create conversation on user selection

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/lib/api/dehub.ts` | Modify | Add messaging API functions and interfaces |
| `src/hooks/use-messages.ts` | Create | React Query hooks for messaging |
| `src/hooks/index.ts` | Modify | Export new messaging hooks |
| `src/components/app/chat/DirectMessageChat.tsx` | Create | DM chat view component |
| `src/components/app/chat/NewConversationModal.tsx` | Create | Start new conversation modal |
| `src/components/app/chat/index.ts` | Modify | Export new components |
| `src/pages/app/MessagesPage.tsx` | Modify | Replace mock data with real API |

## Technical Details

### API Endpoint Patterns
Based on existing DeHub API patterns, messaging endpoints likely follow:
- `GET /api/conversations` - List conversations
- `GET /api/conversations/{id}/messages` - Get messages
- `POST /api/conversations/{id}/messages` - Send message
- `POST /api/conversations` - Create conversation
- `PUT /api/conversations/{id}/read` - Mark as read

### Data Flow
```text
User opens Messages
    ↓
useConversations() fetches /api/conversations
    ↓
Display conversation list with last message preview
    ↓
User selects conversation
    ↓
useMessages(id) fetches /api/conversations/{id}/messages
    ↓
Display messages in DirectMessageChat
    ↓
User sends message → useSendMessage() → optimistic update → API call
```

### Error Handling
- Network errors: Show retry button
- DM disabled: Show appropriate message based on `dmSettings`
- Rate limiting: Queue messages with retry logic

### Caching Strategy
- Conversations list: 30 second stale time
- Individual messages: 1 minute stale time
- Invalidate on send/receive

## UI/UX Considerations

**Mobile Experience:**
- Full-screen chat view
- Bottom-aligned input (same as PublicChat)
- Swipe back gesture support

**Desktop Experience:**
- Split panel possible (list + chat side by side)
- Keyboard shortcuts (Enter to send)

**Accessibility:**
- Proper ARIA labels
- Focus management when navigating
- Screen reader announcements for new messages

## Dependencies
No new dependencies required. Uses existing:
- React Query for data fetching
- Existing UI components (Avatar, Input, Button)
- Existing chat components (ChatInput, ChatMessage pattern)

## Testing Considerations
- Test with no conversations (empty state)
- Test pagination (many messages)
- Test with images and GIFs
- Test DM settings restrictions
- Test offline/error states

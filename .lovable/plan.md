
# Add Search to Public Chat

## Overview
Add a search bar to the Public Chat header that lets users filter through messages in real time by matching against message content and usernames.

## How It Works
- A search icon button appears in the Public Chat header
- Tapping it expands a search input field inline
- As you type, messages are filtered client-side to only show those matching your query (content or username)
- A count badge shows how many results matched
- Pressing the X or clearing the input exits search mode and restores the full chat

## Technical Details

### 1. Update `PublicChat.tsx`
- Add a `searchQuery` state and a `isSearchOpen` toggle
- Add a `Search` icon button in the header (next to existing moderator buttons)
- When search is open, render an input field in the header area with auto-focus
- Filter the `messages` array using a case-insensitive match on `content` and `userName` before rendering
- Show a small result count indicator (e.g., "3 results") when filtering is active

### 2. i18n Support
- Add search-related keys to `en.json` and `es.json` (and other locales):
  - `"searchMessages"`: "Search messages" / "Buscar mensajes"
  - `"searchPlaceholder"`: "Search..." / "Buscar..."
  - `"resultsCount"`: "{{count}} results" / "{{count}} resultados"
  - `"noResults"`: "No messages found" / "No se encontraron mensajes"

### 3. UX Details
- The search bar slides in below the header when activated, keeping the header buttons visible
- An `X` button closes search and clears the filter
- Empty state shows a "No messages found" message when the filter yields zero results
- Search is available to all users (not just moderators)

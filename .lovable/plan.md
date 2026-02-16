
# Wire Translation Keys Into All Settings Sub-Components

## Problem
Translation keys exist in all 23 locale JSON files, but every settings sub-component uses hardcoded English strings instead of `t()` calls. The `useTranslation()` hook is only used in the parent `SettingsPage` -- none of the child components (`AppearanceSettings`, `NotificationSettings`, `PrivacySettings`, `ContentSettings`, `MessagesSettings`, `AssetsSettings`, `ProfileSettings`) call it.

## Solution
Add `const { t } = useTranslation();` to each sub-component and replace every hardcoded string with the corresponding `t('settings.xxx')` call.

## File Changed
**`src/pages/app/SettingsPage.tsx`** -- single file, ~200+ string replacements across 7 sub-components.

### Component-by-component changes:

**1. ProfileSettings** (lines 173-568)
- Add `useTranslation()` hook
- Replace: "Profile Settings", "Save Changes", "Profile Picture", "Click the camera icon to upload", "Display Name", "Enter your display name", "Username", "username", "3-30 characters...", "Bio", "Tell us about yourself...", "Social Links"
- Replace toast messages: "Profile updated successfully", "Failed to load profile data", "Image must be less than 5MB/10MB", "Failed to update profile"

**2. NotificationSettings** (lines 571-639)
- Add `useTranslation()` hook
- Replace: "Notification Settings", "General", "Email Notifications", "Receive notifications via email", "Push Notifications", "Receive push notifications in browser", "Activity", "Likes", "Comments", "New Followers", "Direct Messages", "Quiet Hours", "Enable Quiet Hours" and all descriptions

**3. PrivacySettings** (lines 642-879)
- Add `useTranslation()` hook
- Replace: "Privacy & Security", "Profile Visibility", "Private Account", "Public Profile", "Follow Visibility", "Show Activity Status", "Search Engine Indexing", "Post Visibility", "Default Post Visibility", "Messaging", "Who can message you", "Account Security", "Two-Factor Authentication", "Enable", "Your Data", "Extract Data", "Download", "Geo-Blocking", all descriptions, all drawer option labels/descriptions, toast messages, and the note text

**4. AppearanceSettings** (lines 882-1030)
- Add `useTranslation()` hook
- Replace: "Appearance", "Theme", "Language", "Choose your preferred language", "Layout", "Feed Layout", "Choose how posts are displayed", "Comfortable"/"Compact" and their descriptions, "Compact Mode", "Media", "Auto-play Videos", "Show Animations", "Coin Placement", "Stick coin to banner", "Apply Changes", "Coming soon" toast
- Replace theme labels: System, Light, Dark, Cosmic, Christmas, Island, Hacker, Horror

**5. ContentSettings** (lines 1049-1133)
- Add `useTranslation()` hook
- Replace: "Content Preferences", "Post Settings", "Default Post Visibility", "Auto-save Drafts", "Content Filtering", "Filter Explicit Content", "Show Sensitive Content", "Enable Content Warnings", "Feed Preferences", "Show Reposts", "Save Preferences" and all descriptions

**6. MessagesSettings** (lines 1308-1416)
- Add `useTranslation()` hook
- Replace: "Message Settings", "Direct Message Access", "Allow Direct Messages", "Control who can send you DMs", all DM option labels/descriptions, help text, "Preferences", "Message Notifications", "Read Receipts", "End-to-End Encryption", "Filter Message Requests", "Storage", "Storage Used", storage amounts, "Quick Actions", "Archived Chats", "Export Chats"

**7. AssetsSettings** (lines 1200-1306)
- Add `useTranslation()` hook
- Replace: "Assets", "Not connected", "Manage", "Fractions You Own", "You don't own any fractions yet", "Usernames You Own", "You don't own any usernames yet", "Offers You've Made", "You haven't made any offers yet", "Wallet address copied!" toast

**8. GeoBlockingSelector** (lines 1473-1599)
- Add `useTranslation()` hook
- Replace: "Select countries to block...", "country blocked"/"countries blocked", "Block Countries", "Search countries...", "No countries found"

**9. LanguageSelector** (line 1033-1047)
- Add `useTranslation()` hook
- Replace drawer title "Language" with `t('settings.language')`

No new translation keys needed -- all keys already exist in all 23 locale files.

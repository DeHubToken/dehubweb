

# Fix: False Positive URL Detection in Messages

## Problem
The `TranslatableText` component's URL-to-emoji feature is incorrectly converting regular words like "working" into clickable link emojis. The URL regex is too aggressive because:
1. It has no **start boundary** -- it can match anywhere in text, including mid-sentence
2. The character class `[-a-zA-Z0-9@:%._+~#=]` includes dots, allowing the regex to consume surrounding punctuation
3. The 300+ TLD whitelist includes many 2-letter country codes (`.in`, `.ng`, `.re`, `.to`, `.me`, etc.) that overlap with common English word fragments

## Solution
Add a start boundary to the URL regex so it only matches after whitespace, start of string, or opening brackets -- never in the middle of normal text.

## Technical Details

### File: `src/components/app/TranslatableText.tsx`

**Change 1**: Update `TLD_URL_REGEX_SRC` to require a preceding boundary:
```
// Before:
(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.(?:TLDs)...

// After:
(?:^|(?<=\s)|(?<=[\(\[<"']))(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%_+~#=]{1,256}\.(?:TLDs)...
```

Key changes:
- Add a lookbehind `(?:^|(?<=\s)|(?<=[\(\[<"']))` to ensure URLs only match at the start of text or after whitespace/opening punctuation
- Remove `.` (dot) from the main domain character class `[-a-zA-Z0-9@:%._+~#=]` to prevent consuming sentence periods as part of the "domain". Dots in subdomains are already handled by the overall regex structure

**Change 2**: Apply the same boundary fix to `WWW_URL_REGEX_SRC`.

**Change 3**: In `renderTextWithLinks`, trim any captured whitespace from the match so the link emoji doesn't swallow spaces.

This prevents words like "working", "gaming", "trading", etc. from being falsely detected as URLs while still correctly detecting real bare-domain links like `example.com` or `crypto.exchange`.




## Fix Bio Link Detection

### Problem
1. The `.digital` TLD (and many others) is missing from the whitelist, so `www.sec.digital` isn't recognized as a link.
2. Any text starting with `www.` is obviously a link regardless of TLD, but the current regex requires the TLD to be in the whitelist.

### Solution

**File: `src/components/app/TranslatableText.tsx`**

Two changes to the URL detection regex (around lines 25-28):

1. **Expand `COMMON_TLDS`** to add commonly used modern TLDs:
   `digital|store|online|site|tech|world|club|live|space|art|design|social|link|page|one|pro|media|studio|agency|blog|shop|network|land|zone|fund|games|gaming|vc|nft|crypto|dao|eth`

2. **Add a second regex** (or use alternation) that always matches `www.` prefixed URLs regardless of TLD. The combined pattern becomes:

```
// Always match www. links regardless of TLD
const WWW_URL_REGEX = /(?:https?:\/\/)?www\.[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z]{2,63}\b(?:[-a-zA-Z0-9()@:%_+.~#?&\/=]*)/gi;

// TLD-restricted for non-www links
const TLD_URL_REGEX = new RegExp(
  `(?:https?:\\/\\/)[-a-zA-Z0-9@:%._+~#=]{1,256}\\.(?:${COMMON_TLDS})...`,
  'gi'
);
```

The matching logic will combine both patterns: if the text contains `www.`, it always gets converted to a link. For URLs without `www.`, the TLD whitelist still applies to prevent false positives like `file.mp4`.

This is a small, targeted change to the regex constants and the `processTextWithLinks` function in `TranslatableText.tsx`.


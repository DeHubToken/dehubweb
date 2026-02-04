
# Fix MetaMask Browser Layout Gap After Login

## Problem
After logging in on MetaMask Mobile browser, Web3Auth injects iframes that create an ugly gap above the top navigation bar, pushing all content down.

## Solution
Add comprehensive CSS rules to collapse all Web3Auth-injected iframes and ensure any remaining gaps are filled with black background color.

---

## Changes

### File: `src/index.css`

Add the following CSS rules after the existing Web3Auth fixes (after line 476):

```css
/* Fix Web3Auth injected iframes causing layout gaps on MetaMask Mobile */
/* These iframes have position: fixed; top: 0 which pushes content down */
iframe[id*="auth-iframe"],
iframe[id*="walletIframe"],
iframe[id*="web3auth"],
iframe[src*="web3auth"],
#w3a-container,
[id^="w3a-"] {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 0 !important;
  height: 0 !important;
  border: none !important;
  pointer-events: none !important;
  background: transparent !important;
}

/* Only show iframes when they contain visible content */
iframe[id*="auth-iframe"][style*="display: block"],
iframe[id*="walletIframe"][style*="display: block"],
iframe[id*="web3auth"][style*="display: block"],
iframe[src*="web3auth"][style*="display: block"] {
  position: fixed !important;
  width: 100% !important;
  height: 100% !important;
  pointer-events: auto !important;
}

/* Fallback: ensure any injected elements at top of page match background */
html, body {
  background-color: #000 !important;
}

/* Extra fallback: force black background on root and any gaps */
#root {
  background-color: #000;
}

/* Hide any fixed-position empty elements that might cause gaps */
body > iframe:not([src]),
body > iframe[style*="height: 0"],
body > div[style*="position: fixed"][style*="height: 0"] {
  display: none !important;
}
```

This approach:
1. Collapses all Web3Auth-related iframes to zero dimensions by default
2. Uses `position: absolute` instead of `fixed` to prevent layout interference
3. Re-enables full-size display only when iframes are explicitly shown
4. Sets black background on html/body/root as fallback so any gaps blend seamlessly
5. Hides any empty fixed-position elements that might cause gaps

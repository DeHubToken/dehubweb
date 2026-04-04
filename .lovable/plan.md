

## Connect AI Assistant to Uniswap Swap

### How It Works

The AI assistant detects when a user asks to swap tokens (e.g. "swap 0.01 ETH for DHB", "buy 1000 DHB"), extracts the intent, and returns a **structured swap action** in its response. The frontend then renders an interactive swap confirmation card inline in the chat — the user reviews the quote and confirms with one tap. The actual swap executes client-side using the existing `uniswap-swap.ts` utilities.

### Why Client-Side Execution

The swap functions (`getSwapQuote`, `swapTokens`) use the user's wallet (Web3Auth / Wagmi) which only exists in the browser. The backend AI just needs to understand the intent and return structured parameters.

### Architecture

```text
User: "swap 0.01 ETH for DHB"
        │
        ▼
  general-ai-chat (edge function)
  ── detects swap keywords
  ── uses tool-calling to extract: { action: "swap", tokenIn, tokenOut, amount }
  ── returns structured JSON action alongside text response
        │
        ▼
  GeneralAIChat.tsx (frontend)
  ── detects swap action in response
  ── renders SwapActionCard (shows quote, slippage, confirm button)
  ── on confirm → calls getSwapQuote + swapTokens client-side
  ── shows tx result in chat
```

### Implementation Steps

1. **Add swap intent detection to `general-ai-chat` edge function**
   - Add swap-related keywords to detect intent (e.g. "swap", "buy DHB", "exchange ETH for")
   - When detected, use AI tool-calling to extract structured params: `tokenIn`, `tokenOut`, `amount`, `amountType` (input vs output)
   - Return a `swapAction` object alongside the text response

2. **Create `SwapActionCard` component**
   - Inline chat card showing: token pair, amount, estimated quote, slippage
   - "Get Quote" button that calls `getSwapQuote` from existing `uniswap-swap.ts`
   - "Confirm Swap" button that calls `swapTokens`
   - Status states: quoting → ready → swapping → success/error
   - Reuses the existing swap logic from `SwapToTokenDrawer` / `SwapToDHBDrawer`

3. **Update `GeneralAIChat.tsx` to handle swap actions**
   - Extend `Message` type with optional `swapAction` field
   - When AI response contains `swapAction`, render `SwapActionCard` instead of plain text
   - Pass wallet context (address, chain) to the card

4. **Add token resolution**
   - Use existing `useContractToTicker` hook for contract address inputs
   - Support common symbols ($DHB, $ETH, $USDC) mapped to known addresses
   - Fall back to DexScreener lookup for unknown tokens

### Technical Details

- **Edge function response shape** (new fields):
  ```json
  {
    "response": "I'll help you swap 0.01 ETH for DHB! Here's your quote:",
    "swapAction": {
      "tokenIn": "0x0",
      "tokenOut": "0x...",
      "amount": "0.01",
      "amountType": "input",
      "tokenInSymbol": "ETH",
      "tokenOutSymbol": "DHB"
    }
  }
  ```

- **Security**: No private keys or transactions on the backend. All signing happens client-side through existing wallet infrastructure.
- **Chain support**: Base only (matching current Uniswap V3 integration).
- **Auth required**: User must be logged in with a wallet to execute swaps.


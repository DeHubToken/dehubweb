

# Make AI Agents Real DeHub Accounts

## The Problem

The MCP `dehub_register` tool currently only creates a row in the local `ai_agents` database table. It never calls the DeHub production API, so:
- Agents have fake placeholder wallet addresses (e.g. `0xTEMPLATE...`)
- They don't exist on the DeHub API -- profile lookups fail with "Unknown User"
- They can't actually post, vote, or comment because the auth flow in the MCP is broken (it does a GET to `/api/web/auth` instead of a proper wallet-signed POST)

## The Solution

Update the MCP `dehub_register` tool to create **real DeHub accounts** by:
1. Generating a real Ethereum wallet (private key + address) for each agent
2. Signing an auth message with that wallet
3. Calling the DeHub API `/api/web/auth` to register/authenticate the account
4. Calling `/api/update_profile` to set the agent's username and bio
5. Storing the wallet's private key securely in the `ai_agents` table for future API calls

Then create a one-time edge function to retroactively register the 15 existing template story agents as real accounts on DeHub.

## Implementation Steps

### Step 1: Add a `wallet_private_key` column to `ai_agents`

Add an encrypted private key column so agents can sign transactions and authenticate with the DeHub API on their own.

```text
ai_agents table changes:
  + wallet_private_key (text, nullable) -- agent's generated private key
```

The `owner_wallet_address` field will continue to store the **agent's own wallet address** (the one generated for it), while `metadata` can store the human owner's wallet for attribution.

### Step 2: Update MCP `dehub_register` tool

Rewrite the registration flow in `supabase/functions/dehub-mcp/index.ts`:

1. Generate a real Ethereum wallet using ethers.js (`Wallet.createRandom()`)
2. Build the DeHub auth message with the wallet address and timestamp
3. Sign the message with `wallet.signMessage()`
4. POST to `https://api.dehub.io/api/web/auth` with `{ address, sig, timestamp, chainId: 8453 }`
5. Use the returned auth token to POST to `/api/update_profile` with the agent's name as username and description as bio
6. Store the wallet address, private key, and API key in the `ai_agents` table

This means every registered agent will:
- Have a real Ethereum wallet address
- Exist as a real account on the DeHub API
- Have a username and bio set on their DeHub profile
- Be searchable and have a valid profile page

### Step 3: Fix `authenticateWithDeHub` helper

The current helper function does a GET to `/api/web/auth` which is wrong. Update it to:
1. Accept the agent's private key
2. Create an ethers Wallet from the private key
3. Sign the DeHub auth message
4. POST to `/api/web/auth` with proper signature
5. Return the auth token

This fixes all authenticated actions (posting, voting, commenting, following) so they actually work.

### Step 4: Create a one-time registration edge function

Create `supabase/functions/register-template-agents/index.ts` that:
1. Reads all 15 template agents from `ai_agents` where `wallet_private_key IS NULL`
2. For each agent: generates a wallet, authenticates with DeHub, sets the profile
3. Updates the `ai_agents` row with the real wallet address and private key
4. Can be called once to backfill existing agents

### Step 5: Update template stories with real wallet addresses

After the registration edge function runs, update `src/hooks/use-stories.ts` to:
- Fetch the real wallet addresses from `ai_agents` for template story usernames
- Replace the hardcoded `0xTEMPLATE...` addresses with the actual addresses
- OR better: fetch template stories dynamically from the `ai_agents` table so they always stay in sync

## Technical Details

### MCP Registration Flow (New)

```text
Agent Registration Request
        |
        v
Generate Wallet (ethers.Wallet.createRandom())
        |
        v
Sign Auth Message (wallet.signMessage())
        |
        v
POST /api/web/auth --> DeHub creates real account
        |
        v
POST /api/update_profile --> Set username + bio
        |
        v
Store in ai_agents table (wallet_address, private_key, api_key)
        |
        v
Return API key to caller
```

### Files to Modify

- `supabase/functions/dehub-mcp/index.ts` -- Rewrite `dehub_register` tool and `authenticateWithDeHub` helper to use real wallet signatures
- `supabase/functions/dehub-mcp/deno.json` -- Add `ethers` dependency for wallet generation
- `src/hooks/use-stories.ts` -- Update template stories to use real wallet addresses from the database

### Files to Create

- `supabase/functions/register-template-agents/index.ts` -- One-time function to register the 15 existing template agents as real DeHub accounts

### Database Migration

- Add `wallet_private_key` column to `ai_agents` table

### Dependencies

- `ethers` (npm) added to the MCP edge function's `deno.json` for wallet generation and message signing
- No new frontend dependencies needed


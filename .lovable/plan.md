

## Problem

The "Recent Purchases" list shows "No purchases yet" even though the API returns 96 transactions. Two bugs:

1. **`getAllDPayTransactions`** — The API returns `{ tnxs: [...], total, page, limit }` but the code checks for a `result` key. It falls through and returns the raw object cast as `DPayTransaction[]`, which is wrong.

2. **`useInfiniteQuery` in `BuyCoinsPage`** — Expects each page to be `{ transactions: [...], hasMore, page }`, but the function returns a flat array (or the wrong object). `flatMap(p => p.transactions)` yields nothing.

## Fix

### 1. Update `getAllDPayTransactions` in `src/lib/api/dehub/payments.ts`

Return a paginated result object instead of a flat array:

```typescript
export interface PaginatedTransactions {
  transactions: DPayTransaction[];
  total: number;
  page: number;
  hasMore: boolean;
}

export async function getAllDPayTransactions(params: {
  page?: number;
  limit?: number;
} = {}): Promise<PaginatedTransactions> {
  const limit = params.limit || 10;
  const page = params.page || 1;
  const response = await apiCall<any>("/api/dpay/tnxs", {
    params: { page, limit },
    requiresAuth: false,
  });
  
  // API returns { tnxs: [...], total, page, limit }
  const tnxs = response?.tnxs ?? response?.result ?? (Array.isArray(response) ? response : []);
  const total = response?.total ?? tnxs.length;
  
  return {
    transactions: tnxs,
    total,
    page,
    hasMore: page * limit < total,
  };
}
```

Also fix `getDPayTransactions` the same way (it also checks for `result` instead of `tnxs`).

### 2. Update `BuyCoinsPage.tsx` infinite query

Update the return type reference to match `PaginatedTransactions`:

```typescript
queryFn: ({ pageParam = 1 }) => getAllDPayTransactions({ page: pageParam, limit: 10 }),
getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.page + 1 : undefined,
```

This already matches the new shape, so no change needed in the query itself — only the import type alignment.

### 3. Map transaction fields correctly

The API returns fields like `receiverAddress`, `amount`, `tokenSymbol`, `createdAt`, `status_stripe`, `sessionId`. Verify the rendering code in `BuyCoinsPage` uses the correct field names from the API response (e.g., the API uses `receiverAddress` directly, which matches the existing filter code).


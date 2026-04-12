

# Structured Shipping Address with Autocomplete & Saved Addresses

## What changes

### 1. Database: Add `saved_addresses` table
Store users' shipping addresses so they can reuse them across purchases.

```
saved_addresses
- id (uuid, PK)
- wallet_address (text, NOT NULL)
- label (text, e.g. "Home", "Work")
- full_name (text)
- address_line1 (text)
- address_line2 (text, nullable)
- city (text)
- state (text)
- postal_code (text)
- country (text)
- is_default (boolean, default false)
- created_at, updated_at
```

RLS: users can only CRUD their own addresses (via `get_request_wallet_address()`).

### 2. Address autocomplete via Google Places API
Use Google Places Autocomplete to provide real-time address suggestions as the user types in the street address field. This requires a Google Maps API key with Places API enabled.

- Will use the `@react-google-maps/api` or lightweight `use-places-autocomplete` library
- On selection, auto-fills city, state, postal code, and country fields

### 3. New `ShippingAddressForm` component
Replace the single Textarea with a structured form:
- **Saved address dropdown** — if user has saved addresses, show a selector at the top
- **Full Name** (text input)
- **Street Address** (with Google Places autocomplete)
- **Apt/Suite** (optional)
- **City**, **State**, **Postal Code** (auto-filled from autocomplete, editable)
- **Country** (auto-filled, editable)
- **"Save this address"** checkbox + optional label field
- Returns formatted address string to the parent

### 4. Update `ListingDetailDrawer`
Replace the Textarea with the new `ShippingAddressForm`. On purchase, the structured address is concatenated into the `shipping_address` field for the order. If "Save" is checked, the address is persisted to `saved_addresses`.

### 5. Hooks
- `useSavedAddresses(walletAddress)` — fetch saved addresses
- `useSaveAddress()` — mutation to save/update an address
- `useDeleteAddress()` — mutation to remove a saved address

## Technical details

- **Google API Key**: Will need a Google Maps API key with Places API enabled. Will use `add_secret` to request this from the user before proceeding.
- The autocomplete input uses the Places API `getPlacePredictions` for suggestions and `getDetails` for structured address components.
- Saved addresses are loaded when the drawer opens for non-digital items.
- A default address auto-populates the form.

## Files to create/edit
- **Migration**: Create `saved_addresses` table with RLS
- **New**: `src/components/app/stores/ShippingAddressForm.tsx`
- **New**: `src/hooks/use-saved-addresses.ts`
- **Edit**: `src/components/app/stores/ListingDetailDrawer.tsx` — swap Textarea for new form


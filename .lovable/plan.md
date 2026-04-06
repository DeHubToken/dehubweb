

## Plan: Create Buy Bot State Table

Run the provided SQL as a database migration to create the `buy_bot_state` table with RLS enabled, a service-role policy, and seed the initial row.

### Technical Details
- **New table**: `buy_bot_state` with columns: `id` (text PK), `last_block_number` (bigint), `last_tx_hashes` (text[]), `updated_at` (timestamptz)
- **RLS**: Enabled with a permissive policy for all operations
- **Seed data**: Initial row with id='dhb', last_block_number=0

Single migration containing the CREATE TABLE, RLS policy, and INSERT statement.


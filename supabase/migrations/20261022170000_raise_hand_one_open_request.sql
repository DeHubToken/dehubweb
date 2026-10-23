-- One open (pending) hand per person per stage.
--
-- The table was UNIQUE on (space_id, wallet_address, status), so a second
-- approve or lower for the same person in the same stage collided with the
-- first one's row and was refused. The pending row then stayed in the host's
-- raised hands list after the person had been invited up or had lowered it.
-- Only pending rows need to be unique; resolved rows are history.
--
-- The old constraint is found by its columns rather than by name, so this
-- runs the same wherever the inline UNIQUE got a different generated name.
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.raise_hand_requests'::regclass
      AND con.contype = 'u'
      AND array_length(con.conkey, 1) = 3
      AND (
        SELECT array_agg(att.attname::text)
        FROM unnest(con.conkey) AS k(attnum)
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum
      ) @> ARRAY['space_id', 'wallet_address', 'status']
  LOOP
    EXECUTE format('ALTER TABLE public.raise_hand_requests DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS raise_hand_requests_one_pending
  ON public.raise_hand_requests (space_id, wallet_address)
  WHERE status = 'pending';

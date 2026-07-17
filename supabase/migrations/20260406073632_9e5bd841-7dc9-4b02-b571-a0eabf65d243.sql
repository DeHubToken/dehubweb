
-- Add auto-incrementing event number
CREATE SEQUENCE IF NOT EXISTS public.community_events_event_number_seq;

ALTER TABLE public.community_events 
ADD COLUMN event_number integer NOT NULL DEFAULT nextval('public.community_events_event_number_seq');

-- Backfill existing events with sequential numbers
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as rn
  FROM public.community_events
)
UPDATE public.community_events e
SET event_number = n.rn
FROM numbered n
WHERE e.id = n.id;

-- Set the sequence to continue from the max
SELECT setval('public.community_events_event_number_seq', COALESCE((SELECT MAX(event_number) FROM public.community_events), 0) + 1);

-- Add unique constraint
ALTER TABLE public.community_events ADD CONSTRAINT community_events_event_number_unique UNIQUE (event_number);

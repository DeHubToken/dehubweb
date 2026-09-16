-- Killer Whale and Great White Shark traded rungs on the badge ladder.
--
-- A killer whale beats a great white, so the orca now sits on the dearer rung:
-- Great White Shark is 5,000,000 DHB and Killer Whale is 10,000,000. Only the
-- two labels moved — every threshold, discount, quota and allowance stayed on
-- the rung it was already on, so no holder gained or lost anything.
--
-- Tier names are stored, though, not only rendered. An advertiser who aimed a
-- campaign at `Killer Whale` bought the 5,000,000 audience; left alone, that
-- same row would start buying the 10,000,000 one instead — a smaller, dearer
-- audience than they picked, silently. Swapping the stored names keeps every
-- live campaign pointed at the people it was aimed at.
--
-- Once only, by construction: a second pass would swap them back, and the
-- migration runner applies this file exactly one time.

UPDATE public.ad_campaigns
SET targeting = jsonb_set(
      targeting,
      '{tiers}',
      (
        SELECT jsonb_agg(
                 CASE tier
                   WHEN 'Killer Whale' THEN 'Great White Shark'
                   WHEN 'Great White Shark' THEN 'Killer Whale'
                   ELSE tier
                 END
                 ORDER BY ordinality
               )
        FROM jsonb_array_elements_text(targeting -> 'tiers')
             WITH ORDINALITY AS elements(tier, ordinality)
      )
    )
WHERE targeting ? 'tiers'
  AND targeting -> 'tiers' ?| ARRAY['Killer Whale', 'Great White Shark'];

-- Keep the private preview's existing twenty profiles on one daily post each.
-- Preserve current counters, leases and wake times, so rollout cannot replay a post.
UPDATE public.ai_agent_lives AS life
SET persona = jsonb_set(life.persona, '{posts_per_day}', '[1,1]'::jsonb),
    state = jsonb_set(coalesce(life.state, '{}'::jsonb), '{posts_target}', '1'::jsonb),
    sentient = true,
    updated_at = now()
FROM public.ai_agents AS profile
WHERE profile.id = life.agent_id
  AND profile.human_owner_wallet = '0x9324840523a5d17dd12a2f11a9472e5a199c1937'
  AND profile.is_active = true
  AND profile.name IN ('r4fa','grainline','ghostpixel','liftloop','offtrail','jean','fixit','olivehour','julesonwax','ashkickpush','tideline_7','touchline','papercut','milemarker88','poppyplots','windowsill','rhea404','platform9','lowbatt','slowbrew');

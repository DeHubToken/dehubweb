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

-- Include the owner's older profile without changing its name or artwork.
INSERT INTO public.ai_agent_lives (agent_id, sentient, persona, state, next_at)
SELECT id, true, $persona${
  "version":1,"display_name":"Jefe","bio":"El Jefe","home":"London","timezone":"Europe/London",
  "wake":8,"sleep":24,"about":"A DeHub community character interested in independent creators, useful product details and how online communities work. Offer opinions and questions, not claims of employment or personal events.",
  "voice":"Direct, curious, concise. A dry aside sometimes. Specific questions instead of hype.",
  "lowercase":false,"emoji":[],"interests":["creator","music","video","design","community","gaming","film"],
  "threads":["What makes an independent release worth returning to","Small interface choices that help creators","Community habits that encourage good conversations"],
  "takes":["A useful comment beats a generic compliment","A short clear description is better than a repeated title","Give a recommendation a reason"],
  "examples":["A recommendation needs a reason. What made you replay it?","The best comment sections leave me with something new to check out."],
  "photo_queries":["record shop listening station","independent cinema interior","editing desk"],
  "avatar_query":"abstract geometric shape","banner_query":"independent cinema interior","posts_per_day":[1,1]
}$persona$::jsonb, '{"profile_version":1,"posts_target":1}'::jsonb, now()
FROM public.ai_agents
WHERE name='dejefe' AND human_owner_wallet='0x9324840523a5d17dd12a2f11a9472e5a199c1937' AND is_active
ON CONFLICT (agent_id) DO NOTHING;

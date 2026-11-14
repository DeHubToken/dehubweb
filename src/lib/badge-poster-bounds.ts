export const badgePosterBounds: Record<string, [number, number, number, number]> = {
  'Crab': [12, 21, 119, 117],
  'Ghost Lobster': [9, 13, 121, 118],
  'Piranha': [8, 16, 121, 124],
  'Giant Tortoise': [11, 17, 122, 112],
  'King Cobra': [16, 8, 117, 124],
  'Octopus': [12, 15, 122, 124],
  'Crocodile': [8, 17, 119, 123],
  'Dolphin': [19, 9, 120, 122],
  'Tiger Shark': [7, 13, 121, 121],
  'Great White Shark': [5, 15, 120, 121],
  'Killer Whale': [19, 11, 93, 98],
  'Blue Whale': [16, 24, 122, 126],
  'Megalodon': [9, 11, 119, 117],
};

/**
 * Where each poster optically sits: the lowest row still carrying a quarter of
 * the artwork's widest opaque span (alpha > 128). Thin tips below it (claw
 * points, tails, the shield's lower corner) overshoot the baseline the way
 * round and pointed letters do, so the body reads as resting on the text.
 */
export const badgePosterSit: Record<string, number> = {
  'Crab': 113, 'Ghost Lobster': 114, 'Piranha': 116, 'Giant Tortoise': 111, 'King Cobra': 122, 'Octopus': 122,
  'Crocodile': 120, 'Dolphin': 119, 'Tiger Shark': 112, 'Great White Shark': 114, 'Killer Whale': 94,
  'Blue Whale': 120, 'Megalodon': 112,
};

# Musical photos in Shorts

Home's Scroll reel and the Shorts feed include public image posts with a valid attached soundtrack. Each post occupies one screen. Up/down changes posts; sideways changes photos only within a multi-image post. A single photo has no sideways controls.

The photo pager lives inside the existing playback slide. Changing photos retains the same media element, current time, mute state, playback speed and seek controls. Photos never manufacture a video URL or inherit a failed video-transcode flag. Tiles show a music marker and the photo count for slideshows. Music failures offer retry.

The image query uses `search=soundtrack`: the live API interprets search as a regular expression, so an unescaped opening bracket fails. Results still require a parsed soundtrack and valid HTTP(S) images. Paid, hold-gated, subscriber, bounty and non-safe rated photos are excluded because Shorts has no reveal/purchase gate. Image queries preserve following/category filters and continuation independently of videos.

Validation: normalization/gating tests, photo navigation bounds, single-photo controls, and a playback regression asserting the same player and current time after changing photos, followed by pause when leaving the post. Live API fixtures 5421 and 6057 are single images; no live multi-image soundtrack fixture was returned during verification. Native gesture behavior still requires device verification. No local production build is needed.

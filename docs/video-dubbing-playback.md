# Video dubbing playback

Video posts start with original audio. Web retains only a saved `video-dubs:on`
value of `1`; native retains only `video-voice-dub-on=true`. These values came
from deliberate controls. The previous automatic default never persisted them,
so missing keys now mean off, independently of automatic text translation.
Invalid values, unavailable local storage and the older native server-dub keys
also mean off. Deliberate saved off choices and language selections survive.

Listening to a video still reads its transcript and prepares a supported
foreign-language translation and cached audio through the existing routes.
Preparation does not mount the web playback engine or enable either native
playback engine. Cache hits, supported languages, private-content restrictions,
attempt limits and the disabled background dub sweep are retained. Manual
controls still choose playback, and the existing audio mixer is unchanged.

Discovery requires a signed-in account, a ready transcript with a known source
language, a different preferred app language and a supported dub. Each listen
must cover 60% of the video, capped at 12 seconds and floored at 4 seconds.
The tip requires two such listens, separated by a rewind or reopening the same
video. Paused/muted playback, zero original volume, buffering and forward seeks
do not count. Evidence is held for at most 128 recent video/account/language
combinations in memory; only the learned status is persisted.

`claim_video_dub_tip()` atomically sets `user_display_preferences.video_dub_tip_seen`
for the wallet proven by the signed wallet session. It accepts no target wallet.
Only the winning client displays the tip; offline or rejected claims stay quiet.
The column is separate from the preference blob, so older saves cannot reset
it. Web and native share it across devices and reinstalls. The toast opens the
existing audio settings; it never switches dubbed playback on.

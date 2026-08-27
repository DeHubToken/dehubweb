/**
 * Whether this host wants their stage dubbed in their own voice.
 * ==============================================================
 *
 * Just the flag. Creating the voice is a paid, explicit step that happens
 * before going live — see `stage-voice-clone.ts` and `StageVoiceSetup`.
 *
 * This file used to also harvest the sample: thirty seconds into a stage it
 * posted the recorder's buffer to `elevenlabs-clone-voice` and dropped the
 * result on the floor, because nothing wrote the returned id to
 * `custom_voices`. Every clone it ever made was orphaned — a voice slot burned
 * per page load, and dubbing falling back to the stock narrator regardless.
 * Its "do I already have one?" check could not work either: it read
 * `custom_voices` with no wallet header, and that table's RLS gates SELECT on
 * exactly that header, so the answer was always no.
 *
 * The flag stays here because the go-live form reads it before any of the
 * paid machinery is loaded, and it must not drag that machinery in with it.
 */

const CONSENT_KEY = 'dehub.stage.dubVoiceConsent';

/** Did the host ask, when starting a stage, to be dubbed in their own voice? */
export function dubVoiceConsentGiven(): boolean {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDubVoiceConsent(value: boolean) {
  try {
    if (value) window.localStorage.setItem(CONSENT_KEY, '1');
    else window.localStorage.removeItem(CONSENT_KEY);
  } catch {
    /* private mode — they will be asked again next time, which is the safe way to fail */
  }
}

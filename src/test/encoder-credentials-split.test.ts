/**
 * OBS has one Server box and one Stream Key box, and it joins them with a
 * slash. That is the whole reason this split exists.
 *
 * The self-hosted ingest puts its credentials in the URL's query string, so
 * handing the creator the whole URL as the Server and the raw key as the Key
 * makes OBS publish to `…?user=dehub&pass=<key>/<key>` — the key lands inside
 * the password and the gate refuses it. Confirmed against the live publish
 * gate on 2026-09-16: the whole-URL form arrived as
 * `query: "user=dehub&pass=<key>/<key>"`, the split form as
 * `query: "user=dehub&pass=<key>"`.
 *
 * Livepeer's URL carries no query and its key is a separate value, so it must
 * come back untouched.
 */
import { describe, it, expect } from 'vitest';
import { encoderCredentials } from '@/components/app/modals/GoLiveModal';

const KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718';
const PLAYBACK = '2990f3b7a1a4627ae7bf3455';

describe('encoderCredentials', () => {
  it('splits a self-hosted URL at the host, so the key never reaches the password', () => {
    const url = `rtmp://live.dehub.io/${PLAYBACK}-rtmp?user=dehub&pass=${KEY}`;
    const { server, key } = encoderCredentials(url, KEY);

    expect(server).toBe('rtmp://live.dehub.io');
    expect(key).toBe(`${PLAYBACK}-rtmp?user=dehub&pass=${KEY}`);

    // What OBS will actually publish to, and what the gate then parses.
    const joined = `${server}/${key}`;
    expect(joined).toBe(url);
    expect(joined).not.toContain(`${KEY}/${KEY}`);
  });

  it('keeps the -rtmp suffix on the path — the gate strips it, we must not', () => {
    const { key } = encoderCredentials(
      `rtmp://live.dehub.io/${PLAYBACK}-rtmp?user=dehub&pass=${KEY}`,
      KEY
    );
    expect(key.startsWith(`${PLAYBACK}-rtmp?`)).toBe(true);
  });

  it('leaves a Livepeer URL alone: no query means nothing is hiding in it', () => {
    const { server, key } = encoderCredentials('rtmp://rtmp.livepeer.com/live', KEY);
    expect(server).toBe('rtmp://rtmp.livepeer.com/live');
    expect(key).toBe(KEY);
  });

  it('hands back what it was given rather than mangling an unparseable URL', () => {
    expect(encoderCredentials('not a url', KEY)).toEqual({ server: 'not a url', key: KEY });
  });

  it('survives an ingest URL that has not arrived yet', () => {
    expect(encoderCredentials('', KEY)).toEqual({ server: '', key: KEY });
  });
});

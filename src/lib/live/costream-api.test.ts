import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/supabase-wallet-client', () => ({ walletScopedClient: () => ({}) }));

import { battlePhase, battleSides, BATTLE_RESULT_MS, costreamUid, type CoStreamState } from './costream-api';

const HOST = '0x1111111111111111111111111111111111111111';
const GUEST = '0xabcdef0123456789abcdef0123456789abcdef01';

describe('costreamUid', () => {
  it('is a positive 31-bit integer fixed by the wallet', () => {
    const uid = costreamUid(GUEST);
    expect(uid).toBeGreaterThan(0);
    expect(uid).toBeLessThan(2 ** 31);
    expect(costreamUid(GUEST.toUpperCase().replace('0X', '0x'))).toBe(uid);
    expect(costreamUid(HOST)).not.toBe(uid);
  });

  it('matches the rule agora-token enforces', () => {
    const source = readFileSync(resolve(__dirname, '../../../supabase/functions/agora-token/index.ts'), 'utf8');
    expect(source).toContain('return (parseInt(wallet.slice(2, 10), 16) >>> 1) || 1;');
  });
});

describe('battlePhase', () => {
  const at = (start: number, end: number) => ({
    battle_started_at: new Date(start).toISOString(),
    battle_ends_at: new Date(end).toISOString(),
  });

  it('is idle with no round', () => {
    expect(battlePhase(null)).toBe('idle');
    expect(battlePhase({ battle_started_at: null, battle_ends_at: null })).toBe('idle');
  });

  it('runs until the bell, shows the result, then clears', () => {
    const room = at(1_000, 61_000);
    expect(battlePhase(room, 30_000)).toBe('running');
    expect(battlePhase(room, 61_000)).toBe('result');
    expect(battlePhase(room, 61_000 + BATTLE_RESULT_MS)).toBe('idle');
  });
});

describe('battleSides', () => {
  const state = (seats: CoStreamState['seats'], extra: Partial<CoStreamState['room']> = {}): CoStreamState => ({
    room: {
      id: 'r', host_wallet: HOST, host_stream_id: 'host-stream', host_username: 'host', accepting_requests: true,
      status: 'active', battle_started_at: null, battle_ends_at: null, battle_round: 0, created_at: '',
      battle_host_score: '12.5', battle_guest_score: 3, ...extra,
    },
    seats,
  });
  const seat = (wallet: string, stream_id: string | null, status: CoStreamState['seats'][number]['status'] = 'accepted') =>
    ({ id: wallet, costream_id: 'r', wallet, stream_id, username: null, status, muted: false, updated_at: '' });

  it('needs a seated partner who is live', () => {
    expect(battleSides(state([seat(GUEST, null)]))).toBeNull();
    expect(battleSides(state([seat(GUEST, 'g', 'invited')]))).toBeNull();
  });

  it('pairs the host with the partner and reads the saved scores', () => {
    const sides = battleSides(state([seat(GUEST, 'guest-stream')]));
    expect(sides?.host).toMatchObject({ streamId: 'host-stream', score: 12.5 });
    expect(sides?.guest).toMatchObject({ wallet: GUEST, streamId: 'guest-stream', score: 3 });
  });

  it('prefers the partner the round was started against', () => {
    const other = '0x2222222222222222222222222222222222222222';
    const sides = battleSides(state([seat(other, 'other-stream'), seat(GUEST, 'guest-stream')], { battle_guest_wallet: GUEST }));
    expect(sides?.guest.wallet).toBe(GUEST);
  });
});

export type SpaceRole = 'host' | 'speaker' | 'listener';
/**
 * `scheduled` is a stage announced ahead of time — the row exists and is
 * shareable, but nobody is in the room and no Agora channel has been opened.
 * It becomes `live` when the host actually starts it.
 */
export type SpaceStatus = 'scheduled' | 'live' | 'ended';
export type HandRequestStatus = 'pending' | 'approved' | 'rejected';

export interface AudioSpace {
  id: string;
  channel_name: string;
  title: string;
  description?: string | null;
  host_wallet_address: string;
  host_username?: string | null;
  host_avatar?: string | null;
  status: SpaceStatus;
  listener_count: number;
  speaker_count: number;
  started_at: string;
  ended_at?: string | null;
  created_at: string;
  recording_url?: string | null;
  total_listens?: number;
  /** Intended start time — set only on `scheduled` stages. */
  scheduled_at?: string | null;
  /** Optional cover graphic, backing the announcement card and the live room. */
  cover_image_url?: string | null;
}

export interface SpaceParticipant {
  id: string;
  space_id: string;
  wallet_address: string;
  username?: string | null;
  avatar?: string | null;
  role: SpaceRole;
  is_muted: boolean;
  hand_raised: boolean;
  joined_at: string;
  left_at?: string | null;
}

export interface RaiseHandRequest {
  id: string;
  space_id: string;
  wallet_address: string;
  username?: string | null;
  avatar?: string | null;
  status: HandRequestStatus;
  created_at: string;
  resolved_at?: string | null;
}

export interface AgoraTokenResponse {
  token: string;
  appId: string;
  channel: string;
  uid: number;
}

export interface CreateSpacePayload {
  title: string;
  description?: string;
}

export interface JoinSpacePayload {
  spaceId: string;
  role?: SpaceRole;
}

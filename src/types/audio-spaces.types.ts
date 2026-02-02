export type SpaceRole = 'host' | 'speaker' | 'listener';
export type SpaceStatus = 'live' | 'ended';
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

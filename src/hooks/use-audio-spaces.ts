import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { 
  AudioSpace, 
  SpaceParticipant, 
  RaiseHandRequest, 
  AgoraTokenResponse,
  SpaceRole 
} from '@/types/audio-spaces.types';

interface UseAudioSpacesReturn {
  // State
  liveSpaces: AudioSpace[];
  currentSpace: AudioSpace | null;
  participants: SpaceParticipant[];
  handRequests: RaiseHandRequest[];
  isLoading: boolean;
  isConnected: boolean;
  isMuted: boolean;
  myRole: SpaceRole | null;
  
  // Actions
  createSpace: (title: string, description?: string) => Promise<AudioSpace | null>;
  joinSpace: (spaceId: string) => Promise<boolean>;
  leaveSpace: () => Promise<void>;
  endSpace: () => Promise<void>;
  toggleMute: () => void;
  raiseHand: () => Promise<void>;
  lowerHand: () => Promise<void>;
  approveSpeaker: (walletAddress: string) => Promise<void>;
  removeSpeaker: (walletAddress: string) => Promise<void>;
  refreshSpaces: () => Promise<void>;
}

export function useAudioSpaces(): UseAudioSpacesReturn {
  const { walletAddress, user } = useAuth();
  
  // State
  const [liveSpaces, setLiveSpaces] = useState<AudioSpace[]>([]);
  const [currentSpace, setCurrentSpace] = useState<AudioSpace | null>(null);
  const [participants, setParticipants] = useState<SpaceParticipant[]>([]);
  const [handRequests, setHandRequests] = useState<RaiseHandRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [myRole, setMyRole] = useState<SpaceRole | null>(null);
  
  // Refs for Agora
  const agoraClientRef = useRef<any>(null);
  const localAudioTrackRef = useRef<any>(null);
  const channelRef = useRef<any>(null);

  // Fetch live stages
  const refreshSpaces = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('audio_spaces')
        .select('*')
        .eq('status', 'live')
        .order('started_at', { ascending: false });

      if (error) throw error;
      setLiveSpaces((data as AudioSpace[]) || []);
    } catch (err) {
      console.error('Error fetching stages:', err);
    }
  }, []);

  // Generate unique channel name
  const generateChannelName = () => {
    return `stage_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  };

  // Get Agora token
  const getAgoraToken = async (channelName: string, role: 'publisher' | 'subscriber'): Promise<AgoraTokenResponse | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('agora-token', {
        body: { channelName, role }
      });

      if (error) throw error;
      return data as AgoraTokenResponse;
    } catch (err) {
      console.error('Error getting Agora token:', err);
      toast.error('Failed to get audio token');
      return null;
    }
  };

  // Initialize Agora SDK
  const initializeAgora = async (tokenData: AgoraTokenResponse, role: SpaceRole) => {
    try {
      // Dynamically import Agora SDK
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      
      // Create client
      const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
      agoraClientRef.current = client;

      // Set role
      if (role === 'host' || role === 'speaker') {
        await client.setClientRole('host');
      } else {
        await client.setClientRole('audience');
      }

      // Join channel
      await client.join(tokenData.appId, tokenData.channel, tokenData.token, tokenData.uid);
      
      console.log('Joined Agora channel:', tokenData.channel);

      // If publisher, create and publish audio track
      if (role === 'host' || role === 'speaker') {
        const localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localAudioTrackRef.current = localAudioTrack;
        
        // Start muted
        localAudioTrack.setMuted(true);
        
        await client.publish([localAudioTrack]);
        console.log('Published local audio track');
      }

      // Listen for remote users - use 'audio' | 'video' type assertion
      client.on('user-published', async (remoteUser: any, mediaType: 'audio' | 'video') => {
        await client.subscribe(remoteUser, mediaType);
        console.log('Subscribed to user:', remoteUser.uid);
        
        if (mediaType === 'audio') {
          remoteUser.audioTrack?.play();
        }
      });

      client.on('user-unpublished', (remoteUser: any) => {
        console.log('User unpublished:', remoteUser.uid);
      });

      setIsConnected(true);
      return true;
    } catch (err) {
      console.error('Error initializing Agora:', err);
      toast.error('Failed to connect to audio');
      return false;
    }
  };

  // Create a new stage
  const createSpace = useCallback(async (title: string, description?: string): Promise<AudioSpace | null> => {
    if (!walletAddress) {
      toast.error('Please connect your wallet first');
      return null;
    }

    setIsLoading(true);
    try {
      const channelName = generateChannelName();

      // Create stage in database
      const { data: space, error } = await supabase
        .from('audio_spaces')
        .insert({
          channel_name: channelName,
          title,
          description,
          host_wallet_address: walletAddress,
          host_username: user?.username || null,
          host_avatar: user?.avatarImageUrl || null,
          status: 'live',
          speaker_count: 1,
          listener_count: 0
        })
        .select()
        .single();

      if (error) throw error;

      // Add host as participant
      await supabase
        .from('space_participants')
        .insert({
          space_id: space.id,
          wallet_address: walletAddress,
          username: user?.username || null,
          avatar: user?.avatarImageUrl || null,
          role: 'host',
          is_muted: true
        });

      // Get token and connect
      const tokenData = await getAgoraToken(channelName, 'publisher');
      if (!tokenData) throw new Error('Failed to get token');

      const connected = await initializeAgora(tokenData, 'host');
      if (!connected) throw new Error('Failed to connect');

      setCurrentSpace(space as AudioSpace);
      setMyRole('host');
      
      toast.success('Stage created! You\'re now live.');
      return space as AudioSpace;
    } catch (err) {
      console.error('Error creating stage:', err);
      toast.error('Failed to create stage');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, user]);

  // Join an existing stage
  const joinSpace = useCallback(async (spaceId: string): Promise<boolean> => {
    if (!walletAddress) {
      toast.error('Please connect your wallet first');
      return false;
    }

    setIsLoading(true);
    try {
      // Get stage details
      const { data: space, error: spaceError } = await supabase
        .from('audio_spaces')
        .select('*')
        .eq('id', spaceId)
        .single();

      if (spaceError || !space) throw new Error('Stage not found');

      // Add as participant (listener by default)
      const { error: participantError } = await supabase
        .from('space_participants')
        .upsert({
          space_id: spaceId,
          wallet_address: walletAddress,
          username: user?.username || null,
          avatar: user?.avatarImageUrl || null,
          role: 'listener',
          is_muted: true,
          left_at: null
        }, {
          onConflict: 'space_id,wallet_address'
        });

      if (participantError) throw participantError;

      // Update listener count
      await supabase
        .from('audio_spaces')
        .update({ listener_count: (space.listener_count || 0) + 1 })
        .eq('id', spaceId);

      // Get token and connect as subscriber
      const tokenData = await getAgoraToken(space.channel_name, 'subscriber');
      if (!tokenData) throw new Error('Failed to get token');

      const connected = await initializeAgora(tokenData, 'listener');
      if (!connected) throw new Error('Failed to connect');

      setCurrentSpace(space as AudioSpace);
      setMyRole('listener');
      
      toast.success('Joined the stage!');
      return true;
    } catch (err) {
      console.error('Error joining stage:', err);
      toast.error('Failed to join stage');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, user]);

  // Leave stage
  const leaveSpace = useCallback(async () => {
    if (!currentSpace || !walletAddress) return;

    try {
      // Clean up Agora
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.stop();
        localAudioTrackRef.current.close();
        localAudioTrackRef.current = null;
      }

      if (agoraClientRef.current) {
        await agoraClientRef.current.leave();
        agoraClientRef.current = null;
      }

      // Update participant record
      await supabase
        .from('space_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('space_id', currentSpace.id)
        .eq('wallet_address', walletAddress);

      // Update listener count if was listener
      if (myRole === 'listener') {
        await supabase
          .from('audio_spaces')
          .update({ listener_count: Math.max(0, (currentSpace.listener_count || 1) - 1) })
          .eq('id', currentSpace.id);
      }

      setCurrentSpace(null);
      setIsConnected(false);
      setMyRole(null);
      setParticipants([]);
      
      toast.success('Left the stage');
    } catch (err) {
      console.error('Error leaving stage:', err);
    }
  }, [currentSpace, walletAddress, myRole]);

  // End stage (host only)
  const endSpace = useCallback(async () => {
    if (!currentSpace || myRole !== 'host') return;

    try {
      await supabase
        .from('audio_spaces')
        .update({ 
          status: 'ended',
          ended_at: new Date().toISOString()
        })
        .eq('id', currentSpace.id);

      await leaveSpace();
      toast.success('Stage ended');
    } catch (err) {
      console.error('Error ending stage:', err);
    }
  }, [currentSpace, myRole, leaveSpace]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localAudioTrackRef.current && (myRole === 'host' || myRole === 'speaker')) {
      const newMuted = !isMuted;
      localAudioTrackRef.current.setMuted(newMuted);
      setIsMuted(newMuted);

      // Update in database
      if (currentSpace && walletAddress) {
        supabase
          .from('space_participants')
          .update({ is_muted: newMuted })
          .eq('space_id', currentSpace.id)
          .eq('wallet_address', walletAddress);
      }
    }
  }, [isMuted, myRole, currentSpace, walletAddress]);

  // Raise hand
  const raiseHand = useCallback(async () => {
    if (!currentSpace || !walletAddress || myRole !== 'listener') return;

    try {
      await supabase
        .from('raise_hand_requests')
        .insert({
          space_id: currentSpace.id,
          wallet_address: walletAddress,
          username: user?.username || null,
          avatar: user?.avatarImageUrl || null,
          status: 'pending'
        });

      toast.success('Hand raised! Waiting for host approval.');
    } catch (err) {
      console.error('Error raising hand:', err);
      toast.error('Failed to raise hand');
    }
  }, [currentSpace, walletAddress, user, myRole]);

  // Lower hand
  const lowerHand = useCallback(async () => {
    if (!currentSpace || !walletAddress) return;

    try {
      await supabase
        .from('raise_hand_requests')
        .update({ 
          status: 'rejected',
          resolved_at: new Date().toISOString()
        })
        .eq('space_id', currentSpace.id)
        .eq('wallet_address', walletAddress)
        .eq('status', 'pending');
    } catch (err) {
      console.error('Error lowering hand:', err);
    }
  }, [currentSpace, walletAddress]);

  // Approve speaker (host only)
  const approveSpeaker = useCallback(async (targetWallet: string) => {
    if (!currentSpace || myRole !== 'host') return;

    try {
      // Update hand request
      await supabase
        .from('raise_hand_requests')
        .update({ 
          status: 'approved',
          resolved_at: new Date().toISOString()
        })
        .eq('space_id', currentSpace.id)
        .eq('wallet_address', targetWallet)
        .eq('status', 'pending');

      // Update participant role
      await supabase
        .from('space_participants')
        .update({ role: 'speaker' })
        .eq('space_id', currentSpace.id)
        .eq('wallet_address', targetWallet);

      // Update speaker count
      await supabase
        .from('audio_spaces')
        .update({ 
          speaker_count: (currentSpace.speaker_count || 1) + 1,
          listener_count: Math.max(0, (currentSpace.listener_count || 1) - 1)
        })
        .eq('id', currentSpace.id);

      toast.success('Speaker approved');
    } catch (err) {
      console.error('Error approving speaker:', err);
    }
  }, [currentSpace, myRole]);

  // Remove speaker (host only)
  const removeSpeaker = useCallback(async (targetWallet: string) => {
    if (!currentSpace || myRole !== 'host') return;

    try {
      await supabase
        .from('space_participants')
        .update({ role: 'listener' })
        .eq('space_id', currentSpace.id)
        .eq('wallet_address', targetWallet);

      // Update counts
      await supabase
        .from('audio_spaces')
        .update({ 
          speaker_count: Math.max(1, (currentSpace.speaker_count || 2) - 1),
          listener_count: (currentSpace.listener_count || 0) + 1
        })
        .eq('id', currentSpace.id);

      toast.success('Speaker removed');
    } catch (err) {
      console.error('Error removing speaker:', err);
    }
  }, [currentSpace, myRole]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!currentSpace) return;

    // Subscribe to participants
    const participantsChannel = supabase
      .channel(`participants:${currentSpace.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'space_participants',
        filter: `space_id=eq.${currentSpace.id}`
      }, (payload) => {
        console.log('Participant change:', payload);
        // Refresh participants list
        supabase
          .from('space_participants')
          .select('*')
          .eq('space_id', currentSpace.id)
          .is('left_at', null)
          .then(({ data }) => {
            if (data) setParticipants(data as SpaceParticipant[]);
          });
      })
      .subscribe();

    // Subscribe to hand requests (for host)
    const handChannel = supabase
      .channel(`hands:${currentSpace.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'raise_hand_requests',
        filter: `space_id=eq.${currentSpace.id}`
      }, (payload) => {
        console.log('Hand request change:', payload);
        // Refresh hand requests
        supabase
          .from('raise_hand_requests')
          .select('*')
          .eq('space_id', currentSpace.id)
          .eq('status', 'pending')
          .then(({ data }) => {
            if (data) setHandRequests(data as RaiseHandRequest[]);
          });
      })
      .subscribe();

    // Subscribe to stage updates (for end detection)
    const spaceChannel = supabase
      .channel(`space:${currentSpace.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'audio_spaces',
        filter: `id=eq.${currentSpace.id}`
      }, (payload) => {
        const updated = payload.new as AudioSpace;
        if (updated.status === 'ended') {
          toast.info('The host ended this stage');
          leaveSpace();
        } else {
          setCurrentSpace(updated);
        }
      })
      .subscribe();

    // Initial fetch
    supabase
      .from('space_participants')
      .select('*')
      .eq('space_id', currentSpace.id)
      .is('left_at', null)
      .then(({ data }) => {
        if (data) setParticipants(data as SpaceParticipant[]);
      });

    if (myRole === 'host') {
      supabase
        .from('raise_hand_requests')
        .select('*')
        .eq('space_id', currentSpace.id)
        .eq('status', 'pending')
        .then(({ data }) => {
          if (data) setHandRequests(data as RaiseHandRequest[]);
        });
    }

    return () => {
      supabase.removeChannel(participantsChannel);
      supabase.removeChannel(handChannel);
      supabase.removeChannel(spaceChannel);
    };
  }, [currentSpace?.id, myRole, leaveSpace]);

  // Fetch live stages on mount
  useEffect(() => {
    refreshSpaces();
    
    // Subscribe to new stages
    const channel = supabase
      .channel('live_spaces')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'audio_spaces'
      }, () => {
        refreshSpaces();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshSpaces]);

  return {
    liveSpaces,
    currentSpace,
    participants,
    handRequests,
    isLoading,
    isConnected,
    isMuted,
    myRole,
    createSpace,
    joinSpace,
    leaveSpace,
    endSpace,
    toggleMute,
    raiseHand,
    lowerHand,
    approveSpeaker,
    removeSpeaker,
    refreshSpaces
  };
}

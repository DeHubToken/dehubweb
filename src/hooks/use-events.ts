/**
 * Events Hooks
 * =============
 * CRUD + RSVP hooks for community_events and community_event_rsvps tables.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface CommunityEvent {
  id: string;
  event_number: number;
  community_id: string | null;
  creator_wallet_address: string;
  creator_username: string | null;
  creator_avatar: string | null;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  going_count: number;
  interested_count: number;
  gate_fee: number;
  is_private: boolean;
  created_at: string;
}

export type RsvpStatus = 'going' | 'interested' | 'pending' | 'approved' | 'denied';

export interface EventRsvp {
  id: string;
  event_id: string;
  wallet_address: string;
  status: RsvpStatus;
  created_at: string;
}

// Fetch events, optionally filtered by community
export function useEvents(communityId?: string | null, filter?: 'upcoming' | 'past' | 'my') {
  const { walletAddress } = useAuth();
  const now = new Date().toISOString();

  return useQuery({
    queryKey: ['events', communityId ?? 'global', filter ?? 'all', walletAddress],
    queryFn: async () => {
      let query = supabase
        .from('community_events')
        .select('*');

      if (communityId) {
        query = query.eq('community_id', communityId);
      } else if (communityId === null) {
        // Standalone page: show all events (both global and community)
      }

      if (filter === 'upcoming') {
        query = query.gte('starts_at', now).order('starts_at', { ascending: true });
      } else if (filter === 'past') {
        query = query.lt('starts_at', now).order('starts_at', { ascending: false });
      } else if (filter === 'my' && walletAddress) {
        query = query.eq('creator_wallet_address', walletAddress.toLowerCase()).order('starts_at', { ascending: false });
      } else {
        query = query.order('starts_at', { ascending: true });
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as CommunityEvent[];
    },
  });
}

// Get a single event
export function useEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_events')
        .select('*')
        .eq('id', eventId!)
        .single();
      if (error) throw error;
      return data as CommunityEvent;
    },
  });
}

// Get user's RSVP for a specific event
export function useEventRsvp(eventId: string | undefined) {
  const { walletAddress } = useAuth();

  return useQuery({
    queryKey: ['event-rsvp', eventId, walletAddress],
    enabled: !!eventId && !!walletAddress,
    queryFn: async () => {
      const { data, error } = await withWalletHeader(
        supabase
          .from('community_event_rsvps')
          .select('*')
          .eq('event_id', eventId!)
          .eq('wallet_address', walletAddress!.toLowerCase())
          .maybeSingle(),
        walletAddress
      );
      if (error) throw error;
      return data as EventRsvp | null;
    },
  });
}

// Get all RSVPs for an event
export function useEventRsvps(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event-rsvps', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_event_rsvps')
        .select('*')
        .eq('event_id', eventId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as EventRsvp[];
    },
  });
}

// Toggle RSVP (going/interested/pending/remove)
export function useToggleRsvp() {
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId, status }: { eventId: string; status: 'going' | 'interested' | 'pending' | 'remove' }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const addr = walletAddress.toLowerCase();

      if (status === 'remove') {
        const { error } = await withWalletHeader(
          supabase
            .from('community_event_rsvps')
            .delete()
            .eq('event_id', eventId)
            .eq('wallet_address', addr),
          walletAddress
        );
        if (error) throw error;
        return null;
      }

      // Upsert
      const { data, error } = await withWalletHeader(
        supabase
          .from('community_event_rsvps')
          .upsert(
            { event_id: eventId, wallet_address: addr, status },
            { onConflict: 'event_id,wallet_address' }
          )
          .select()
          .single(),
        walletAddress
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['event-rsvp', variables.eventId] });
      queryClient.invalidateQueries({ queryKey: ['event-rsvps', variables.eventId] });
      queryClient.invalidateQueries({ queryKey: ['event', variables.eventId] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

// Creator manage RSVP requests (approve/deny)
export function useManageRsvp() {
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ rsvpId, eventId, newStatus }: { rsvpId: string; eventId: string; newStatus: 'approved' | 'denied' }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      // Update the RSVP status — RLS allows event creator to update via wallet header
      const { error } = await withWalletHeader(
        supabase
          .from('community_event_rsvps')
          .update({ status: newStatus } as any)
          .eq('id', rsvpId),
        walletAddress
      );
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['event-rsvps', variables.eventId] });
      queryClient.invalidateQueries({ queryKey: ['event', variables.eventId] });
      toast.success(variables.newStatus === 'approved' ? 'Request approved' : 'Request denied');
    },
  });
}

// Create event
export function useCreateEvent() {
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (event: {
      title: string;
      description?: string;
      location?: string;
      starts_at: string;
      ends_at?: string;
      cover_image_url?: string;
      community_id?: string;
      creator_username?: string;
      creator_avatar?: string;
      gate_fee?: number;
      is_private?: boolean;
    }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const { data, error } = await withWalletHeader(
        supabase
          .from('community_events')
          .insert({
            ...event,
            creator_wallet_address: walletAddress.toLowerCase(),
          })
          .select()
          .single(),
        walletAddress
      );
      if (error) throw error;
      return data as CommunityEvent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success('Event created!');
    },
    onError: () => {
      toast.error('Failed to create event');
    },
  });
}

// Update event (creator only)
export function useUpdateEvent() {
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId, updates }: {
      eventId: string;
      updates: {
        title?: string;
        description?: string | null;
        location?: string | null;
        starts_at?: string;
        ends_at?: string | null;
      };
    }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const { data, error } = await withWalletHeader(
        supabase
          .from('community_events')
          .update(updates)
          .eq('id', eventId)
          .select()
          .single(),
        walletAddress
      );
      if (error) throw error;
      return data as CommunityEvent;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['event', variables.eventId] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success('Event updated!');
    },
    onError: () => {
      toast.error('Failed to update event');
    },
  });
}


// Delete event
export function useDeleteEvent() {
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (eventId: string) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const { error } = await withWalletHeader(
        supabase.from('community_events').delete().eq('id', eventId),
        walletAddress
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success('Event deleted');
    },
  });
}

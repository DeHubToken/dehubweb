import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { messagesKeys } from './use-messages';
import { toast } from 'sonner';

/**
 * Global hook to listen for DM realtime updates across the app.
 * Invalidate conversation lists and threads when new messages arrive.
 */
export function useDMRealtime() {
    const { user, isAuthenticated } = useAuth();
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!isAuthenticated || !user?.address) return;

        const userAddress = user.address.toLowerCase();
        console.log('[useDMRealtime] Subscribing to global DM updates for:', userAddress);

        const channel = supabase
            .channel(`global-dms:${userAddress}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'direct_messages',
                    // No server-side filter — address casing in DB may differ from lowercase userAddress,
                    // causing Supabase's case-sensitive filter to silently miss messages.
                    // We filter client-side instead.
                },
                (payload: any) => {
                    const { sender_address, receiver_address, conversation_id } = payload.new;

                    // Only care if we are the sender or receiver
                    if (
                        sender_address?.toLowerCase() === userAddress ||
                        receiver_address?.toLowerCase() === userAddress
                    ) {
                        console.log('[useDMRealtime] New DM detected:', payload.new);

                        // 1. Invalidate conversations list to show new message/conversation
                        queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() });

                        // 2. Invalidate specific message thread if open
                        if (conversation_id) {
                            queryClient.invalidateQueries({ queryKey: messagesKeys.messages(conversation_id) });
                        }

                        // 3. Show notification toast if it's an incoming message
                        if (receiver_address?.toLowerCase() === userAddress) {
                            const senderName = payload.new.sender_username || payload.new.sender_display_name || 'Someone';
                            const isCurrentChat = window.location.pathname.includes(`/app/messages`) &&
                                (window.location.search.includes(conversation_id) || window.location.search.includes(sender_address));

                            if (!isCurrentChat) {
                                toast(`New message from ${senderName}`, {
                                    description: payload.new.content?.substring(0, 50) + (payload.new.content?.length > 50 ? '...' : ''),
                                });
                            }
                        }
                    }
                }
            )
            .subscribe();

        return () => {
            console.log('[useDMRealtime] Cleaning up global DM subscription');
            supabase.removeChannel(channel);
        };
    }, [isAuthenticated, user?.address, queryClient]);
}

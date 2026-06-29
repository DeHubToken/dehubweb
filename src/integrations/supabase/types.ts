export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      affiliate_codes: {
        Row: {
          active: boolean
          code: string
          commission_pct: number
          created_at: string
          id: string
          owner_address: string
          share_name: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          commission_pct?: number
          created_at?: string
          id?: string
          owner_address: string
          share_name?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          commission_pct?: number
          created_at?: string
          id?: string
          owner_address?: string
          share_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      affiliate_earnings: {
        Row: {
          code: string | null
          commission_cents: number
          created_at: string
          currency: string
          gross_amount_cents: number
          id: string
          owner_address: string
          referred_address: string
          source: string
          source_ref: string | null
          status: string
        }
        Insert: {
          code?: string | null
          commission_cents?: number
          created_at?: string
          currency?: string
          gross_amount_cents?: number
          id?: string
          owner_address: string
          referred_address: string
          source: string
          source_ref?: string | null
          status?: string
        }
        Update: {
          code?: string | null
          commission_cents?: number
          created_at?: string
          currency?: string
          gross_amount_cents?: number
          id?: string
          owner_address?: string
          referred_address?: string
          source?: string
          source_ref?: string | null
          status?: string
        }
        Relationships: []
      }
      affiliate_referrals: {
        Row: {
          code: string
          created_at: string
          id: string
          owner_address: string
          referred_address: string
          source: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          owner_address: string
          referred_address: string
          source?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          owner_address?: string
          referred_address?: string
          source?: string | null
        }
        Relationships: []
      }
      ai_agent_rate_limits: {
        Row: {
          action_type: string
          agent_id: string
          count: number | null
          window_start: string | null
        }
        Insert: {
          action_type: string
          agent_id: string
          count?: number | null
          window_start?: string | null
        }
        Update: {
          action_type?: string
          agent_id?: string
          count?: number | null
          window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_rate_limits_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          api_key: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          last_active_at: string | null
          metadata: Json | null
          name: string
          owner_wallet_address: string
          updated_at: string | null
          wallet_private_key: string | null
        }
        Insert: {
          api_key: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_active_at?: string | null
          metadata?: Json | null
          name: string
          owner_wallet_address: string
          updated_at?: string | null
          wallet_private_key?: string | null
        }
        Update: {
          api_key?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_active_at?: string | null
          metadata?: Json | null
          name?: string
          owner_wallet_address?: string
          updated_at?: string | null
          wallet_private_key?: string | null
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          title: string | null
          updated_at: string
          wallet_address: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          wallet_address: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          wallet_address?: string
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          attached_image: string | null
          audio_url: string | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          image_url: string | null
          role: string
          video_url: string | null
        }
        Insert: {
          attached_image?: string | null
          audio_url?: string | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          image_url?: string | null
          role: string
          video_url?: string | null
        }
        Update: {
          attached_image?: string | null
          audio_url?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          image_url?: string | null
          role?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_user_memories: {
        Row: {
          content: string
          created_at: string
          id: string
          importance: number
          memory_type: string
          updated_at: string
          wallet_address: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          importance?: number
          memory_type?: string
          updated_at?: string
          wallet_address: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          importance?: number
          memory_type?: string
          updated_at?: string
          wallet_address?: string
        }
        Relationships: []
      }
      audio_spaces: {
        Row: {
          channel_name: string
          created_at: string
          description: string | null
          ended_at: string | null
          host_avatar: string | null
          host_username: string | null
          host_wallet_address: string
          id: string
          listener_count: number
          recording_url: string | null
          speaker_count: number
          started_at: string
          status: string
          title: string
          total_listens: number
        }
        Insert: {
          channel_name: string
          created_at?: string
          description?: string | null
          ended_at?: string | null
          host_avatar?: string | null
          host_username?: string | null
          host_wallet_address: string
          id?: string
          listener_count?: number
          recording_url?: string | null
          speaker_count?: number
          started_at?: string
          status?: string
          title: string
          total_listens?: number
        }
        Update: {
          channel_name?: string
          created_at?: string
          description?: string | null
          ended_at?: string | null
          host_avatar?: string | null
          host_username?: string | null
          host_wallet_address?: string
          id?: string
          listener_count?: number
          recording_url?: string | null
          speaker_count?: number
          started_at?: string
          status?: string
          title?: string
          total_listens?: number
        }
        Relationships: []
      }
      buy_bot_state: {
        Row: {
          id: string
          last_block_number: number
          last_tx_hashes: string[]
          updated_at: string
        }
        Insert: {
          id?: string
          last_block_number?: number
          last_tx_hashes?: string[]
          updated_at?: string
        }
        Update: {
          id?: string
          last_block_number?: number
          last_tx_hashes?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      call_sessions: {
        Row: {
          call_type: string
          caller_address: string
          created_at: string
          id: string
          recipient_address: string
          signaling_data: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          call_type: string
          caller_address: string
          created_at?: string
          id?: string
          recipient_address: string
          signaling_data?: Json | null
          status: string
          updated_at?: string
        }
        Update: {
          call_type?: string
          caller_address?: string
          created_at?: string
          id?: string
          recipient_address?: string
          signaling_data?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      callback_requests: {
        Row: {
          call_type: string
          created_at: string
          expires_at: string
          id: string
          message: string | null
          recipient_address: string
          requester_address: string
          status: string
          updated_at: string
        }
        Insert: {
          call_type: string
          created_at?: string
          expires_at?: string
          id?: string
          message?: string | null
          recipient_address: string
          requester_address: string
          status?: string
          updated_at?: string
        }
        Update: {
          call_type?: string
          created_at?: string
          expires_at?: string
          id?: string
          message?: string | null
          recipient_address?: string
          requester_address?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      category_post_log: {
        Row: {
          id: string
          name: string
          posted_at: string
          token_id: number | null
        }
        Insert: {
          id?: string
          name: string
          posted_at?: string
          token_id?: number | null
        }
        Update: {
          id?: string
          name?: string
          posted_at?: string
          token_id?: number | null
        }
        Relationships: []
      }
      client_error_logs: {
        Row: {
          component: string | null
          created_at: string | null
          id: string
          level: string
          message: string
          metadata: Json | null
          stack_trace: string | null
          user_address: string | null
        }
        Insert: {
          component?: string | null
          created_at?: string | null
          id?: string
          level: string
          message: string
          metadata?: Json | null
          stack_trace?: string | null
          user_address?: string | null
        }
        Update: {
          component?: string | null
          created_at?: string | null
          id?: string
          level?: string
          message?: string
          metadata?: Json | null
          stack_trace?: string | null
          user_address?: string | null
        }
        Relationships: []
      }
      communities: {
        Row: {
          avatar_url: string | null
          banner_url: string | null
          created_at: string
          creator_wallet_address: string
          description: string | null
          id: string
          is_private: boolean
          member_count: number
          name: string
          rules: Json | null
          slug: string
          ticker_chain_id: string | null
          ticker_contract_address: string | null
          ticker_pair_address: string | null
          ticker_symbol: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          banner_url?: string | null
          created_at?: string
          creator_wallet_address: string
          description?: string | null
          id?: string
          is_private?: boolean
          member_count?: number
          name: string
          rules?: Json | null
          slug: string
          ticker_chain_id?: string | null
          ticker_contract_address?: string | null
          ticker_pair_address?: string | null
          ticker_symbol?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          banner_url?: string | null
          created_at?: string
          creator_wallet_address?: string
          description?: string | null
          id?: string
          is_private?: boolean
          member_count?: number
          name?: string
          rules?: Json | null
          slug?: string
          ticker_chain_id?: string | null
          ticker_contract_address?: string | null
          ticker_pair_address?: string | null
          ticker_symbol?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      community_chat_messages: {
        Row: {
          avatar_url: string | null
          badge_balance: number | null
          community_id: string
          content: string
          created_at: string
          display_name: string | null
          id: string
          image_url: string | null
          message_type: string
          reactions: Json | null
          reply_to_id: string | null
          username: string | null
          wallet_address: string
        }
        Insert: {
          avatar_url?: string | null
          badge_balance?: number | null
          community_id: string
          content?: string
          created_at?: string
          display_name?: string | null
          id?: string
          image_url?: string | null
          message_type?: string
          reactions?: Json | null
          reply_to_id?: string | null
          username?: string | null
          wallet_address: string
        }
        Update: {
          avatar_url?: string | null
          badge_balance?: number | null
          community_id?: string
          content?: string
          created_at?: string
          display_name?: string | null
          id?: string
          image_url?: string | null
          message_type?: string
          reactions?: Json | null
          reply_to_id?: string | null
          username?: string | null
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_chat_messages_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_chat_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "community_chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      community_event_rsvps: {
        Row: {
          created_at: string
          event_id: string
          id: string
          status: string
          wallet_address: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          status?: string
          wallet_address: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          status?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "community_events"
            referencedColumns: ["id"]
          },
        ]
      }
      community_events: {
        Row: {
          community_id: string | null
          cover_image_url: string | null
          created_at: string
          creator_avatar: string | null
          creator_username: string | null
          creator_wallet_address: string
          description: string | null
          ends_at: string | null
          event_number: number
          gate_fee: number
          going_count: number
          id: string
          interested_count: number
          is_private: boolean
          location: string | null
          starts_at: string
          title: string
        }
        Insert: {
          community_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          creator_avatar?: string | null
          creator_username?: string | null
          creator_wallet_address: string
          description?: string | null
          ends_at?: string | null
          event_number?: number
          gate_fee?: number
          going_count?: number
          id?: string
          interested_count?: number
          is_private?: boolean
          location?: string | null
          starts_at: string
          title: string
        }
        Update: {
          community_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          creator_avatar?: string | null
          creator_username?: string | null
          creator_wallet_address?: string
          description?: string | null
          ends_at?: string | null
          event_number?: number
          gate_fee?: number
          going_count?: number
          id?: string
          interested_count?: number
          is_private?: boolean
          location?: string | null
          starts_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_events_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_members: {
        Row: {
          community_id: string
          id: string
          joined_at: string
          role: string
          status: string
          wallet_address: string
        }
        Insert: {
          community_id: string
          id?: string
          joined_at?: string
          role?: string
          status?: string
          wallet_address: string
        }
        Update: {
          community_id?: string
          id?: string
          joined_at?: string
          role?: string
          status?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_members_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_applications: {
        Row: {
          created_at: string
          email: string
          expected_compensation: string
          id: string
          instagram_username: string | null
          other_socials: string | null
          total_follower_reach: string
          twitch_username: string | null
          x_username: string | null
          youtube_username: string | null
        }
        Insert: {
          created_at?: string
          email: string
          expected_compensation: string
          id?: string
          instagram_username?: string | null
          other_socials?: string | null
          total_follower_reach: string
          twitch_username?: string | null
          x_username?: string | null
          youtube_username?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          expected_compensation?: string
          id?: string
          instagram_username?: string | null
          other_socials?: string | null
          total_follower_reach?: string
          twitch_username?: string | null
          x_username?: string | null
          youtube_username?: string | null
        }
        Relationships: []
      }
      custom_notifications: {
        Row: {
          actor_address: string
          actor_avatar: string | null
          actor_username: string | null
          content: string
          created_at: string
          id: string
          read: boolean
          recipient_address: string
          reference_id: string | null
          reference_title: string | null
          type: string
        }
        Insert: {
          actor_address: string
          actor_avatar?: string | null
          actor_username?: string | null
          content?: string
          created_at?: string
          id?: string
          read?: boolean
          recipient_address: string
          reference_id?: string | null
          reference_title?: string | null
          type?: string
        }
        Update: {
          actor_address?: string
          actor_avatar?: string | null
          actor_username?: string | null
          content?: string
          created_at?: string
          id?: string
          read?: boolean
          recipient_address?: string
          reference_id?: string | null
          reference_title?: string | null
          type?: string
        }
        Relationships: []
      }
      custom_voices: {
        Row: {
          created_at: string | null
          elevenlabs_voice_id: string
          id: string
          name: string
          wallet_address: string
        }
        Insert: {
          created_at?: string | null
          elevenlabs_voice_id: string
          id?: string
          name: string
          wallet_address: string
        }
        Update: {
          created_at?: string | null
          elevenlabs_voice_id?: string
          id?: string
          name?: string
          wallet_address?: string
        }
        Relationships: []
      }
      event_chat_messages: {
        Row: {
          avatar_url: string | null
          badge_balance: number | null
          content: string
          created_at: string
          display_name: string | null
          event_id: string
          id: string
          image_url: string | null
          message_type: string
          reactions: Json | null
          reply_to_id: string | null
          username: string | null
          wallet_address: string
        }
        Insert: {
          avatar_url?: string | null
          badge_balance?: number | null
          content?: string
          created_at?: string
          display_name?: string | null
          event_id: string
          id?: string
          image_url?: string | null
          message_type?: string
          reactions?: Json | null
          reply_to_id?: string | null
          username?: string | null
          wallet_address: string
        }
        Update: {
          avatar_url?: string | null
          badge_balance?: number | null
          content?: string
          created_at?: string
          display_name?: string | null
          event_id?: string
          id?: string
          image_url?: string | null
          message_type?: string
          reactions?: Json | null
          reply_to_id?: string | null
          username?: string | null
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_chat_messages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "community_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_chat_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "event_chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      event_gate_payments: {
        Row: {
          amount: number
          chain_id: number
          created_at: string
          creator_wallet_address: string
          event_id: string
          id: string
          payer_wallet_address: string
          tx_hash: string
        }
        Insert: {
          amount: number
          chain_id?: number
          created_at?: string
          creator_wallet_address: string
          event_id: string
          id?: string
          payer_wallet_address: string
          tx_hash: string
        }
        Update: {
          amount?: number
          chain_id?: number
          created_at?: string
          creator_wallet_address?: string
          event_id?: string
          id?: string
          payer_wallet_address?: string
          tx_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_gate_payments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "community_events"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_request_comments: {
        Row: {
          avatar: string | null
          content: string
          created_at: string
          feature_request_id: string
          id: string
          username: string | null
          wallet_address: string
        }
        Insert: {
          avatar?: string | null
          content: string
          created_at?: string
          feature_request_id: string
          id?: string
          username?: string | null
          wallet_address: string
        }
        Update: {
          avatar?: string | null
          content?: string
          created_at?: string
          feature_request_id?: string
          id?: string
          username?: string | null
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_request_comments_feature_request_id_fkey"
            columns: ["feature_request_id"]
            isOneToOne: false
            referencedRelation: "feature_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_request_votes: {
        Row: {
          created_at: string
          feature_request_id: string
          id: string
          vote_type: number
          wallet_address: string
        }
        Insert: {
          created_at?: string
          feature_request_id: string
          id?: string
          vote_type: number
          wallet_address: string
        }
        Update: {
          created_at?: string
          feature_request_id?: string
          id?: string
          vote_type?: number
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_request_votes_feature_request_id_fkey"
            columns: ["feature_request_id"]
            isOneToOne: false
            referencedRelation: "feature_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_requests: {
        Row: {
          author_avatar: string | null
          author_username: string | null
          author_wallet_address: string
          category: string
          comment_count: number
          created_at: string
          description: string
          dislike_count: number
          id: string
          image_url: string | null
          like_count: number
          status: string
          title: string
          updated_at: string
          vote_count: number
        }
        Insert: {
          author_avatar?: string | null
          author_username?: string | null
          author_wallet_address: string
          category?: string
          comment_count?: number
          created_at?: string
          description: string
          dislike_count?: number
          id?: string
          image_url?: string | null
          like_count?: number
          status?: string
          title: string
          updated_at?: string
          vote_count?: number
        }
        Update: {
          author_avatar?: string | null
          author_username?: string | null
          author_wallet_address?: string
          category?: string
          comment_count?: number
          created_at?: string
          description?: string
          dislike_count?: number
          id?: string
          image_url?: string | null
          like_count?: number
          status?: string
          title?: string
          updated_at?: string
          vote_count?: number
        }
        Relationships: []
      }
      fraction_listings: {
        Row: {
          chain_id: number
          created_at: string
          filled_quantity: number
          id: string
          price_per_fraction: number
          quantity: number
          seller_address: string
          status: string
          token_id: string
          updated_at: string
        }
        Insert: {
          chain_id?: number
          created_at?: string
          filled_quantity?: number
          id?: string
          price_per_fraction: number
          quantity: number
          seller_address: string
          status?: string
          token_id: string
          updated_at?: string
        }
        Update: {
          chain_id?: number
          created_at?: string
          filled_quantity?: number
          id?: string
          price_per_fraction?: number
          quantity?: number
          seller_address?: string
          status?: string
          token_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      fraction_offers: {
        Row: {
          buyer_address: string
          chain_id: number
          created_at: string
          id: string
          listing_id: string | null
          price_per_fraction: number
          quantity: number
          status: string
          target_seller: string | null
          token_id: string
          tx_hash: string | null
          updated_at: string
        }
        Insert: {
          buyer_address: string
          chain_id?: number
          created_at?: string
          id?: string
          listing_id?: string | null
          price_per_fraction: number
          quantity: number
          status?: string
          target_seller?: string | null
          token_id: string
          tx_hash?: string | null
          updated_at?: string
        }
        Update: {
          buyer_address?: string
          chain_id?: number
          created_at?: string
          id?: string
          listing_id?: string | null
          price_per_fraction?: number
          quantity?: number
          status?: string
          target_seller?: string | null
          token_id?: string
          tx_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fraction_offers_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "fraction_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      fraction_trades: {
        Row: {
          buyer_address: string
          chain_id: number
          created_at: string
          id: string
          listing_id: string | null
          offer_id: string | null
          price_per_fraction: number
          quantity: number
          seller_address: string
          token_id: string
          total_dhb: number
          tx_hash: string | null
        }
        Insert: {
          buyer_address: string
          chain_id?: number
          created_at?: string
          id?: string
          listing_id?: string | null
          offer_id?: string | null
          price_per_fraction: number
          quantity: number
          seller_address: string
          token_id: string
          total_dhb: number
          tx_hash?: string | null
        }
        Update: {
          buyer_address?: string
          chain_id?: number
          created_at?: string
          id?: string
          listing_id?: string | null
          offer_id?: string | null
          price_per_fraction?: number
          quantity?: number
          seller_address?: string
          token_id?: string
          total_dhb?: number
          tx_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fraction_trades_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "fraction_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraction_trades_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "fraction_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      governance_comments: {
        Row: {
          avatar: string | null
          content: string
          created_at: string
          id: string
          proposal_id: string
          username: string | null
          wallet_address: string
        }
        Insert: {
          avatar?: string | null
          content: string
          created_at?: string
          id?: string
          proposal_id: string
          username?: string | null
          wallet_address: string
        }
        Update: {
          avatar?: string | null
          content?: string
          created_at?: string
          id?: string
          proposal_id?: string
          username?: string | null
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "governance_comments_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "governance_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      governance_proposals: {
        Row: {
          author_avatar: string | null
          author_username: string | null
          author_wallet_address: string
          comment_count: number
          created_at: string
          description: string
          dislike_count: number
          id: string
          like_count: number
          status: string
          title: string
          updated_at: string
          vote_count: number
        }
        Insert: {
          author_avatar?: string | null
          author_username?: string | null
          author_wallet_address: string
          comment_count?: number
          created_at?: string
          description: string
          dislike_count?: number
          id?: string
          like_count?: number
          status?: string
          title: string
          updated_at?: string
          vote_count?: number
        }
        Update: {
          author_avatar?: string | null
          author_username?: string | null
          author_wallet_address?: string
          comment_count?: number
          created_at?: string
          description?: string
          dislike_count?: number
          id?: string
          like_count?: number
          status?: string
          title?: string
          updated_at?: string
          vote_count?: number
        }
        Relationships: []
      }
      governance_votes: {
        Row: {
          badge_name: string | null
          created_at: string
          id: string
          proposal_id: string
          vote_type: number
          vote_weight: number
          wallet_address: string
        }
        Insert: {
          badge_name?: string | null
          created_at?: string
          id?: string
          proposal_id: string
          vote_type: number
          vote_weight?: number
          wallet_address: string
        }
        Update: {
          badge_name?: string | null
          created_at?: string
          id?: string
          proposal_id?: string
          vote_type?: number
          vote_weight?: number
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "governance_votes_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "governance_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      job_applications: {
        Row: {
          created_at: string
          email: string
          id: string
          instagram: string | null
          linkedin: string | null
          name: string
          other_socials: string | null
          past_experience: string | null
          role: string
          telegram: string | null
          twitter: string | null
          why_hire_you: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          instagram?: string | null
          linkedin?: string | null
          name: string
          other_socials?: string | null
          past_experience?: string | null
          role: string
          telegram?: string | null
          twitter?: string | null
          why_hire_you?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          instagram?: string | null
          linkedin?: string | null
          name?: string
          other_socials?: string | null
          past_experience?: string | null
          role?: string
          telegram?: string | null
          twitter?: string | null
          why_hire_you?: string | null
        }
        Relationships: []
      }
      launchpad_tokens: {
        Row: {
          chain_id: number
          created_at: string
          creator_address: string
          curve_type: string
          description: string | null
          graduation_target_usd: number
          id: string
          image_url: string | null
          market_cap_usd: number
          mint_address: string | null
          name: string
          progress_bps: number
          socials: Json
          status: string
          supply_sold: number
          symbol: string
          updated_at: string
          volume_24h: number
        }
        Insert: {
          chain_id?: number
          created_at?: string
          creator_address: string
          curve_type?: string
          description?: string | null
          graduation_target_usd?: number
          id?: string
          image_url?: string | null
          market_cap_usd?: number
          mint_address?: string | null
          name: string
          progress_bps?: number
          socials?: Json
          status?: string
          supply_sold?: number
          symbol: string
          updated_at?: string
          volume_24h?: number
        }
        Update: {
          chain_id?: number
          created_at?: string
          creator_address?: string
          curve_type?: string
          description?: string | null
          graduation_target_usd?: number
          id?: string
          image_url?: string | null
          market_cap_usd?: number
          mint_address?: string | null
          name?: string
          progress_bps?: number
          socials?: Json
          status?: string
          supply_sold?: number
          symbol?: string
          updated_at?: string
          volume_24h?: number
        }
        Relationships: []
      }
      launchpad_trades: {
        Row: {
          created_at: string
          dhb_in: number
          id: string
          price_per_token: number
          side: string
          token_id: string
          tokens_out: number
          trader_address: string
          tx_hash: string | null
        }
        Insert: {
          created_at?: string
          dhb_in: number
          id?: string
          price_per_token: number
          side: string
          token_id: string
          tokens_out: number
          trader_address: string
          tx_hash?: string | null
        }
        Update: {
          created_at?: string
          dhb_in?: number
          id?: string
          price_per_token?: number
          side?: string
          token_id?: string
          tokens_out?: number
          trader_address?: string
          tx_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "launchpad_trades_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "launchpad_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_cache: {
        Row: {
          data: Json
          id: string
          period: string
          sort_mode: string
          updated_at: string
        }
        Insert: {
          data: Json
          id?: string
          period: string
          sort_mode: string
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: string
          period?: string
          sort_mode?: string
          updated_at?: string
        }
        Relationships: []
      }
      leaderboard_snapshots: {
        Row: {
          account: string
          balance: number
          created_at: string
          followers: number | null
          id: string
          likes: number | null
          received_tips: number
          sent_tips: number
          snapshot_date: string
          subscribers: number | null
        }
        Insert: {
          account: string
          balance?: number
          created_at?: string
          followers?: number | null
          id?: string
          likes?: number | null
          received_tips?: number
          sent_tips?: number
          snapshot_date?: string
          subscribers?: number | null
        }
        Update: {
          account?: string
          balance?: number
          created_at?: string
          followers?: number | null
          id?: string
          likes?: number | null
          received_tips?: number
          sent_tips?: number
          snapshot_date?: string
          subscribers?: number | null
        }
        Relationships: []
      }
      live_stream_sessions: {
        Row: {
          address: string
          started_at: string
          stream_id: string | null
          token_id: string
        }
        Insert: {
          address: string
          started_at?: string
          stream_id?: string | null
          token_id: string
        }
        Update: {
          address?: string
          started_at?: string
          stream_id?: string | null
          token_id?: string
        }
        Relationships: []
      }
      pinned_communities: {
        Row: {
          community_id: string
          created_at: string
          display_order: number
          id: string
          wallet_address: string
        }
        Insert: {
          community_id: string
          created_at?: string
          display_order?: number
          id?: string
          wallet_address: string
        }
        Update: {
          community_id?: string
          created_at?: string
          display_order?: number
          id?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "pinned_communities_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      post_drafts: {
        Row: {
          created_at: string
          description: string
          has_image: boolean
          has_video: boolean
          id: string
          metadata: Json | null
          selected_category: string
          text: string
          title_text: string
          updated_at: string
          wallet_address: string
        }
        Insert: {
          created_at?: string
          description?: string
          has_image?: boolean
          has_video?: boolean
          id?: string
          metadata?: Json | null
          selected_category?: string
          text?: string
          title_text?: string
          updated_at?: string
          wallet_address: string
        }
        Update: {
          created_at?: string
          description?: string
          has_image?: boolean
          has_video?: boolean
          id?: string
          metadata?: Json | null
          selected_category?: string
          text?: string
          title_text?: string
          updated_at?: string
          wallet_address?: string
        }
        Relationships: []
      }
      ppv_purchases: {
        Row: {
          amount: number
          buyer_address: string
          chain_id: number
          created_at: string
          creator_address: string
          currency: string
          id: string
          token_id: string
          tx_hash: string
        }
        Insert: {
          amount: number
          buyer_address: string
          chain_id?: number
          created_at?: string
          creator_address: string
          currency?: string
          id?: string
          token_id: string
          tx_hash: string
        }
        Update: {
          amount?: number
          buyer_address?: string
          chain_id?: number
          created_at?: string
          creator_address?: string
          currency?: string
          id?: string
          token_id?: string
          tx_hash?: string
        }
        Relationships: []
      }
      raise_hand_requests: {
        Row: {
          avatar: string | null
          created_at: string
          id: string
          resolved_at: string | null
          space_id: string
          status: string
          username: string | null
          wallet_address: string
        }
        Insert: {
          avatar?: string | null
          created_at?: string
          id?: string
          resolved_at?: string | null
          space_id: string
          status?: string
          username?: string | null
          wallet_address: string
        }
        Update: {
          avatar?: string | null
          created_at?: string
          id?: string
          resolved_at?: string | null
          space_id?: string
          status?: string
          username?: string | null
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "raise_hand_requests_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "audio_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_addresses: {
        Row: {
          address_line1: string
          address_line2: string | null
          city: string
          country: string
          created_at: string
          full_name: string
          id: string
          is_default: boolean
          label: string
          postal_code: string
          state: string
          updated_at: string
          wallet_address: string
        }
        Insert: {
          address_line1?: string
          address_line2?: string | null
          city?: string
          country?: string
          created_at?: string
          full_name?: string
          id?: string
          is_default?: boolean
          label?: string
          postal_code?: string
          state?: string
          updated_at?: string
          wallet_address: string
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          city?: string
          country?: string
          created_at?: string
          full_name?: string
          id?: string
          is_default?: boolean
          label?: string
          postal_code?: string
          state?: string
          updated_at?: string
          wallet_address?: string
        }
        Relationships: []
      }
      space_participants: {
        Row: {
          avatar: string | null
          hand_raised: boolean
          id: string
          is_muted: boolean
          joined_at: string
          left_at: string | null
          role: string
          space_id: string
          username: string | null
          wallet_address: string
        }
        Insert: {
          avatar?: string | null
          hand_raised?: boolean
          id?: string
          is_muted?: boolean
          joined_at?: string
          left_at?: string | null
          role?: string
          space_id: string
          username?: string | null
          wallet_address: string
        }
        Update: {
          avatar?: string | null
          hand_raised?: boolean
          id?: string
          is_muted?: boolean
          joined_at?: string
          left_at?: string | null
          role?: string
          space_id?: string
          username?: string | null
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_participants_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "audio_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_transcript_translations: {
        Row: {
          chapters: Json
          created_at: string
          error: string | null
          id: string
          language: string
          segments: Json
          stage_id: string
          status: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          chapters?: Json
          created_at?: string
          error?: string | null
          id?: string
          language: string
          segments?: Json
          stage_id: string
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          chapters?: Json
          created_at?: string
          error?: string | null
          id?: string
          language?: string
          segments?: Json
          stage_id?: string
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      stage_transcripts: {
        Row: {
          chapters: Json
          created_at: string
          error: string | null
          full_text: string | null
          id: string
          privacy: string
          segments: Json
          source_language: string | null
          speaker_map: Json
          speaker_overrides: Json
          speaker_timeline: Json
          stage_id: string
          status: string
          summary: string | null
          summary_status: string
          updated_at: string
        }
        Insert: {
          chapters?: Json
          created_at?: string
          error?: string | null
          full_text?: string | null
          id?: string
          privacy?: string
          segments?: Json
          source_language?: string | null
          speaker_map?: Json
          speaker_overrides?: Json
          speaker_timeline?: Json
          stage_id: string
          status?: string
          summary?: string | null
          summary_status?: string
          updated_at?: string
        }
        Update: {
          chapters?: Json
          created_at?: string
          error?: string | null
          full_text?: string | null
          id?: string
          privacy?: string
          segments?: Json
          source_language?: string | null
          speaker_map?: Json
          speaker_overrides?: Json
          speaker_timeline?: Json
          stage_id?: string
          status?: string
          summary?: string | null
          summary_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      staking_records: {
        Row: {
          action: string
          amount: number
          chain: string
          created_at: string
          id: string
          tx_hash: string
          wallet_address: string
        }
        Insert: {
          action?: string
          amount: number
          chain: string
          created_at?: string
          id?: string
          tx_hash: string
          wallet_address: string
        }
        Update: {
          action?: string
          amount?: number
          chain?: string
          created_at?: string
          id?: string
          tx_hash?: string
          wallet_address?: string
        }
        Relationships: []
      }
      store_listings: {
        Row: {
          category: string
          condition: string | null
          created_at: string
          currency: string
          description: string | null
          digital_file_url: string | null
          id: string
          images: Json | null
          is_digital: boolean
          price: number
          shipping_info: string | null
          status: string
          stock_quantity: number | null
          store_id: string
          title: string
          updated_at: string
          wallet_address: string
        }
        Insert: {
          category?: string
          condition?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          digital_file_url?: string | null
          id?: string
          images?: Json | null
          is_digital?: boolean
          price: number
          shipping_info?: string | null
          status?: string
          stock_quantity?: number | null
          store_id: string
          title: string
          updated_at?: string
          wallet_address: string
        }
        Update: {
          category?: string
          condition?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          digital_file_url?: string | null
          id?: string
          images?: Json | null
          is_digital?: boolean
          price?: number
          shipping_info?: string | null
          status?: string
          stock_quantity?: number | null
          store_id?: string
          title?: string
          updated_at?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_listings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_orders: {
        Row: {
          amount: number
          buyer_address: string
          created_at: string
          id: string
          listing_id: string
          notes: string | null
          seller_address: string
          shipping_address: string | null
          status: string
          tx_hash: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          buyer_address: string
          created_at?: string
          id?: string
          listing_id: string
          notes?: string | null
          seller_address: string
          shipping_address?: string | null
          status?: string
          tx_hash?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          buyer_address?: string
          created_at?: string
          id?: string
          listing_id?: string
          notes?: string | null
          seller_address?: string
          shipping_address?: string | null
          status?: string
          tx_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_orders_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "store_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      store_reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          listing_id: string
          rating: number
          reviewer_address: string
          seller_response: string | null
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          listing_id: string
          rating: number
          reviewer_address: string
          seller_response?: string | null
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          listing_id?: string
          rating?: number
          reviewer_address?: string
          seller_response?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_reviews_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "store_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          avatar_url: string | null
          banner_url: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string | null
          updated_at: string
          wallet_address: string
        }
        Insert: {
          avatar_url?: string | null
          banner_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string | null
          updated_at?: string
          wallet_address: string
        }
        Update: {
          avatar_url?: string | null
          banner_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string | null
          updated_at?: string
          wallet_address?: string
        }
        Relationships: []
      }
      stories: {
        Row: {
          avatar: string | null
          created_at: string
          expires_at: string
          id: string
          thumbnail_url: string | null
          username: string | null
          video_url: string
          wallet_address: string
        }
        Insert: {
          avatar?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          thumbnail_url?: string | null
          username?: string | null
          video_url: string
          wallet_address: string
        }
        Update: {
          avatar?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          thumbnail_url?: string | null
          username?: string | null
          video_url?: string
          wallet_address?: string
        }
        Relationships: []
      }
      story_comments: {
        Row: {
          avatar: string | null
          content: string
          created_at: string
          id: string
          parent_id: string | null
          story_id: string
          username: string | null
          wallet_address: string
        }
        Insert: {
          avatar?: string | null
          content: string
          created_at?: string
          id?: string
          parent_id?: string | null
          story_id: string
          username?: string | null
          wallet_address: string
        }
        Update: {
          avatar?: string | null
          content?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          story_id?: string
          username?: string | null
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "story_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_comments_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_reactions: {
        Row: {
          created_at: string
          id: string
          reaction_type: string
          story_id: string
          wallet_address: string
        }
        Insert: {
          created_at?: string
          id?: string
          reaction_type: string
          story_id: string
          wallet_address: string
        }
        Update: {
          created_at?: string
          id?: string
          reaction_type?: string
          story_id?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_reactions_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_views: {
        Row: {
          id: string
          story_id: string
          viewed_at: string
          viewer_wallet_address: string | null
        }
        Insert: {
          id?: string
          story_id: string
          viewed_at?: string
          viewer_wallet_address?: string | null
        }
        Update: {
          id?: string
          story_id?: string
          viewed_at?: string
          viewer_wallet_address?: string | null
        }
        Relationships: []
      }
      suggested_profiles_cache: {
        Row: {
          address: string
          avatar_url: string | null
          badge_balance: number | null
          display_name: string | null
          followers: number | null
          id: string
          likes: number | null
          updated_at: string | null
          username: string | null
        }
        Insert: {
          address: string
          avatar_url?: string | null
          badge_balance?: number | null
          display_name?: string | null
          followers?: number | null
          id?: string
          likes?: number | null
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          address?: string
          avatar_url?: string | null
          badge_balance?: number | null
          display_name?: string | null
          followers?: number | null
          id?: string
          likes?: number | null
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
      ticker_search_log: {
        Row: {
          id: string
          searched_at: string
          symbol: string
        }
        Insert: {
          id?: string
          searched_at?: string
          symbol: string
        }
        Update: {
          id?: string
          searched_at?: string
          symbol?: string
        }
        Relationships: []
      }
      ticker_searches: {
        Row: {
          last_searched_at: string
          search_count: number
          symbol: string
        }
        Insert: {
          last_searched_at?: string
          search_count?: number
          symbol: string
        }
        Update: {
          last_searched_at?: string
          search_count?: number
          symbol?: string
        }
        Relationships: []
      }
      tip_leaderboard_cache: {
        Row: {
          chain_id: number
          id: string
          period: string
          received_total: number
          sent_total: number
          updated_at: string
          wallet_address: string
        }
        Insert: {
          chain_id?: number
          id?: string
          period?: string
          received_total?: number
          sent_total?: number
          updated_at?: string
          wallet_address: string
        }
        Update: {
          chain_id?: number
          id?: string
          period?: string
          received_total?: number
          sent_total?: number
          updated_at?: string
          wallet_address?: string
        }
        Relationships: []
      }
      tip_records: {
        Row: {
          amount: number
          chain_id: number
          created_at: string
          id: string
          receiver_address: string
          sender_address: string
          token_id: string | null
          tx_hash: string
        }
        Insert: {
          amount: number
          chain_id?: number
          created_at?: string
          id?: string
          receiver_address: string
          sender_address: string
          token_id?: string | null
          tx_hash: string
        }
        Update: {
          amount?: number
          chain_id?: number
          created_at?: string
          id?: string
          receiver_address?: string
          sender_address?: string
          token_id?: string | null
          tx_hash?: string
        }
        Relationships: []
      }
      trending_categories: {
        Row: {
          id: string
          name: string
          post_count: number
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          post_count?: number
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          post_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      tv_channels_verified: {
        Row: {
          broken_reports: number
          category: string
          country: string
          id: string
          is_active: boolean
          last_verified_at: string
          logo: string | null
          name: string
          stream_url: string
        }
        Insert: {
          broken_reports?: number
          category?: string
          country?: string
          id: string
          is_active?: boolean
          last_verified_at?: string
          logo?: string | null
          name: string
          stream_url: string
        }
        Update: {
          broken_reports?: number
          category?: string
          country?: string
          id?: string
          is_active?: boolean
          last_verified_at?: string
          logo?: string | null
          name?: string
          stream_url?: string
        }
        Relationships: []
      }
      user_feedback_surveys: {
        Row: {
          age_range: string | null
          created_at: string
          gender: string | null
          id: string
          referral_source: string | null
          signup_experience: string | null
          tipping_or_gifting: string | null
          wallet_address: string
        }
        Insert: {
          age_range?: string | null
          created_at?: string
          gender?: string | null
          id?: string
          referral_source?: string | null
          signup_experience?: string | null
          tipping_or_gifting?: string | null
          wallet_address: string
        }
        Update: {
          age_range?: string | null
          created_at?: string
          gender?: string | null
          id?: string
          referral_source?: string | null
          signup_experience?: string | null
          tipping_or_gifting?: string | null
          wallet_address?: string
        }
        Relationships: []
      }
      user_privacy_settings: {
        Row: {
          created_at: string
          default_post_visibility: string
          hide_follower_counts: boolean
          id: string
          show_followers_following: boolean
          updated_at: string
          wallet_address: string
        }
        Insert: {
          created_at?: string
          default_post_visibility?: string
          hide_follower_counts?: boolean
          id?: string
          show_followers_following?: boolean
          updated_at?: string
          wallet_address: string
        }
        Update: {
          created_at?: string
          default_post_visibility?: string
          hide_follower_counts?: boolean
          id?: string
          show_followers_following?: boolean
          updated_at?: string
          wallet_address?: string
        }
        Relationships: []
      }
      video_transcripts: {
        Row: {
          chunks_done: number | null
          chunks_total: number | null
          created_at: string
          duration_seconds: number | null
          error: string | null
          model: string | null
          overview: string | null
          source_lang: string | null
          status: string
          token_id: number
          transcript: Json | null
          translations: Json
          updated_at: string
          vtt_original: string | null
        }
        Insert: {
          chunks_done?: number | null
          chunks_total?: number | null
          created_at?: string
          duration_seconds?: number | null
          error?: string | null
          model?: string | null
          overview?: string | null
          source_lang?: string | null
          status?: string
          token_id: number
          transcript?: Json | null
          translations?: Json
          updated_at?: string
          vtt_original?: string | null
        }
        Update: {
          chunks_done?: number | null
          chunks_total?: number | null
          created_at?: string
          duration_seconds?: number | null
          error?: string | null
          model?: string | null
          overview?: string | null
          source_lang?: string | null
          status?: string
          token_id?: number
          transcript?: Json | null
          translations?: Json
          updated_at?: string
          vtt_original?: string | null
        }
        Relationships: []
      }
      winter_wonderland_results: {
        Row: {
          created_at: string
          draw_date: string
          id: string
          results: Json
        }
        Insert: {
          created_at?: string
          draw_date?: string
          id?: string
          results: Json
        }
        Update: {
          created_at?: string
          draw_date?: string
          id?: string
          results?: Json
        }
        Relationships: []
      }
      work_applications: {
        Row: {
          applicant_address: string
          cover_letter: string
          created_at: string
          id: string
          job_id: string
          proposed_amount: number | null
          status: Database["public"]["Enums"]["work_app_status"]
          updated_at: string
        }
        Insert: {
          applicant_address: string
          cover_letter?: string
          created_at?: string
          id?: string
          job_id: string
          proposed_amount?: number | null
          status?: Database["public"]["Enums"]["work_app_status"]
          updated_at?: string
        }
        Update: {
          applicant_address?: string
          cover_letter?: string
          created_at?: string
          id?: string
          job_id?: string
          proposed_amount?: number | null
          status?: Database["public"]["Enums"]["work_app_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "work_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      work_disputes: {
        Row: {
          created_at: string
          evidence_url: string | null
          id: string
          job_id: string
          opened_by_address: string
          poster_refund: number | null
          reason: string
          resolution_note: string | null
          resolution_tx_hash: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["work_dispute_status"]
          updated_at: string
          worker_amount: number | null
        }
        Insert: {
          created_at?: string
          evidence_url?: string | null
          id?: string
          job_id: string
          opened_by_address: string
          poster_refund?: number | null
          reason: string
          resolution_note?: string | null
          resolution_tx_hash?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["work_dispute_status"]
          updated_at?: string
          worker_amount?: number | null
        }
        Update: {
          created_at?: string
          evidence_url?: string | null
          id?: string
          job_id?: string
          opened_by_address?: string
          poster_refund?: number | null
          reason?: string
          resolution_note?: string | null
          resolution_tx_hash?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["work_dispute_status"]
          updated_at?: string
          worker_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "work_disputes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "work_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      work_jobs: {
        Row: {
          application_count: number
          awarded_worker_address: string | null
          boost_expires_at: string | null
          cover_image_url: string | null
          created_at: string
          currency: Database["public"]["Enums"]["work_currency"]
          deadline: string | null
          description: string
          fund_tx_hash: string | null
          funded_amount: number
          id: string
          job_type: Database["public"]["Enums"]["work_job_type"]
          max_units: number
          onchain_job_id: number | null
          platform: Database["public"]["Enums"]["work_platform"] | null
          poster_address: string
          price_per_unit: number
          released_amount: number
          status: Database["public"]["Enums"]["work_job_status"]
          submission_count: number
          tags: string[] | null
          target_url: string | null
          title: string
          total_budget: number
          units_approved: number
          updated_at: string
          view_count: number
        }
        Insert: {
          application_count?: number
          awarded_worker_address?: string | null
          boost_expires_at?: string | null
          cover_image_url?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["work_currency"]
          deadline?: string | null
          description?: string
          fund_tx_hash?: string | null
          funded_amount?: number
          id?: string
          job_type: Database["public"]["Enums"]["work_job_type"]
          max_units?: number
          onchain_job_id?: number | null
          platform?: Database["public"]["Enums"]["work_platform"] | null
          poster_address: string
          price_per_unit?: number
          released_amount?: number
          status?: Database["public"]["Enums"]["work_job_status"]
          submission_count?: number
          tags?: string[] | null
          target_url?: string | null
          title: string
          total_budget?: number
          units_approved?: number
          updated_at?: string
          view_count?: number
        }
        Update: {
          application_count?: number
          awarded_worker_address?: string | null
          boost_expires_at?: string | null
          cover_image_url?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["work_currency"]
          deadline?: string | null
          description?: string
          fund_tx_hash?: string | null
          funded_amount?: number
          id?: string
          job_type?: Database["public"]["Enums"]["work_job_type"]
          max_units?: number
          onchain_job_id?: number | null
          platform?: Database["public"]["Enums"]["work_platform"] | null
          poster_address?: string
          price_per_unit?: number
          released_amount?: number
          status?: Database["public"]["Enums"]["work_job_status"]
          submission_count?: number
          tags?: string[] | null
          target_url?: string | null
          title?: string
          total_budget?: number
          units_approved?: number
          updated_at?: string
          view_count?: number
        }
        Relationships: []
      }
      work_reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          job_id: string
          rating: number
          reviewee_address: string
          reviewer_address: string
          reviewer_role: Database["public"]["Enums"]["work_review_role"]
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          job_id: string
          rating: number
          reviewee_address: string
          reviewer_address: string
          reviewer_role: Database["public"]["Enums"]["work_review_role"]
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          job_id?: string
          rating?: number
          reviewee_address?: string
          reviewer_address?: string
          reviewer_role?: Database["public"]["Enums"]["work_review_role"]
        }
        Relationships: [
          {
            foreignKeyName: "work_reviews_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "work_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      work_submissions: {
        Row: {
          approval_status: Database["public"]["Enums"]["work_submission_status"]
          created_at: string
          id: string
          job_id: string
          last_polled_at: string | null
          payout_amount: number
          payout_tx_hash: string | null
          platform: Database["public"]["Enums"]["work_platform"] | null
          proof_text: string | null
          proof_url: string
          rejection_reason: string | null
          updated_at: string
          view_count_cached: number
          worker_address: string
        }
        Insert: {
          approval_status?: Database["public"]["Enums"]["work_submission_status"]
          created_at?: string
          id?: string
          job_id: string
          last_polled_at?: string | null
          payout_amount?: number
          payout_tx_hash?: string | null
          platform?: Database["public"]["Enums"]["work_platform"] | null
          proof_text?: string | null
          proof_url: string
          rejection_reason?: string | null
          updated_at?: string
          view_count_cached?: number
          worker_address: string
        }
        Update: {
          approval_status?: Database["public"]["Enums"]["work_submission_status"]
          created_at?: string
          id?: string
          job_id?: string
          last_polled_at?: string | null
          payout_amount?: number
          payout_tx_hash?: string | null
          platform?: Database["public"]["Enums"]["work_platform"] | null
          proof_text?: string | null
          proof_url?: string
          rejection_reason?: string | null
          updated_at?: string
          view_count_cached?: number
          worker_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_submissions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "work_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      work_view_snapshots: {
        Row: {
          id: string
          polled_at: string
          submission_id: string
          view_count: number
        }
        Insert: {
          id?: string
          polled_at?: string
          submission_id: string
          view_count: number
        }
        Update: {
          id?: string
          polled_at?: string
          submission_id?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "work_view_snapshots_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "work_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bulk_insert_category_log: { Args: { entries: Json }; Returns: number }
      cleanup_old_client_error_logs: { Args: never; Returns: undefined }
      cleanup_old_leaderboard_snapshots: { Args: never; Returns: undefined }
      cleanup_old_story_views: { Args: never; Returns: undefined }
      get_community_role: {
        Args: { _community_id: string; _wallet_address: string }
        Returns: string
      }
      get_request_wallet_address: { Args: never; Returns: string }
      increment_category_count: { Args: { p_name: string }; Returns: undefined }
      increment_stage_listens: {
        Args: { p_space_id: string }
        Returns: undefined
      }
      increment_ticker_search: {
        Args: { p_symbol: string }
        Returns: undefined
      }
    }
    Enums: {
      work_app_status: "pending" | "awarded" | "rejected" | "withdrawn"
      work_currency: "DHB" | "USDC"
      work_dispute_status:
        | "open"
        | "resolved_worker"
        | "resolved_poster"
        | "resolved_split"
      work_job_status:
        | "draft"
        | "open"
        | "in_progress"
        | "completed"
        | "disputed"
        | "cancelled"
        | "expired"
      work_job_type: "shill" | "clipping" | "contract"
      work_platform:
        | "x"
        | "youtube"
        | "instagram"
        | "tiktok"
        | "facebook"
        | "reddit"
        | "other"
      work_review_role: "poster" | "worker"
      work_submission_status: "pending" | "approved" | "rejected" | "paid"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      work_app_status: ["pending", "awarded", "rejected", "withdrawn"],
      work_currency: ["DHB", "USDC"],
      work_dispute_status: [
        "open",
        "resolved_worker",
        "resolved_poster",
        "resolved_split",
      ],
      work_job_status: [
        "draft",
        "open",
        "in_progress",
        "completed",
        "disputed",
        "cancelled",
        "expired",
      ],
      work_job_type: ["shill", "clipping", "contract"],
      work_platform: [
        "x",
        "youtube",
        "instagram",
        "tiktok",
        "facebook",
        "reddit",
        "other",
      ],
      work_review_role: ["poster", "worker"],
      work_submission_status: ["pending", "approved", "rejected", "paid"],
    },
  },
} as const

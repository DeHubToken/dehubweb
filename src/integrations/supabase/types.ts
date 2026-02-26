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
          speaker_count: number
          started_at: string
          status: string
          title: string
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
          speaker_count?: number
          started_at?: string
          status?: string
          title: string
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
          speaker_count?: number
          started_at?: string
          status?: string
          title?: string
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
      direct_messages: {
        Row: {
          content: string
          conversation_id: string | null
          created_at: string
          id: string
          media_url: string | null
          message_type: string
          receiver_address: string
          sender_address: string
          sender_avatar_url: string | null
          sender_display_name: string | null
          sender_username: string | null
        }
        Insert: {
          content?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          media_url?: string | null
          message_type?: string
          receiver_address: string
          sender_address: string
          sender_avatar_url?: string | null
          sender_display_name?: string | null
          sender_username?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          media_url?: string | null
          message_type?: string
          receiver_address?: string
          sender_address?: string
          sender_avatar_url?: string | null
          sender_display_name?: string | null
          sender_username?: string | null
        }
        Relationships: []
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
          like_count?: number
          status?: string
          title?: string
          updated_at?: string
          vote_count?: number
        }
        Relationships: []
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
          tx_hash: string
        }
        Insert: {
          amount: number
          chain_id?: number
          created_at?: string
          id?: string
          receiver_address: string
          sender_address: string
          tx_hash: string
        }
        Update: {
          amount?: number
          chain_id?: number
          created_at?: string
          id?: string
          receiver_address?: string
          sender_address?: string
          tx_hash?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_old_client_error_logs: { Args: never; Returns: undefined }
      cleanup_old_leaderboard_snapshots: { Args: never; Returns: undefined }
      cleanup_old_story_views: { Args: never; Returns: undefined }
      get_request_wallet_address: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

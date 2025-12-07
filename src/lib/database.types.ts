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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      app_logs: {
        Row: {
          category: string
          created_at: string
          id: number
          level: string
          message: string
          metadata: Json | null
        }
        Insert: {
          category: string
          created_at?: string
          id?: number
          level: string
          message: string
          metadata?: Json | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: number
          level?: string
          message?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      distances_cache: {
        Row: {
          created_at: string | null
          duration_text: string
          duration_value: number
          expires_at: string | null
          id: string
          origin_lat: number
          origin_lng: number
          place_id: string
          travel_mode: string
        }
        Insert: {
          created_at?: string | null
          duration_text: string
          duration_value: number
          expires_at?: string | null
          id?: string
          origin_lat: number
          origin_lng: number
          place_id: string
          travel_mode?: string
        }
        Update: {
          created_at?: string | null
          duration_text?: string
          duration_value?: number
          expires_at?: string | null
          id?: string
          origin_lat?: number
          origin_lng?: number
          place_id?: string
          travel_mode?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          ai_reason: string | null
          created_at: string
          id: string
          metadata: Json | null
          place_address: string | null
          place_id: string
          place_name: string
          place_rating: number | null
          recommended_dish: string | null
          session_id: string
          walking_time_text: string | null
        }
        Insert: {
          ai_reason?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          place_address?: string | null
          place_id: string
          place_name: string
          place_rating?: number | null
          recommended_dish?: string | null
          session_id: string
          walking_time_text?: string | null
        }
        Update: {
          ai_reason?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          place_address?: string | null
          place_id?: string
          place_name?: string
          place_rating?: number | null
          recommended_dish?: string | null
          session_id?: string
          walking_time_text?: string | null
        }
        Relationships: []
      }
      places_cache: {
        Row: {
          created_at: string | null
          data: Json
          expires_at: string | null
          lat: number | null
          lng: number | null
          name: string
          place_id: string
        }
        Insert: {
          created_at?: string | null
          data: Json
          expires_at?: string | null
          lat?: number | null
          lng?: number | null
          name: string
          place_id: string
        }
        Update: {
          created_at?: string | null
          data?: Json
          expires_at?: string | null
          lat?: number | null
          lng?: number | null
          name?: string
          place_id?: string
        }
        Relationships: []
      }
      recommended_places: {
        Row: {
          created_at: string | null
          id: string
          place_id: string
          place_name: string | null
          session_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          place_id: string
          place_name?: string | null
          session_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          place_id?: string
          place_name?: string | null
          session_id?: string
        }
        Relationships: []
      }
      search_history: {
        Row: {
          address: string
          created_at: string
          dietary_restrictions: string[] | null
          freestyle_prompt: string | null
          id: string
          lat: number
          lng: number
          no_cash: boolean | null
          price: string | null
          result_count: number | null
          session_id: string
          vibe: string | null
          walk_limit: string
        }
        Insert: {
          address: string
          created_at?: string
          dietary_restrictions?: string[] | null
          freestyle_prompt?: string | null
          id?: string
          lat: number
          lng: number
          no_cash?: boolean | null
          price?: string | null
          result_count?: number | null
          session_id: string
          vibe?: string | null
          walk_limit: string
        }
        Update: {
          address?: string
          created_at?: string
          dietary_restrictions?: string[] | null
          freestyle_prompt?: string | null
          id?: string
          lat?: number
          lng?: number
          no_cash?: boolean | null
          price?: string | null
          result_count?: number | null
          session_id?: string
          vibe?: string | null
          walk_limit?: string
        }
        Relationships: []
      }
      text_search_cache: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          origin_lat: number
          origin_lng: number
          place_ids: string[]
          query: string
          radius: number
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          origin_lat: number
          origin_lng: number
          place_ids: string[]
          query: string
          radius: number
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          origin_lat?: number
          origin_lng?: number
          place_ids?: string[]
          query?: string
          radius?: number
        }
        Relationships: []
      }
      user_api_keys: {
        Row: {
          created_at: string | null
          encrypted_key: string
          id: string
          is_active: boolean | null
          key_hint: string | null
          service: string
          session_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          encrypted_key: string
          id?: string
          is_active?: boolean | null
          key_hint?: string | null
          service: string
          session_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          encrypted_key?: string
          id?: string
          is_active?: boolean | null
          key_hint?: string | null
          service?: string
          session_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      dietary_restriction: "Gluten-Free" | "Vegan" | "Vegetarian"
      hunger_vibe:
        | "Grab & Go"
        | "Light & Clean"
        | "Hearty & Rich"
        | "Spicy & Bold"
        | "View & Vibe"
        | "Authentic & Classic"
      price_point: "Bootstrapped" | "Series A" | "Company Card"
      walk_limit: "5 min" | "15 min" | "30 min"
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
      dietary_restriction: ["Gluten-Free", "Vegan", "Vegetarian"],
      hunger_vibe: [
        "Grab & Go",
        "Light & Clean",
        "Hearty & Rich",
        "Spicy & Bold",
        "View & Vibe",
        "Authentic & Classic",
      ],
      price_point: ["Bootstrapped", "Series A", "Company Card"],
      walk_limit: ["5 min", "15 min", "30 min"],
    },
  },
} as const

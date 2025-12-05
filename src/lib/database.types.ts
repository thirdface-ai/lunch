export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      dietary_restriction: 'Gluten-Free' | 'Vegan' | 'Vegetarian'
      hunger_vibe:
        | 'Grab & Go'
        | 'Light & Clean'
        | 'Hearty & Rich'
        | 'Spicy & Bold'
        | 'View & Vibe'
        | 'Authentic & Classic'
      price_point: 'Bootstrapped' | 'Series A' | 'Company Card'
      walk_limit: '5 min' | '15 min' | '30 min'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        Database[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof Database
}
  ? (Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      Database[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof Database
}
  ? Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof Database
}
  ? Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof Database
}
  ? Database[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never


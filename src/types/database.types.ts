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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      menu_items: {
        Row: {
          allergens: string[]
          available_time_segment: string
          calories: number | null
          category: string | null
          description: string | null
          id: string
          image_url: string | null
          ingredients: string[]
          is_available: boolean
          is_featured: boolean
          is_halal: boolean
          is_jay: boolean
          is_vegetarian: boolean
          name: string
          preparation_time_min: number | null
          price: number
          release_date: string
          spice_level: number
          tags: string[]
          updated_at: string
          vendor_id: string
        }
        Insert: {
          allergens?: string[]
          available_time_segment?: string
          calories?: number | null
          category?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          ingredients?: string[]
          is_available?: boolean
          is_featured?: boolean
          is_halal?: boolean
          is_jay?: boolean
          is_vegetarian?: boolean
          name: string
          preparation_time_min?: number | null
          price: number
          release_date?: string
          spice_level?: number
          tags?: string[]
          updated_at?: string
          vendor_id: string
        }
        Update: {
          allergens?: string[]
          available_time_segment?: string
          calories?: number | null
          category?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          ingredients?: string[]
          is_available?: boolean
          is_featured?: boolean
          is_halal?: boolean
          is_jay?: boolean
          is_vegetarian?: boolean
          name?: string
          preparation_time_min?: number | null
          price?: number
          release_date?: string
          spice_level?: number
          tags?: string[]
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_interactions: {
        Row: {
          action: string
          created_at: string
          id: string
          menu_item_id: string
          user_id: string
          view_duration_sec: number | null
          was_recommended: boolean
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          menu_item_id: string
          user_id: string
          view_duration_sec?: number | null
          was_recommended?: boolean
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          menu_item_id?: string
          user_id?: string
          view_duration_sec?: number | null
          was_recommended?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ml_interactions_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          menu_item_id: string
          order_id: string
          quantity: number
          special_instructions: string | null
          unit_price: number
        }
        Insert: {
          id?: string
          menu_item_id: string
          order_id: string
          quantity: number
          special_instructions?: string | null
          unit_price: number
        }
        Update: {
          id?: string
          menu_item_id?: string
          order_id?: string
          quantity?: number
          special_instructions?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          estimated_prep_minutes: number | null
          id: string
          packaging_fee: number
          payment_method: string
          pickup_end: string | null
          pickup_start: string | null
          queue_number: number | null
          status: string
          subtotal: number
          time_segment: string | null
          total_amount: number
          user_id: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          estimated_prep_minutes?: number | null
          id?: string
          packaging_fee?: number
          payment_method?: string
          pickup_end?: string | null
          pickup_start?: string | null
          queue_number?: number | null
          status?: string
          subtotal: number
          time_segment?: string | null
          total_amount: number
          user_id: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          estimated_prep_minutes?: number | null
          id?: string
          packaging_fee?: number
          payment_method?: string
          pickup_end?: string | null
          pickup_start?: string | null
          queue_number?: number | null
          status?: string
          subtotal?: number
          time_segment?: string | null
          total_amount?: number
          user_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          id: string
          method: string
          order_id: string
          paid_at: string | null
          promptpay_ref: string | null
          qr_code_url: string | null
          status: string
        }
        Insert: {
          amount: number
          id?: string
          method: string
          order_id: string
          paid_at?: string | null
          promptpay_ref?: string | null
          qr_code_url?: string | null
          status?: string
        }
        Update: {
          amount?: number
          id?: string
          method?: string
          order_id?: string
          paid_at?: string | null
          promptpay_ref?: string | null
          qr_code_url?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          description: string | null
          discount_pct: number | null
          id: string
          is_active: boolean
          target_category: string | null
          title: string
          valid_from: string
          valid_until: string
          vendor_id: string
        }
        Insert: {
          description?: string | null
          discount_pct?: number | null
          id?: string
          is_active?: boolean
          target_category?: string | null
          title: string
          valid_from: string
          valid_until: string
          vendor_id: string
        }
        Update: {
          description?: string | null
          discount_pct?: number | null
          id?: string
          is_active?: boolean
          target_category?: string | null
          title?: string
          valid_from?: string
          valid_until?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          menu_item_id: string
          order_id: string | null
          score: number
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          menu_item_id: string
          order_id?: string | null
          score: number
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          menu_item_id?: string
          order_id?: string | null
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_log: {
        Row: {
          id: string
          item_ids: string[]
          match_score: number | null
          recommendation_type: string | null
          row_type: string | null
          served_at: string
          user_id: string
        }
        Insert: {
          id?: string
          item_ids?: string[]
          match_score?: number | null
          recommendation_type?: string | null
          row_type?: string | null
          served_at?: string
          user_id: string
        }
        Update: {
          id?: string
          item_ids?: string[]
          match_score?: number | null
          recommendation_type?: string | null
          row_type?: string | null
          served_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          allergies: string[]
          budget_max: number | null
          favorite_categories: string[]
          is_halal: boolean
          is_jay: boolean
          is_vegetarian: boolean
          liked_cuisines: string[]
          spice_level: number
          user_id: string
        }
        Insert: {
          allergies?: string[]
          budget_max?: number | null
          favorite_categories?: string[]
          is_halal?: boolean
          is_jay?: boolean
          is_vegetarian?: boolean
          liked_cuisines?: string[]
          spice_level?: number
          user_id: string
        }
        Update: {
          allergies?: string[]
          budget_max?: number | null
          favorite_categories?: string[]
          is_halal?: boolean
          is_jay?: boolean
          is_vegetarian?: boolean
          liked_cuisines?: string[]
          spice_level?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          department: string | null
          email: string
          id: string
          language: string
          name: string
          notifications_enabled: boolean
          role: string
          university_id: string | null
          wallet_balance: number
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email: string
          id: string
          language?: string
          name: string
          notifications_enabled?: boolean
          role?: string
          university_id?: string | null
          wallet_balance?: number
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email?: string
          id?: string
          language?: string
          name?: string
          notifications_enabled?: boolean
          role?: string
          university_id?: string | null
          wallet_balance?: number
        }
        Relationships: []
      }
      vendor_applications: {
        Row: {
          address: string | null
          applicant_user_id: string | null
          bio: string | null
          business_name: string
          cuisine_tags: string[]
          email: string
          full_name: string
          id: string
          is_on_campus: boolean
          phone: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_note: string | null
          stall_number: string | null
          status: string
          submitted_at: string
          vendor_id: string | null
        }
        Insert: {
          address?: string | null
          applicant_user_id?: string | null
          bio?: string | null
          business_name: string
          cuisine_tags?: string[]
          email: string
          full_name: string
          id?: string
          is_on_campus?: boolean
          phone: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          stall_number?: string | null
          status?: string
          submitted_at?: string
          vendor_id?: string | null
        }
        Update: {
          address?: string | null
          applicant_user_id?: string | null
          bio?: string | null
          business_name?: string
          cuisine_tags?: string[]
          email?: string
          full_name?: string
          id?: string
          is_on_campus?: boolean
          phone?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          stall_number?: string | null
          status?: string
          submitted_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_applications_applicant_user_id_fkey"
            columns: ["applicant_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_applications_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          bio: string | null
          close_time: string | null
          cover_image_url: string | null
          created_at: string
          cuisine_tags: string[]
          current_queue_count: number
          estimated_wait_min: number
          id: string
          is_halal_certified: boolean
          is_on_campus: boolean
          is_open: boolean
          name: string
          open_time: string | null
          owner_user_id: string | null
          stall_number: string | null
        }
        Insert: {
          address?: string | null
          bio?: string | null
          close_time?: string | null
          cover_image_url?: string | null
          created_at?: string
          cuisine_tags?: string[]
          current_queue_count?: number
          estimated_wait_min?: number
          id?: string
          is_halal_certified?: boolean
          is_on_campus?: boolean
          is_open?: boolean
          name: string
          open_time?: string | null
          owner_user_id?: string | null
          stall_number?: string | null
        }
        Update: {
          address?: string | null
          bio?: string | null
          close_time?: string | null
          cover_image_url?: string | null
          created_at?: string
          cuisine_tags?: string[]
          current_queue_count?: number
          estimated_wait_min?: number
          id?: string
          is_halal_certified?: boolean
          is_on_campus?: boolean
          is_open?: boolean
          name?: string
          open_time?: string | null
          owner_user_id?: string | null
          stall_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          reference: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          reference?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          reference?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_vendor_application: {
        Args: { p_admin_id: string; p_application_id: string }
        Returns: undefined
      }
      bootstrap_admin: { Args: { p_user_id: string }; Returns: undefined }
      next_queue_number: { Args: { p_vendor_id: string }; Returns: number }
      pending_vendor_application_ids: {
        Args: never
        Returns: {
          vendor_id: string
        }[]
      }
      place_order_escrow: {
        Args: { p_amount: number; p_order_id: string; p_user_id: string }
        Returns: undefined
      }
      refund_escrow: { Args: { p_order_id: string }; Returns: undefined }
      release_escrow_to_vendor: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      topup_wallet: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
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

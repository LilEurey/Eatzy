export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      menu_item_addon_groups: {
        Row: {
          created_at: string
          id: string
          max_select: number | null
          menu_item_id: string
          min_select: number
          name: string
          name_th: string | null
          sort_order: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_select?: number | null
          menu_item_id: string
          min_select?: number
          name: string
          name_th?: string | null
          sort_order?: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          max_select?: number | null
          menu_item_id?: string
          min_select?: number
          name?: string
          name_th?: string | null
          sort_order?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_addon_groups_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_addon_groups_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_addons: {
        Row: {
          allergens: string[]
          group_id: string
          id: string
          is_available: boolean
          name: string
          name_th: string | null
          price: number
          sort_order: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          allergens?: string[]
          group_id: string
          id?: string
          is_available?: boolean
          name: string
          name_th?: string | null
          price?: number
          sort_order?: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          allergens?: string[]
          group_id?: string
          id?: string
          is_available?: boolean
          name?: string
          name_th?: string | null
          price?: number
          sort_order?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_addons_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "menu_item_addon_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_addons_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          allergens: string[]
          available_time_segment: string
          category: string | null
          description: string | null
          description_th: string | null
          id: string
          image_url: string | null
          ingredients: string[]
          is_available: boolean
          is_featured: boolean
          is_halal: boolean
          is_jay: boolean
          is_vegetarian: boolean
          name: string
          name_th: string | null
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
          category?: string | null
          description?: string | null
          description_th?: string | null
          id?: string
          image_url?: string | null
          ingredients?: string[]
          is_available?: boolean
          is_featured?: boolean
          is_halal?: boolean
          is_jay?: boolean
          is_vegetarian?: boolean
          name: string
          name_th?: string | null
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
          category?: string | null
          description?: string | null
          description_th?: string | null
          id?: string
          image_url?: string | null
          ingredients?: string[]
          is_available?: boolean
          is_featured?: boolean
          is_halal?: boolean
          is_jay?: boolean
          is_vegetarian?: boolean
          name?: string
          name_th?: string | null
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
      notifications: {
        Row: {
          body: string
          created_at: string
          event: string | null
          icon: string
          id: string
          order_id: string
          queue_number: number | null
          read: boolean
          title: string
          total_amount: number | null
          type: string
          user_id: string
          vendor_name: string | null
        }
        Insert: {
          body: string
          created_at?: string
          event?: string | null
          icon: string
          id?: string
          order_id: string
          queue_number?: number | null
          read?: boolean
          title: string
          total_amount?: number | null
          type?: string
          user_id: string
          vendor_name?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          event?: string | null
          icon?: string
          id?: string
          order_id?: string
          queue_number?: number | null
          read?: boolean
          title?: string
          total_amount?: number | null
          type?: string
          user_id?: string
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_addons: {
        Row: {
          addon_id: string | null
          created_at: string
          id: string
          name: string
          name_th: string | null
          order_item_id: string
          price: number
        }
        Insert: {
          addon_id?: string | null
          created_at?: string
          id?: string
          name: string
          name_th?: string | null
          order_item_id: string
          price: number
        }
        Update: {
          addon_id?: string | null
          created_at?: string
          id?: string
          name?: string
          name_th?: string | null
          order_item_id?: string
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_item_addons_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "menu_item_addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_addons_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
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
          student_picked_up_at: string | null
          subtotal: number
          time_segment: string | null
          total_amount: number
          user_id: string
          vendor_handed_off_at: string | null
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
          student_picked_up_at?: string | null
          subtotal: number
          time_segment?: string | null
          total_amount: number
          user_id: string
          vendor_handed_off_at?: string | null
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
          student_picked_up_at?: string | null
          subtotal?: number
          time_segment?: string | null
          total_amount?: number
          user_id?: string
          vendor_handed_off_at?: string | null
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
          photo_urls: string[]
          score: number
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          menu_item_id: string
          order_id?: string | null
          photo_urls?: string[]
          score: number
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          menu_item_id?: string
          order_id?: string | null
          photo_urls?: string[]
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
      vendors: {
        Row: {
          address: string | null
          bio: string | null
          bio_th: string | null
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
          bio_th?: string | null
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
          bio_th?: string | null
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
      auto_finalize_stale_handoffs: { Args: never; Returns: undefined }
      bootstrap_admin: { Args: { p_user_id: string }; Returns: undefined }
      finalize_order_handoff: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      get_because_you_ordered: {
        Args: { limit_n: number }
        Returns: {
          co_orders: number
          menu_item_id: string
        }[]
      }
      get_trending_items: {
        Args: { limit_n: number; since: string }
        Returns: {
          menu_item_id: string
          order_count: number
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      next_queue_number: { Args: { p_vendor_id: string }; Returns: number }
      place_order_escrow: {
        Args: { p_amount: number; p_order_id: string; p_user_id: string }
        Returns: undefined
      }
      provision_vendor: {
        Args: {
          p_business_name: string
          p_cuisine_tags: string[]
          p_user_id: string
        }
        Returns: string
      }
      refund_escrow: { Args: { p_order_id: string }; Returns: undefined }
      student_confirm_pickup: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      topup_wallet: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
      vendor_confirm_handoff: {
        Args: { p_order_id: string }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const


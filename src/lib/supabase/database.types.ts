// GENERATED FILE — DO NOT EDIT BY HAND.
//
// Regenerate after every migration:  npm run db:types
//
// If types here disagree with the database, the database is right.

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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          archived_at: string | null
          color: Database["public"]["Enums"]["notion_color"]
          created_at: string
          id: string
          is_productive: boolean
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          color?: Database["public"]["Enums"]["notion_color"]
          created_at?: string
          id?: string
          is_productive?: boolean
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          color?: Database["public"]["Enums"]["notion_color"]
          created_at?: string
          id?: string
          is_productive?: boolean
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_links: {
        Row: {
          child_id: string
          contribution_weight: number
          conversion_factor: number | null
          conversion_note: string | null
          created_at: string
          link_type: Database["public"]["Enums"]["goal_link_type"]
          parent_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          child_id: string
          contribution_weight?: number
          conversion_factor?: number | null
          conversion_note?: string | null
          created_at?: string
          link_type: Database["public"]["Enums"]["goal_link_type"]
          parent_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          child_id?: string
          contribution_weight?: number
          conversion_factor?: number | null
          conversion_note?: string | null
          created_at?: string
          link_type?: Database["public"]["Enums"]["goal_link_type"]
          parent_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_links_child_fkey"
            columns: ["child_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goal_overview"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "goal_links_child_fkey"
            columns: ["child_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goal_weight_budget"
            referencedColumns: ["goal_id", "user_id"]
          },
          {
            foreignKeyName: "goal_links_child_fkey"
            columns: ["child_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "goal_links_parent_fkey"
            columns: ["parent_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goal_overview"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "goal_links_parent_fkey"
            columns: ["parent_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goal_weight_budget"
            referencedColumns: ["goal_id", "user_id"]
          },
          {
            foreignKeyName: "goal_links_parent_fkey"
            columns: ["parent_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      goal_progress: {
        Row: {
          created_at: string
          date: string
          goal_id: string
          note: string | null
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          date: string
          goal_id: string
          note?: string | null
          updated_at?: string
          user_id: string
          value: number
        }
        Update: {
          created_at?: string
          date?: string
          goal_id?: string
          note?: string | null
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "goal_progress_goal_fkey"
            columns: ["goal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goal_overview"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "goal_progress_goal_fkey"
            columns: ["goal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goal_weight_budget"
            referencedColumns: ["goal_id", "user_id"]
          },
          {
            foreignKeyName: "goal_progress_goal_fkey"
            columns: ["goal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      goal_revisions: {
        Row: {
          changed_at: string
          created_at: string
          field: string
          goal_id: string
          id: string
          new_value: string | null
          old_value: string | null
          reason: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          changed_at?: string
          created_at?: string
          field: string
          goal_id: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          reason?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          changed_at?: string
          created_at?: string
          field?: string
          goal_id?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          reason?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_revisions_goal_fkey"
            columns: ["goal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goal_overview"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "goal_revisions_goal_fkey"
            columns: ["goal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goal_weight_budget"
            referencedColumns: ["goal_id", "user_id"]
          },
          {
            foreignKeyName: "goal_revisions_goal_fkey"
            columns: ["goal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      goals: {
        Row: {
          color: Database["public"]["Enums"]["notion_color"]
          created_at: string
          description: string | null
          due_date: string
          horizon: Database["public"]["Enums"]["goal_horizon"]
          id: string
          metric_unit: string | null
          start_date: string
          status: Database["public"]["Enums"]["goal_status"]
          target_value: number | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: Database["public"]["Enums"]["notion_color"]
          created_at?: string
          description?: string | null
          due_date: string
          horizon: Database["public"]["Enums"]["goal_horizon"]
          id?: string
          metric_unit?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["goal_status"]
          target_value?: number | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: Database["public"]["Enums"]["notion_color"]
          created_at?: string
          description?: string | null
          due_date?: string
          horizon?: Database["public"]["Enums"]["goal_horizon"]
          id?: string
          metric_unit?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["goal_status"]
          target_value?: number | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          currency: string
          ewma_half_life_days: number
          id: string
          quiet_hours_end: string
          quiet_hours_start: string
          telegram_chat_id: string | null
          timezone: string
          updated_at: string
          waking_end: string
          waking_start: string
        }
        Insert: {
          created_at?: string
          currency?: string
          ewma_half_life_days?: number
          id: string
          quiet_hours_end?: string
          quiet_hours_start?: string
          telegram_chat_id?: string | null
          timezone?: string
          updated_at?: string
          waking_end?: string
          waking_start?: string
        }
        Update: {
          created_at?: string
          currency?: string
          ewma_half_life_days?: number
          id?: string
          quiet_hours_end?: string
          quiet_hours_start?: string
          telegram_chat_id?: string | null
          timezone?: string
          updated_at?: string
          waking_end?: string
          waking_start?: string
        }
        Relationships: []
      }
      time_slots: {
        Row: {
          category_id: string | null
          created_at: string
          goal_id: string | null
          kind: Database["public"]["Enums"]["slot_kind"]
          note: string | null
          slot_start: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          goal_id?: string | null
          kind: Database["public"]["Enums"]["slot_kind"]
          note?: string | null
          slot_start: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          goal_id?: string | null
          kind?: Database["public"]["Enums"]["slot_kind"]
          note?: string | null
          slot_start?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_slots_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_slots_goal_fkey"
            columns: ["goal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goal_overview"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "time_slots_goal_fkey"
            columns: ["goal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goal_weight_budget"
            referencedColumns: ["goal_id", "user_id"]
          },
          {
            foreignKeyName: "time_slots_goal_fkey"
            columns: ["goal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
    }
    Views: {
      goal_overview: {
        Row: {
          child_count: number | null
          color: Database["public"]["Enums"]["notion_color"] | null
          created_at: string | null
          description: string | null
          due_date: string | null
          horizon: Database["public"]["Enums"]["goal_horizon"] | null
          id: string | null
          is_blocked: boolean | null
          metric_unit: string | null
          parent_count: number | null
          progress_total: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["goal_status"] | null
          target_value: number | null
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: []
      }
      goal_weight_budget: {
        Row: {
          allocated: number | null
          goal_id: string | null
          remaining: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      blocked_goals: {
        Args: never
        Returns: {
          blocker_id: string
          blocker_title: string
          goal_id: string
          horizon: Database["public"]["Enums"]["goal_horizon"]
          title: string
        }[]
      }
      critical_path: {
        Args: { p_goal_id: string }
        Returns: {
          deadline_broken: boolean
          depth: number
          due_date: string
          goal_id: string
          title: string
        }[]
      }
      day_coverage: {
        Args: { p_date: string; p_user_id?: string }
        Returns: {
          coverage: number
          expected: number
          logged: number
        }[]
      }
      day_fidelity: {
        Args: { p_date: string; p_user_id?: string }
        Returns: {
          fidelity: number
          honoured: number
          planned: number
        }[]
      }
      get_day_grid: {
        Args: { p_date: string; p_user_id?: string }
        Returns: {
          actual_category_id: string
          actual_goal_id: string
          actual_note: string
          has_actual: boolean
          has_planned: boolean
          in_waking_window: boolean
          local_time: string
          planned_category_id: string
          planned_goal_id: string
          planned_note: string
          slot_index: number
          slot_start: string
        }[]
      }
      goal_ancestry: {
        Args: { p_goal_id: string }
        Returns: {
          child_id: string
          contribution_weight: number
          conversion_factor: number
          conversion_note: string
          crosses_undeclared_conversion: boolean
          depth: number
          parent_id: string
          share: number
        }[]
      }
      goal_effort_rollup: { Args: { p_goal_id: string }; Returns: number }
      goal_effort_shares: {
        Args: { p_goal_id: string }
        Returns: {
          goal_id: string
          share: number
        }[]
      }
      goal_outcome_rollup: {
        Args: { p_goal_id: string; p_max_depth?: number }
        Returns: {
          is_complete: boolean
          unsummed: Json
          value: number
        }[]
      }
      goal_own_hours: { Args: { p_goal_id: string }; Returns: number }
      goal_pace: {
        Args: { p_as_of: string; p_goal_id: string }
        Returns: {
          achieved_rate: number
          days_remaining: number
          due_date: string
          pace_ratio: number
          progress_to_date: number
          remaining: number
          required_rate: number
          status: string
          target_value: number
        }[]
      }
      planning_bias: {
        Args: { p_from: string; p_to: string; p_user_id?: string }
        Returns: {
          actual_hours: number
          bias_hours: number
          bias_ratio: number
          category_id: string
          category_name: string
          planned_hours: number
        }[]
      }
      update_goal_targets: {
        Args: {
          p_due_date: string
          p_goal_id: string
          p_metric_unit: string
          p_reason?: string
          p_status: Database["public"]["Enums"]["goal_status"]
          p_target_value: number
        }
        Returns: {
          color: Database["public"]["Enums"]["notion_color"]
          created_at: string
          description: string | null
          due_date: string
          horizon: Database["public"]["Enums"]["goal_horizon"]
          id: string
          metric_unit: string | null
          start_date: string
          status: Database["public"]["Enums"]["goal_status"]
          target_value: number | null
          title: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "goals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      goal_horizon: "day" | "week" | "month" | "quarter" | "year" | "decade"
      goal_link_type: "contributes_to" | "depends_on" | "relates_to"
      goal_status: "active" | "done" | "abandoned" | "blocked"
      notion_color:
        | "gray"
        | "brown"
        | "orange"
        | "yellow"
        | "green"
        | "blue"
        | "purple"
        | "pink"
        | "red"
      slot_kind: "planned" | "actual"
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
      goal_horizon: ["day", "week", "month", "quarter", "year", "decade"],
      goal_link_type: ["contributes_to", "depends_on", "relates_to"],
      goal_status: ["active", "done", "abandoned", "blocked"],
      notion_color: [
        "gray",
        "brown",
        "orange",
        "yellow",
        "green",
        "blue",
        "purple",
        "pink",
        "red",
      ],
      slot_kind: ["planned", "actual"],
    },
  },
} as const

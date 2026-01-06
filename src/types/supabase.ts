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
      bot_instructions: {
        Row: {
          created_at: string | null
          id: string
          organization_id: string | null
          rules: Json
        }
        Insert: {
          created_at?: string | null
          id?: string
          organization_id?: string | null
          rules?: Json
        }
        Update: {
          created_at?: string | null
          id?: string
          organization_id?: string | null
          rules?: Json
        }
        Relationships: [
          {
            foreignKeyName: "bot_instructions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_personality: {
        Row: {
          emoji_usage: boolean | null
          fallback_message: string
          gender_voice: string
          language: string
          organization_id: string
          short_responses: boolean | null
          tone: string
        }
        Insert: {
          emoji_usage?: boolean | null
          fallback_message?: string
          gender_voice?: string
          language?: string
          organization_id: string
          short_responses?: boolean | null
          tone?: string
        }
        Update: {
          emoji_usage?: boolean | null
          fallback_message?: string
          gender_voice?: string
          language?: string
          organization_id?: string
          short_responses?: boolean | null
          tone?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_personality_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_messages: {
        Row: {
          campaign_id: string
          contact_id: string | null
          created_at: string
          delivered_at: string | null
          dispatched_at: string | null
          error: string | null
          id: string
          organization_id: string
          phone: string
          status: Database["public"]["Enums"]["campaign_message_status"]
          variables: Json | null
          whatsapp_message_id: string | null
        }
        Insert: {
          campaign_id: string
          contact_id?: string | null
          created_at?: string
          delivered_at?: string | null
          dispatched_at?: string | null
          error?: string | null
          id?: string
          organization_id: string
          phone: string
          status?: Database["public"]["Enums"]["campaign_message_status"]
          variables?: Json | null
          whatsapp_message_id?: string | null
        }
        Update: {
          campaign_id?: string
          contact_id?: string | null
          created_at?: string
          delivered_at?: string | null
          dispatched_at?: string | null
          error?: string | null
          id?: string
          organization_id?: string
          phone?: string
          status?: Database["public"]["Enums"]["campaign_message_status"]
          variables?: Json | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          channel: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          failed_count: number
          id: string
          name: string
          organization_id: string
          scheduled_at: string | null
          sent_count: number
          started_at: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          template_body: string
          template_variables: string[] | null
          total_recipients: number
          updated_at: string
        }
        Insert: {
          channel?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          failed_count?: number
          id?: string
          name: string
          organization_id: string
          scheduled_at?: string | null
          sent_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          template_body: string
          template_variables?: string[] | null
          total_recipients?: number
          updated_at?: string
        }
        Update: {
          channel?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          failed_count?: number
          id?: string
          name?: string
          organization_id?: string
          scheduled_at?: string | null
          sent_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          template_body?: string
          template_variables?: string[] | null
          total_recipients?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string | null
          id: string
          labels: Json | null
          name: string | null
          organization_id: string | null
          phone: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          labels?: Json | null
          name?: string | null
          organization_id?: string | null
          phone: string
        }
        Update: {
          created_at?: string | null
          id?: string
          labels?: Json | null
          name?: string | null
          organization_id?: string | null
          phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_enabled: boolean | null
          assigned_to: string | null
          channel: string
          contact_id: string | null
          created_at: string | null
          id: string
          last_message_at: string | null
          organization_id: string | null
        }
        Insert: {
          ai_enabled?: boolean | null
          assigned_to?: string | null
          channel?: string
          contact_id?: string | null
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          organization_id?: string | null
        }
        Update: {
          ai_enabled?: boolean | null
          assigned_to?: string | null
          channel?: string
          contact_id?: string | null
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_articles: {
        Row: {
          content: string
          created_at: string | null
          description: string | null
          id: string
          organization_id: string | null
          sub_organization_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          description?: string | null
          id?: string
          organization_id?: string | null
          sub_organization_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          description?: string | null
          id?: string
          organization_id?: string | null
          sub_organization_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_articles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_articles_sub_organization_id_fkey"
            columns: ["sub_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          article_id: string | null
          chunk: string
          created_at: string | null
          embedding: string | null
          id: string
        }
        Insert: {
          article_id?: string | null
          chunk: string
          created_at?: string | null
          embedding?: string | null
          id?: string
        }
        Update: {
          article_id?: string | null
          chunk?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_chunks_article"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "knowledge_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          channel: string
          conversation_id: string | null
          created_at: string | null
          id: string
          media_url: string | null
          message_type: string
          mime_type: string | null
          sender: Database["public"]["Enums"]["message_sender"]
          text: string | null
          wa_received_at: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          channel?: string
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          media_url?: string | null
          message_type?: string
          mime_type?: string | null
          sender: Database["public"]["Enums"]["message_sender"]
          text?: string | null
          wa_received_at?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          channel?: string
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          media_url?: string | null
          message_type?: string
          mime_type?: string | null
          sender?: Database["public"]["Enums"]["message_sender"]
          text?: string | null
          wa_received_at?: string | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_users: {
        Row: {
          created_at: string | null
          id: string
          organization_id: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          organization_id?: string | null
          role?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          organization_id?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          id: string
          logo_url: string | null
          name: string
          parent_org_id: string | null
          type: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          parent_org_id?: string | null
          type?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          parent_org_id?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_parent_org_id_fkey"
            columns: ["parent_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      unanswered_questions: {
        Row: {
          created_at: string | null
          id: string
          occurrences: number | null
          organization_id: string | null
          question: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          occurrences?: number | null
          organization_id?: string | null
          question: string
        }
        Update: {
          created_at?: string | null
          id?: string
          occurrences?: number | null
          organization_id?: string | null
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "unanswered_questions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_settings: {
        Row: {
          api_token: string | null
          created_at: string | null
          id: string
          is_active: boolean
          organization_id: string | null
          phone_number: string | null
          sub_organization_id: string | null
          updated_at: string | null
          verify_token: string | null
          whatsapp_business_id: string | null
          whatsapp_phone_id: string | null
        }
        Insert: {
          api_token?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string | null
          phone_number?: string | null
          sub_organization_id?: string | null
          updated_at?: string | null
          verify_token?: string | null
          whatsapp_business_id?: string | null
          whatsapp_phone_id?: string | null
        }
        Update: {
          api_token?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string | null
          phone_number?: string | null
          sub_organization_id?: string | null
          updated_at?: string | null
          verify_token?: string | null
          whatsapp_business_id?: string | null
          whatsapp_phone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_settings_sub_organization_id_fkey"
            columns: ["sub_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_logs: {
        Row: {
          conversation_id: string | null
          created_at: string | null
          data: Json | null
          id: string
          step_id: string | null
          workflow_id: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          step_id?: string | null
          workflow_id?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          step_id?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_logs_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_logs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_steps: {
        Row: {
          action: Json
          created_at: string | null
          id: string
          step_order: number
          workflow_id: string | null
        }
        Insert: {
          action: Json
          created_at?: string | null
          id?: string
          step_order: number
          workflow_id?: string | null
        }
        Update: {
          action?: Json
          created_at?: string | null
          id?: string
          step_order?: number
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          organization_id: string | null
          trigger: Json | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id?: string | null
          trigger?: Json | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          trigger?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "workflows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_knowledge_chunks: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          article_id: string
          chunk: string
          id: string
          similarity: number
        }[]
      }
    }
    Enums: {
      campaign_message_status:
        | "pending"
        | "queued"
        | "sent"
        | "delivered"
        | "failed"
        | "cancelled"
      campaign_status:
        | "draft"
        | "scheduled"
        | "sending"
        | "completed"
        | "cancelled"
        | "failed"
      message_sender: "user" | "bot" | "customer"
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
    Enums: {
      campaign_message_status: [
        "pending",
        "queued",
        "sent",
        "delivered",
        "failed",
        "cancelled",
      ],
      campaign_status: [
        "draft",
        "scheduled",
        "sending",
        "completed",
        "cancelled",
        "failed",
      ],
      message_sender: ["user", "bot", "customer"],
    },
  },
} as const


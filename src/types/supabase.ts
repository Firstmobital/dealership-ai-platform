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
      ai_settings: {
        Row: {
          ai_enabled: boolean
          created_at: string
          id: string
          kb_search_type: string
          model: string
          organization_id: string
          provider: string
          sub_organization_id: string | null
          updated_at: string
        }
        Insert: {
          ai_enabled?: boolean
          created_at?: string
          id?: string
          kb_search_type: string
          model: string
          organization_id: string
          provider: string
          sub_organization_id?: string | null
          updated_at?: string
        }
        Update: {
          ai_enabled?: boolean
          created_at?: string
          id?: string
          kb_search_type?: string
          model?: string
          organization_id?: string
          provider?: string
          sub_organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_settings_sub_organization_id_fkey"
            columns: ["sub_organization_id"]
            isOneToOne: false
            referencedRelation: "sub_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_logs: {
        Row: {
          charged_amount: number
          conversation_id: string | null
          created_at: string
          estimated_cost: number
          id: string
          input_tokens: number
          message_id: string | null
          model: string
          organization_id: string
          output_tokens: number
          provider: string
          sub_organization_id: string | null
          total_tokens: number
          wallet_transaction_id: string | null
        }
        Insert: {
          charged_amount?: number
          conversation_id?: string | null
          created_at?: string
          estimated_cost?: number
          id?: string
          input_tokens?: number
          message_id?: string | null
          model: string
          organization_id: string
          output_tokens?: number
          provider: string
          sub_organization_id?: string | null
          total_tokens?: number
          wallet_transaction_id?: string | null
        }
        Update: {
          charged_amount?: number
          conversation_id?: string | null
          created_at?: string
          estimated_cost?: number
          id?: string
          input_tokens?: number
          message_id?: string | null
          model?: string
          organization_id?: string
          output_tokens?: number
          provider?: string
          sub_organization_id?: string | null
          total_tokens?: number
          wallet_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_sub_organization_id_fkey"
            columns: ["sub_organization_id"]
            isOneToOne: false
            referencedRelation: "sub_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_wallet_transaction_id_fkey"
            columns: ["wallet_transaction_id"]
            isOneToOne: false
            referencedRelation: "wallet_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          organization_id: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          organization_id: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          organization_id?: string
        }
        Relationships: []
      }
      bot_instructions: {
        Row: {
          created_at: string | null
          organization_id: string
          rules: Json
          sub_organization_id: string
        }
        Insert: {
          created_at?: string | null
          organization_id: string
          rules?: Json
          sub_organization_id: string
        }
        Update: {
          created_at?: string | null
          organization_id?: string
          rules?: Json
          sub_organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_instructions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_instructions_sub_organization_id_fkey"
            columns: ["sub_organization_id"]
            isOneToOne: false
            referencedRelation: "sub_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_personality: {
        Row: {
          business_context: string | null
          donts: string | null
          dos: string | null
          emoji_usage: boolean | null
          fallback_message: string
          gender_voice: string
          language: string
          organization_id: string
          short_responses: boolean | null
          sub_organization_id: string
          tone: string
        }
        Insert: {
          business_context?: string | null
          donts?: string | null
          dos?: string | null
          emoji_usage?: boolean | null
          fallback_message?: string
          gender_voice?: string
          language?: string
          organization_id: string
          short_responses?: boolean | null
          sub_organization_id: string
          tone?: string
        }
        Update: {
          business_context?: string | null
          donts?: string | null
          dos?: string | null
          emoji_usage?: boolean | null
          fallback_message?: string
          gender_voice?: string
          language?: string
          organization_id?: string
          short_responses?: boolean | null
          sub_organization_id?: string
          tone?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_personality_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_personality_sub_organization_id_fkey"
            columns: ["sub_organization_id"]
            isOneToOne: false
            referencedRelation: "sub_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_delivery_import: {
        Row: {
          campaign_name: string | null
          phone: string | null
        }
        Insert: {
          campaign_name?: string | null
          phone?: string | null
        }
        Update: {
          campaign_name?: string | null
          phone?: string | null
        }
        Relationships: []
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
          rendered_text: string | null
          replied_at: string | null
          reply_text: string | null
          reply_whatsapp_message_id: string | null
          status: Database["public"]["Enums"]["campaign_message_status"]
          sub_organization_id: string | null
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
          rendered_text?: string | null
          replied_at?: string | null
          reply_text?: string | null
          reply_whatsapp_message_id?: string | null
          status?: Database["public"]["Enums"]["campaign_message_status"]
          sub_organization_id?: string | null
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
          rendered_text?: string | null
          replied_at?: string | null
          reply_text?: string | null
          reply_whatsapp_message_id?: string | null
          status?: Database["public"]["Enums"]["campaign_message_status"]
          sub_organization_id?: string | null
          variables?: Json | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_analytics_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_analytics_summary_v2"
            referencedColumns: ["campaign_id"]
          },
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
            referencedRelation: "contact_campaign_summary"
            referencedColumns: ["contact_id"]
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
          {
            foreignKeyName: "campaign_messages_sub_organization_id_fkey"
            columns: ["sub_organization_id"]
            isOneToOne: false
            referencedRelation: "sub_organizations"
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
          launched_at: string | null
          name: string
          organization_id: string
          scheduled_at: string | null
          sent_count: number
          started_at: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          sub_organization_id: string | null
          template_body: string
          template_name: string | null
          template_variables: string[] | null
          total_recipients: number
          updated_at: string
          variable_mapping: Json | null
          whatsapp_template_id: string | null
        }
        Insert: {
          channel?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          failed_count?: number
          id?: string
          launched_at?: string | null
          name: string
          organization_id: string
          scheduled_at?: string | null
          sent_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          sub_organization_id?: string | null
          template_body: string
          template_name?: string | null
          template_variables?: string[] | null
          total_recipients?: number
          updated_at?: string
          variable_mapping?: Json | null
          whatsapp_template_id?: string | null
        }
        Update: {
          channel?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          failed_count?: number
          id?: string
          launched_at?: string | null
          name?: string
          organization_id?: string
          scheduled_at?: string | null
          sent_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          sub_organization_id?: string | null
          template_body?: string
          template_name?: string | null
          template_variables?: string[] | null
          total_recipients?: number
          updated_at?: string
          variable_mapping?: Json | null
          whatsapp_template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_sub_organization_id_fkey"
            columns: ["sub_organization_id"]
            isOneToOne: false
            referencedRelation: "sub_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_whatsapp_template_id_fkey"
            columns: ["whatsapp_template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_uploads: {
        Row: {
          created_at: string | null
          file_name: string | null
          id: string
          inserted_count: number | null
          organization_id: string
          skipped_count: number | null
          updated_count: number | null
        }
        Insert: {
          created_at?: string | null
          file_name?: string | null
          id?: string
          inserted_count?: number | null
          organization_id: string
          skipped_count?: number | null
          updated_count?: number | null
        }
        Update: {
          created_at?: string | null
          file_name?: string | null
          id?: string
          inserted_count?: number | null
          organization_id?: string
          skipped_count?: number | null
          updated_count?: number | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          created_at: string | null
          first_name: string | null
          id: string
          labels: Json | null
          last_name: string | null
          model: string | null
          name: string | null
          organization_id: string | null
          phone: string
        }
        Insert: {
          created_at?: string | null
          first_name?: string | null
          id?: string
          labels?: Json | null
          last_name?: string | null
          model?: string | null
          name?: string | null
          organization_id?: string | null
          phone: string
        }
        Update: {
          created_at?: string | null
          first_name?: string | null
          id?: string
          labels?: Json | null
          last_name?: string | null
          model?: string | null
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
      conversation_state: {
        Row: {
          conversation_id: string
          current_step: number
          last_step_reason: string | null
          updated_at: string | null
          variables: Json
          workflow_id: string
        }
        Insert: {
          conversation_id: string
          current_step?: number
          last_step_reason?: string | null
          updated_at?: string | null
          variables?: Json
          workflow_id: string
        }
        Update: {
          conversation_id?: string
          current_step?: number
          last_step_reason?: string | null
          updated_at?: string | null
          variables?: Json
          workflow_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          ai_enabled: boolean | null
          assigned_to: string | null
          channel: string
          contact_id: string | null
          created_at: string | null
          id: string
          intent: string | null
          intent_source: string | null
          intent_update_count: number
          last_message_at: string | null
          organization_id: string | null
          sub_organization_id: string | null
          whatsapp_user_phone: string | null
        }
        Insert: {
          ai_enabled?: boolean | null
          assigned_to?: string | null
          channel?: string
          contact_id?: string | null
          created_at?: string | null
          id?: string
          intent?: string | null
          intent_source?: string | null
          intent_update_count?: number
          last_message_at?: string | null
          organization_id?: string | null
          sub_organization_id?: string | null
          whatsapp_user_phone?: string | null
        }
        Update: {
          ai_enabled?: boolean | null
          assigned_to?: string | null
          channel?: string
          contact_id?: string | null
          created_at?: string | null
          id?: string
          intent?: string | null
          intent_source?: string | null
          intent_update_count?: number
          last_message_at?: string | null
          organization_id?: string | null
          sub_organization_id?: string | null
          whatsapp_user_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_campaign_summary"
            referencedColumns: ["contact_id"]
          },
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
          {
            foreignKeyName: "conversations_sub_organization_id_fkey"
            columns: ["sub_organization_id"]
            isOneToOne: false
            referencedRelation: "sub_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_articles: {
        Row: {
          content: string
          created_at: string | null
          description: string | null
          file_bucket: string | null
          file_path: string | null
          id: string
          keywords: string[]
          last_processed_at: string | null
          mime_type: string | null
          organization_id: string | null
          original_filename: string | null
          processing_error: string | null
          raw_content: string | null
          source_filename: string | null
          source_type: string
          sub_organization_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          description?: string | null
          file_bucket?: string | null
          file_path?: string | null
          id?: string
          keywords?: string[]
          last_processed_at?: string | null
          mime_type?: string | null
          organization_id?: string | null
          original_filename?: string | null
          processing_error?: string | null
          raw_content?: string | null
          source_filename?: string | null
          source_type?: string
          sub_organization_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          description?: string | null
          file_bucket?: string | null
          file_path?: string | null
          id?: string
          keywords?: string[]
          last_processed_at?: string | null
          mime_type?: string | null
          organization_id?: string | null
          original_filename?: string | null
          processing_error?: string | null
          raw_content?: string | null
          source_filename?: string | null
          source_type?: string
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
            referencedRelation: "sub_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          article_id: string
          chunk: string
          embedding: string
          id: string
        }
        Insert: {
          article_id: string
          chunk: string
          embedding: string
          id?: string
        }
        Update: {
          article_id?: string
          chunk?: string
          embedding?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_article_id_fkey"
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
          sub_organization_id: string | null
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
          sub_organization_id?: string | null
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
          sub_organization_id?: string | null
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
          {
            foreignKeyName: "messages_sub_organization_id_fkey"
            columns: ["sub_organization_id"]
            isOneToOne: false
            referencedRelation: "sub_organizations"
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
          type: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          type?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          type?: string | null
        }
        Relationships: []
      }
      razorpay_orders: {
        Row: {
          amount_paise: number
          created_at: string
          created_by: string | null
          currency: string
          id: string
          notes: Json
          organization_id: string
          razorpay_order_id: string
          receipt: string
          status: string
          updated_at: string
          wallet_id: string
        }
        Insert: {
          amount_paise: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          notes?: Json
          organization_id: string
          razorpay_order_id: string
          receipt: string
          status?: string
          updated_at?: string
          wallet_id: string
        }
        Update: {
          amount_paise?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          notes?: Json
          organization_id?: string
          razorpay_order_id?: string
          receipt?: string
          status?: string
          updated_at?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "razorpay_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "razorpay_orders_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      razorpay_payments: {
        Row: {
          amount_paise: number
          created_at: string
          currency: string
          id: string
          organization_id: string
          raw_event: Json
          razorpay_order_id: string
          razorpay_payment_id: string
          status: string
          wallet_id: string
        }
        Insert: {
          amount_paise: number
          created_at?: string
          currency?: string
          id?: string
          organization_id: string
          raw_event?: Json
          razorpay_order_id: string
          razorpay_payment_id: string
          status: string
          wallet_id: string
        }
        Update: {
          amount_paise?: number
          created_at?: string
          currency?: string
          id?: string
          organization_id?: string
          raw_event?: Json
          razorpay_order_id?: string
          razorpay_payment_id?: string
          status?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "razorpay_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "razorpay_payments_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_organization_users: {
        Row: {
          created_at: string
          id: string
          role: string
          sub_organization_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          sub_organization_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          sub_organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_organization_users_sub_organization_id_fkey"
            columns: ["sub_organization_id"]
            isOneToOne: false
            referencedRelation: "sub_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_organizations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          organization_id: string
          slug: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization_id: string
          slug?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sub_organizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      unanswered_questions: {
        Row: {
          ai_response: string | null
          channel: string | null
          conversation_id: string | null
          created_at: string | null
          id: string
          last_seen_at: string
          occurrences: number | null
          organization_id: string | null
          question: string
          resolution_article_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          sub_organization_id: string | null
          updated_at: string
        }
        Insert: {
          ai_response?: string | null
          channel?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          last_seen_at?: string
          occurrences?: number | null
          organization_id?: string | null
          question: string
          resolution_article_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          sub_organization_id?: string | null
          updated_at?: string
        }
        Update: {
          ai_response?: string | null
          channel?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          last_seen_at?: string
          occurrences?: number | null
          organization_id?: string | null
          question?: string
          resolution_article_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          sub_organization_id?: string | null
          updated_at?: string
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
      wallet_alert_logs: {
        Row: {
          alert_type: string
          created_at: string
          id: string
          organization_id: string
          resolved_at: string | null
          triggered_at: string
          wallet_id: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          id?: string
          organization_id: string
          resolved_at?: string | null
          triggered_at?: string
          wallet_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          id?: string
          organization_id?: string
          resolved_at?: string | null
          triggered_at?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_alert_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_alert_logs_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number | null
          balance_before: number | null
          created_at: string
          created_by: string | null
          created_by_role: string
          direction: string
          id: string
          metadata: Json
          purpose: string
          reference_id: string | null
          reference_type: string | null
          type: string
          wallet_id: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string
          created_by?: string | null
          created_by_role?: string
          direction: string
          id?: string
          metadata?: Json
          purpose?: string
          reference_id?: string | null
          reference_type?: string | null
          type: string
          wallet_id: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string
          created_by?: string | null
          created_by_role?: string
          direction?: string
          id?: string
          metadata?: Json
          purpose?: string
          reference_id?: string | null
          reference_type?: string | null
          type?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          critical_balance_threshold: number | null
          currency: string
          id: string
          low_balance_threshold: number | null
          organization_id: string
          status: string
          total_credited: number
          total_debited: number
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          critical_balance_threshold?: number | null
          currency?: string
          id?: string
          low_balance_threshold?: number | null
          organization_id: string
          status?: string
          total_credited?: number
          total_debited?: number
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          critical_balance_threshold?: number | null
          currency?: string
          id?: string
          low_balance_threshold?: number | null
          organization_id?: string
          status?: string
          total_credited?: number
          total_debited?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_bulk_logs: {
        Row: {
          created_at: string | null
          error: string | null
          id: string
          phone: string
          status: string
          template: string
        }
        Insert: {
          created_at?: string | null
          error?: string | null
          id?: string
          phone: string
          status: string
          template: string
        }
        Update: {
          created_at?: string | null
          error?: string | null
          id?: string
          phone?: string
          status?: string
          template?: string
        }
        Relationships: []
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
            referencedRelation: "sub_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          body: string | null
          category: string | null
          created_at: string
          footer: string | null
          header_media_mime: string | null
          header_media_url: string | null
          header_text: string | null
          header_type: string | null
          id: string
          language: string | null
          meta_template_id: string | null
          name: string
          organization_id: string
          status: string
          sub_organization_id: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          category?: string | null
          created_at?: string
          footer?: string | null
          header_media_mime?: string | null
          header_media_url?: string | null
          header_text?: string | null
          header_type?: string | null
          id?: string
          language?: string | null
          meta_template_id?: string | null
          name: string
          organization_id: string
          status?: string
          sub_organization_id?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          category?: string | null
          created_at?: string
          footer?: string | null
          header_media_mime?: string | null
          header_media_url?: string | null
          header_text?: string | null
          header_type?: string | null
          id?: string
          language?: string | null
          meta_template_id?: string | null
          name?: string
          organization_id?: string
          status?: string
          sub_organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_templates_sub_organization_id_fkey"
            columns: ["sub_organization_id"]
            isOneToOne: false
            referencedRelation: "sub_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_logs: {
        Row: {
          completed: boolean
          conversation_id: string | null
          created_at: string | null
          current_step_number: number | null
          data: Json | null
          id: string
          step_id: string | null
          variables: Json | null
          workflow_id: string | null
        }
        Insert: {
          completed?: boolean
          conversation_id?: string | null
          created_at?: string | null
          current_step_number?: number | null
          data?: Json | null
          id?: string
          step_id?: string | null
          variables?: Json | null
          workflow_id?: string | null
        }
        Update: {
          completed?: boolean
          conversation_id?: string | null
          created_at?: string | null
          current_step_number?: number | null
          data?: Json | null
          id?: string
          step_id?: string | null
          variables?: Json | null
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
          ai_action: string
          created_at: string | null
          expected_user_input: string | null
          id: string
          instruction_text: string | null
          metadata: Json | null
          step_order: number
          workflow_id: string | null
        }
        Insert: {
          action: Json
          ai_action?: string
          created_at?: string | null
          expected_user_input?: string | null
          id?: string
          instruction_text?: string | null
          metadata?: Json | null
          step_order: number
          workflow_id?: string | null
        }
        Update: {
          action?: Json
          ai_action?: string
          created_at?: string | null
          expected_user_input?: string | null
          id?: string
          instruction_text?: string | null
          metadata?: Json | null
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
          is_active: boolean
          mode: string
          name: string
          organization_id: string | null
          sub_organization_id: string | null
          trigger: Json | null
          trigger_type: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          mode?: string
          name: string
          organization_id?: string | null
          sub_organization_id?: string | null
          trigger?: Json | null
          trigger_type?: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          mode?: string
          name?: string
          organization_id?: string | null
          sub_organization_id?: string | null
          trigger?: Json | null
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflows_sub_organization_id_fkey"
            columns: ["sub_organization_id"]
            isOneToOne: false
            referencedRelation: "sub_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      campaign_analytics_summary: {
        Row: {
          campaign_id: string | null
          campaign_name: string | null
          completed_at: string | null
          created_at: string | null
          delivered_count: number | null
          delivery_percent: number | null
          failed_count: number | null
          failure_percent: number | null
          organization_id: string | null
          sent_count: number | null
          started_at: string | null
          sub_organization_id: string | null
          template_name: string | null
          total_recipients: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_sub_organization_id_fkey"
            columns: ["sub_organization_id"]
            isOneToOne: false
            referencedRelation: "sub_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_analytics_summary_v2: {
        Row: {
          avg_reply_seconds: number | null
          campaign_id: string | null
          campaign_name: string | null
          completed_at: string | null
          created_at: string | null
          delivered_count: number | null
          delivery_percent: number | null
          failed_count: number | null
          organization_id: string | null
          replied_count: number | null
          reply_percent: number | null
          scheduled_at: string | null
          sent_count: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["campaign_status"] | null
          sub_organization_id: string | null
          template_language: string | null
          template_name: string | null
          total_recipients: number | null
          whatsapp_template_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_sub_organization_id_fkey"
            columns: ["sub_organization_id"]
            isOneToOne: false
            referencedRelation: "sub_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_whatsapp_template_id_fkey"
            columns: ["whatsapp_template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_message_status_summary: {
        Row: {
          campaign_id: string | null
          cancelled_count: number | null
          delivered_count: number | null
          failed_count: number | null
          last_delivered_at: string | null
          last_dispatched_at: string | null
          pending_count: number | null
          queued_count: number | null
          sent_count: number | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_analytics_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_analytics_summary_v2"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_campaign_summary: {
        Row: {
          contact_id: string | null
          delivered_campaigns: string[] | null
          failed_campaigns: string[] | null
          first_name: string | null
          last_name: string | null
          model: string | null
          organization_id: string | null
          phone: string | null
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
      failure_reason_summary: {
        Row: {
          failure_count: number | null
          failure_reason: string | null
          organization_id: string | null
          sub_organization_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_sub_organization_id_fkey"
            columns: ["sub_organization_id"]
            isOneToOne: false
            referencedRelation: "sub_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      model_analytics_summary: {
        Row: {
          delivered_count: number | null
          delivery_percent: number | null
          failed_count: number | null
          model: string | null
          organization_id: string | null
          sub_organization_id: string | null
          total_messages: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_sub_organization_id_fkey"
            columns: ["sub_organization_id"]
            isOneToOne: false
            referencedRelation: "sub_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      template_analytics_summary: {
        Row: {
          delivered_count: number | null
          delivery_percent: number | null
          failed_count: number | null
          failure_percent: number | null
          organization_id: string | null
          sub_organization_id: string | null
          template_name: string | null
          total_messages: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_sub_organization_id_fkey"
            columns: ["sub_organization_id"]
            isOneToOne: false
            referencedRelation: "sub_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      template_analytics_summary_v2: {
        Row: {
          avg_reply_seconds: number | null
          delivered_count: number | null
          delivery_percent: number | null
          failed_count: number | null
          organization_id: string | null
          replied_count: number | null
          reply_percent: number | null
          sent_count: number | null
          sub_organization_id: string | null
          template_language: string | null
          template_name: string | null
          total_messages: number | null
          whatsapp_template_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_sub_organization_id_fkey"
            columns: ["sub_organization_id"]
            isOneToOne: false
            referencedRelation: "sub_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_whatsapp_template_id_fkey"
            columns: ["whatsapp_template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_overview_daily_v1: {
        Row: {
          active_conversations: number | null
          avg_first_response_seconds: number | null
          campaign_delivered: number | null
          campaign_delivery_percent: number | null
          campaign_failed: number | null
          campaign_replied: number | null
          campaign_reply_percent: number | null
          campaign_sent: number | null
          day: string | null
          inbound_messages: number | null
          organization_id: string | null
          outbound_messages: number | null
          sub_organization_id: string | null
        }
        Relationships: []
      }
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
      phase5_wallet_manual_credit: {
        Args: { p_amount: number; p_note?: string; p_organization_id: string }
        Returns: Json
      }
      phase6_log_unanswered_question: {
        Args: {
          p_ai_response: string
          p_channel: string
          p_conversation_id: string
          p_organization_id: string
          p_sub_organization_id: string
          p_user_message: string
        }
        Returns: undefined
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

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
      activities: {
        Row: {
          activity_at: string
          activity_type: string
          brand_id: string
          contact_id: string | null
          created_at: string
          deal_id: string | null
          due_at: string | null
          id: string
          notes: string | null
          organization_id: string | null
          outcome: string | null
          project_id: string | null
          project_task_id: string | null
          status: string
          strategic_move_id: string | null
          subject: string
        }
        Insert: {
          activity_at?: string
          activity_type?: string
          brand_id: string
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          due_at?: string | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          outcome?: string | null
          project_id?: string | null
          project_task_id?: string | null
          status?: string
          strategic_move_id?: string | null
          subject: string
        }
        Update: {
          activity_at?: string
          activity_type?: string
          brand_id?: string
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          due_at?: string | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          outcome?: string | null
          project_id?: string | null
          project_task_id?: string | null
          status?: string
          strategic_move_id?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_project_id_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_project_task_id_fk"
            columns: ["project_task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_strategic_move_id_fk"
            columns: ["strategic_move_id"]
            isOneToOne: false
            referencedRelation: "strategic_moves"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string | null
          id: string
          key: string | null
          name: string
          owner_user_id: string
          slug: string
          status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          key?: string | null
          name: string
          owner_user_id: string
          slug: string
          status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string | null
          name?: string
          owner_user_id?: string
          slug?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "Brands_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      buyer_inquiries: {
        Row: {
          business_name: string | null
          buyer_name: string | null
          company_name: string | null
          contact_id: string | null
          created_at: string
          email: string
          engagement_id: string | null
          first_name: string | null
          id: string
          last_name: string | null
          message: string | null
          metadata: Json
          organization_id: string | null
          phone: string | null
          purchase_timeline: string | null
          quantity_total: number | null
          referrer: string | null
          source_system: string
          source_type: string
          source_url: string | null
          status: string
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          website: string | null
        }
        Insert: {
          business_name?: string | null
          buyer_name?: string | null
          company_name?: string | null
          contact_id?: string | null
          created_at?: string
          email: string
          engagement_id?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          message?: string | null
          metadata?: Json
          organization_id?: string | null
          phone?: string | null
          purchase_timeline?: string | null
          quantity_total?: number | null
          referrer?: string | null
          source_system: string
          source_type?: string
          source_url?: string | null
          status?: string
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          website?: string | null
        }
        Update: {
          business_name?: string | null
          buyer_name?: string | null
          company_name?: string | null
          contact_id?: string | null
          created_at?: string
          email?: string
          engagement_id?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          message?: string | null
          metadata?: Json
          organization_id?: string | null
          phone?: string | null
          purchase_timeline?: string | null
          quantity_total?: number | null
          referrer?: string | null
          source_system?: string
          source_type?: string
          source_url?: string | null
          status?: string
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "buyer_inquiries_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_inquiries_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_inquiries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      buyer_inquiry_items: {
        Row: {
          buyer_inquiry_id: string
          created_at: string
          id: string
          metadata: Json
          part_number: string | null
          price_label: string | null
          product_category: string | null
          product_external_id: string | null
          product_key: string | null
          product_title: string | null
          product_url: string | null
          quantity: number
          recurring_label: string | null
          sku: string | null
          title: string | null
          variant_external_id: string | null
        }
        Insert: {
          buyer_inquiry_id: string
          created_at?: string
          id?: string
          metadata?: Json
          part_number?: string | null
          price_label?: string | null
          product_category?: string | null
          product_external_id?: string | null
          product_key?: string | null
          product_title?: string | null
          product_url?: string | null
          quantity?: number
          recurring_label?: string | null
          sku?: string | null
          title?: string | null
          variant_external_id?: string | null
        }
        Update: {
          buyer_inquiry_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          part_number?: string | null
          price_label?: string | null
          product_category?: string | null
          product_external_id?: string | null
          product_key?: string | null
          product_title?: string | null
          product_url?: string | null
          quantity?: number
          recurring_label?: string | null
          sku?: string | null
          title?: string | null
          variant_external_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "buyer_inquiry_items_buyer_inquiry_id_fkey"
            columns: ["buyer_inquiry_id"]
            isOneToOne: false
            referencedRelation: "buyer_inquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          archived_at: string | null
          brand_id: string
          channel_type: string | null
          connection_status: string | null
          created_at: string | null
          external_account_id: string | null
          handle_or_url: string | null
          id: string
          last_successful_sync_at: string | null
          last_sync_attempt_at: string | null
          name: string
          next_scheduled_sync_at: string | null
          provider: string | null
          status: string | null
          sync_enabled: boolean | null
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          brand_id: string
          channel_type?: string | null
          connection_status?: string | null
          created_at?: string | null
          external_account_id?: string | null
          handle_or_url?: string | null
          id?: string
          last_successful_sync_at?: string | null
          last_sync_attempt_at?: string | null
          name: string
          next_scheduled_sync_at?: string | null
          provider?: string | null
          status?: string | null
          sync_enabled?: boolean | null
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          brand_id?: string
          channel_type?: string | null
          connection_status?: string | null
          created_at?: string | null
          external_account_id?: string | null
          handle_or_url?: string | null
          id?: string
          last_successful_sync_at?: string | null
          last_sync_attempt_at?: string | null
          name?: string
          next_scheduled_sync_at?: string | null
          provider?: string | null
          status?: string | null
          sync_enabled?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "Channels_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      commerce_order_items: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          id: string
          metadata: Json
          order_id: string
          product_external_id: string | null
          product_key: string | null
          quantity: number
          sku: string | null
          stripe_price_id: string | null
          stripe_product_id: string | null
          title: string
          total_amount: number | null
          unit_amount: number | null
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json
          order_id: string
          product_external_id?: string | null
          product_key?: string | null
          quantity?: number
          sku?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          title: string
          total_amount?: number | null
          unit_amount?: number | null
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json
          order_id?: string
          product_external_id?: string | null
          product_key?: string | null
          quantity?: number
          sku?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          title?: string
          total_amount?: number | null
          unit_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "commerce_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "commerce_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      commerce_orders: {
        Row: {
          brand_key: string
          buyer_inquiry_id: string | null
          contact_id: string | null
          created_at: string
          currency: string
          discount_amount: number | null
          engagement_id: string | null
          fulfilled_at: string | null
          id: string
          metadata: Json
          organization_id: string | null
          paid_at: string | null
          source_system: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          subtotal_amount: number | null
          tax_amount: number | null
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          brand_key: string
          buyer_inquiry_id?: string | null
          contact_id?: string | null
          created_at?: string
          currency?: string
          discount_amount?: number | null
          engagement_id?: string | null
          fulfilled_at?: string | null
          id?: string
          metadata?: Json
          organization_id?: string | null
          paid_at?: string | null
          source_system?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal_amount?: number | null
          tax_amount?: number | null
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          brand_key?: string
          buyer_inquiry_id?: string | null
          contact_id?: string | null
          created_at?: string
          currency?: string
          discount_amount?: number | null
          engagement_id?: string | null
          fulfilled_at?: string | null
          id?: string
          metadata?: Json
          organization_id?: string | null
          paid_at?: string | null
          source_system?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal_amount?: number | null
          tax_amount?: number | null
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commerce_orders_buyer_inquiry_id_fkey"
            columns: ["buyer_inquiry_id"]
            isOneToOne: false
            referencedRelation: "buyer_inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commerce_orders_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commerce_orders_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commerce_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      commerce_prices: {
        Row: {
          active: boolean
          billing_type: string
          created_at: string
          currency: string
          id: string
          metadata: Json
          product_id: string
          recurring_interval: string | null
          stripe_price_id: string | null
          unit_amount: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          billing_type: string
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json
          product_id: string
          recurring_interval?: string | null
          stripe_price_id?: string | null
          unit_amount: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          billing_type?: string
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json
          product_id?: string
          recurring_interval?: string | null
          stripe_price_id?: string | null
          unit_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commerce_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "commerce_products"
            referencedColumns: ["id"]
          },
        ]
      }
      commerce_products: {
        Row: {
          active: boolean
          brand_key: string
          created_at: string
          description: string | null
          id: string
          metadata: Json
          product_key: string
          sales_mode: string
          stripe_product_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          brand_key: string
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          product_key: string
          sales_mode: string
          stripe_product_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          brand_key?: string
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          product_key?: string
          sales_mode?: string
          stripe_product_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          created_at: string
          email: string | null
          first_name: string
          id: string
          job_title: string | null
          last_name: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          source: string
          status: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          job_title?: string | null
          last_name?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          source?: string
          status?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          job_title?: string | null
          last_name?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          source?: string
          status?: string
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
      deals: {
        Row: {
          amount: number | null
          brand_id: string
          closed_at: string | null
          created_at: string
          expected_close_date: string | null
          id: string
          lead_source: string
          lost_at: string | null
          lost_reason: string | null
          name: string
          next_action: string | null
          next_action_due_at: string | null
          notes: string | null
          organization_id: string | null
          primary_contact_id: string | null
          probability: number | null
          stage: string
          updated_at: string
          value: number | null
          won_at: string | null
        }
        Insert: {
          amount?: number | null
          brand_id: string
          closed_at?: string | null
          created_at?: string
          expected_close_date?: string | null
          id?: string
          lead_source?: string
          lost_at?: string | null
          lost_reason?: string | null
          name: string
          next_action?: string | null
          next_action_due_at?: string | null
          notes?: string | null
          organization_id?: string | null
          primary_contact_id?: string | null
          probability?: number | null
          stage?: string
          updated_at?: string
          value?: number | null
          won_at?: string | null
        }
        Update: {
          amount?: number | null
          brand_id?: string
          closed_at?: string | null
          created_at?: string
          expected_close_date?: string | null
          id?: string
          lead_source?: string
          lost_at?: string | null
          lost_reason?: string | null
          name?: string
          next_action?: string | null
          next_action_due_at?: string | null
          notes?: string | null
          organization_id?: string | null
          primary_contact_id?: string | null
          probability?: number | null
          stage?: string
          updated_at?: string
          value?: number | null
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          created_at: string
          engagement_id: string
          event_type: string
          from_status: string | null
          id: string
          metadata: Json
          source: string | null
          to_status: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          created_at?: string
          engagement_id: string
          event_type: string
          from_status?: string | null
          id?: string
          metadata?: Json
          source?: string | null
          to_status?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          engagement_id?: string
          event_type?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          source?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagement_events_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      engagements: {
        Row: {
          booking_confirmed: boolean
          booking_confirmed_at: string | null
          brand_key: string
          company_name: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          entry_point: string | null
          follow_up_at: string | null
          funnel_key: string | null
          id: string
          intake_mode: string | null
          metadata: Json
          next_action: string | null
          operational_brief_json: Json
          operational_brief_text: string | null
          phone: string | null
          pipeline_stage: string
          priority_2: string | null
          priority_3: string | null
          project_type: string | null
          qualification_details: Json
          qualification_score: number | null
          raw_submission: Json
          schema_version: string
          source: string | null
          status: string
          submission_type: string
          updated_at: string
        }
        Insert: {
          booking_confirmed?: boolean
          booking_confirmed_at?: string | null
          brand_key?: string
          company_name?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          entry_point?: string | null
          follow_up_at?: string | null
          funnel_key?: string | null
          id?: string
          intake_mode?: string | null
          metadata?: Json
          next_action?: string | null
          operational_brief_json?: Json
          operational_brief_text?: string | null
          phone?: string | null
          pipeline_stage?: string
          priority_2?: string | null
          priority_3?: string | null
          project_type?: string | null
          qualification_details?: Json
          qualification_score?: number | null
          raw_submission: Json
          schema_version?: string
          source?: string | null
          status?: string
          submission_type: string
          updated_at?: string
        }
        Update: {
          booking_confirmed?: boolean
          booking_confirmed_at?: string | null
          brand_key?: string
          company_name?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          entry_point?: string | null
          follow_up_at?: string | null
          funnel_key?: string | null
          id?: string
          intake_mode?: string | null
          metadata?: Json
          next_action?: string | null
          operational_brief_json?: Json
          operational_brief_text?: string | null
          phone?: string | null
          pipeline_stage?: string
          priority_2?: string | null
          priority_3?: string | null
          project_type?: string | null
          qualification_details?: Json
          qualification_score?: number | null
          raw_submission?: Json
          schema_version?: string
          source?: string | null
          status?: string
          submission_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      integration_connections: {
        Row: {
          access_token_expires_at: string | null
          archived_at: string | null
          authentication_type: string
          channel_id: string
          connection_status: string | null
          created_at: string
          credential_ref: string
          environment: string
          granted_scopes: string[] | null
          id: string
          last_error_code: string | null
          last_error_message: string | null
          last_successful_sync_at: string | null
          last_sync_attempt_at: string | null
          next_scheduled_sync_at: string | null
          provider: string
          provider_external_account_id: string | null
          provider_metadata: Json | null
          refresh_token_expires_at: string | null
          sync_enabled: boolean | null
          updated_at: string
        }
        Insert: {
          access_token_expires_at?: string | null
          archived_at?: string | null
          authentication_type?: string
          channel_id: string
          connection_status?: string | null
          created_at?: string
          credential_ref: string
          environment?: string
          granted_scopes?: string[] | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_successful_sync_at?: string | null
          last_sync_attempt_at?: string | null
          next_scheduled_sync_at?: string | null
          provider: string
          provider_external_account_id?: string | null
          provider_metadata?: Json | null
          refresh_token_expires_at?: string | null
          sync_enabled?: boolean | null
          updated_at?: string
        }
        Update: {
          access_token_expires_at?: string | null
          archived_at?: string | null
          authentication_type?: string
          channel_id?: string
          connection_status?: string | null
          created_at?: string
          credential_ref?: string
          environment?: string
          granted_scopes?: string[] | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_successful_sync_at?: string | null
          last_sync_attempt_at?: string | null
          next_scheduled_sync_at?: string | null
          provider?: string
          provider_external_account_id?: string | null
          provider_metadata?: Json | null
          refresh_token_expires_at?: string | null
          sync_enabled?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_connections_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_oauth_states: {
        Row: {
          channel_id: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          nonce_hash: string
          provider: string
          user_id: string
        }
        Insert: {
          channel_id: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          nonce_hash: string
          provider: string
          user_id: string
        }
        Update: {
          channel_id?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          nonce_hash?: string
          provider?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_oauth_states_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_sync_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          execution_metadata: Json | null
          id: string
          integration_connection_id: string
          provider_cursor: Json | null
          records_read: number
          records_skipped: number
          records_written: number
          requested_at: string
          retry_count: number
          started_at: string | null
          status: string
          sync_type: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          execution_metadata?: Json | null
          id?: string
          integration_connection_id: string
          provider_cursor?: Json | null
          records_read?: number
          records_skipped?: number
          records_written?: number
          requested_at?: string
          retry_count?: number
          started_at?: string | null
          status: string
          sync_type: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          execution_metadata?: Json | null
          id?: string
          integration_connection_id?: string
          provider_cursor?: Json | null
          records_read?: number
          records_skipped?: number
          records_written?: number
          requested_at?: string
          retry_count?: number
          started_at?: string | null
          status?: string
          sync_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_sync_runs_integration_connection_id_fkey"
            columns: ["integration_connection_id"]
            isOneToOne: false
            referencedRelation: "integration_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_sync_runs_integration_connection_id_fkey"
            columns: ["integration_connection_id"]
            isOneToOne: false
            referencedRelation: "v_integration_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_definitions: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          key: string
          name: string
          unit: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          key: string
          name: string
          unit: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          key?: string
          name?: string
          unit?: string
        }
        Relationships: []
      }
      metric_observations: {
        Row: {
          channel_id: string | null
          created_at: string
          id: string
          metric_definition_id: string
          notes: string | null
          observed_at: string
          period_end: string | null
          period_start: string | null
          source: string
          strategic_move_id: string | null
          value: number
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          id?: string
          metric_definition_id: string
          notes?: string | null
          observed_at: string
          period_end?: string | null
          period_start?: string | null
          source?: string
          strategic_move_id?: string | null
          value: number
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          id?: string
          metric_definition_id?: string
          notes?: string | null
          observed_at?: string
          period_end?: string | null
          period_start?: string | null
          source?: string
          strategic_move_id?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "metric_observations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_observations_metric_definition_id_fkey"
            columns: ["metric_definition_id"]
            isOneToOne: false
            referencedRelation: "metric_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_observations_strategic_move_id_fk"
            columns: ["strategic_move_id"]
            isOneToOne: false
            referencedRelation: "strategic_moves"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          city: string | null
          created_at: string
          id: string
          industry: string | null
          name: string
          notes: string | null
          state: string | null
          status: string
          website: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          name: string
          notes?: string | null
          state?: string | null
          status?: string
          website?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          name?: string
          notes?: string | null
          state?: string | null
          status?: string
          website?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          contact_id: string | null
          created_at: string
          currency: string
          failed_at: string | null
          failure_code: string | null
          failure_message: string | null
          id: string
          metadata: Json
          order_id: string | null
          organization_id: string | null
          payment_method_type: string | null
          provider: string
          provider_customer_id: string | null
          provider_payment_id: string | null
          refunded_amount: number
          status: string
          stripe_charge_id: string | null
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          succeeded_at: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          contact_id?: string | null
          created_at?: string
          currency?: string
          failed_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          metadata?: Json
          order_id?: string | null
          organization_id?: string | null
          payment_method_type?: string | null
          provider?: string
          provider_customer_id?: string | null
          provider_payment_id?: string | null
          refunded_amount?: number
          status: string
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          succeeded_at?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          contact_id?: string | null
          created_at?: string
          currency?: string
          failed_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          metadata?: Json
          order_id?: string | null
          organization_id?: string | null
          payment_method_type?: string | null
          provider?: string
          provider_customer_id?: string | null
          provider_payment_id?: string | null
          refunded_amount?: number
          status?: string
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          succeeded_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "commerce_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_tasks: {
        Row: {
          blocked_reason: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          priority: string
          project_id: string
          status: string
          title: string
        }
        Insert: {
          blocked_reason?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          project_id: string
          status?: string
          title: string
        }
        Update: {
          blocked_reason?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          project_id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          brand_id: string
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          priority: string
          project_type: string
          started_at: string | null
          status: string
          strategic_move_id: string | null
          target_date: string | null
        }
        Insert: {
          brand_id: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          priority?: string
          project_type: string
          started_at?: string | null
          status?: string
          strategic_move_id?: string | null
          target_date?: string | null
        }
        Update: {
          brand_id?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          priority?: string
          project_type?: string
          started_at?: string | null
          status?: string
          strategic_move_id?: string | null
          target_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "Projects_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_strategic_move_id_fk"
            columns: ["strategic_move_id"]
            isOneToOne: false
            referencedRelation: "strategic_moves"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_task_completions: {
        Row: {
          completed_at: string
          completed_on: string
          created_at: string
          id: string
          notes: string | null
          recurring_task_id: string
        }
        Insert: {
          completed_at?: string
          completed_on: string
          created_at?: string
          id?: string
          notes?: string | null
          recurring_task_id: string
        }
        Update: {
          completed_at?: string
          completed_on?: string
          created_at?: string
          id?: string
          notes?: string | null
          recurring_task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_task_completions_recurring_task_id_fkey"
            columns: ["recurring_task_id"]
            isOneToOne: false
            referencedRelation: "recurring_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_tasks: {
        Row: {
          active: boolean
          brand_id: string
          cadence: string
          category: string
          created_at: string
          description: string | null
          due_time: string | null
          id: string
          priority: string
          target_count: number
          title: string
        }
        Insert: {
          active?: boolean
          brand_id: string
          cadence?: string
          category: string
          created_at?: string
          description?: string | null
          due_time?: string | null
          id?: string
          priority?: string
          target_count?: number
          title: string
        }
        Update: {
          active?: boolean
          brand_id?: string
          cadence?: string
          category?: string
          created_at?: string
          description?: string | null
          due_time?: string | null
          id?: string
          priority?: string
          target_count?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_tasks_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      strategic_moves: {
        Row: {
          archived_at: string | null
          blocker: string | null
          brand_id: string
          completed_at: string | null
          confidence_score: number
          created_at: string
          due_date: string | null
          effort_score: number
          expected_result: string | null
          horizon: string
          id: string
          impact_score: number
          next_action: string | null
          owner_id: string | null
          priority_score: number | null
          status: string
          thesis: string
          title: string
          updated_at: string
          urgency_score: number
          value_type: string
        }
        Insert: {
          archived_at?: string | null
          blocker?: string | null
          brand_id: string
          completed_at?: string | null
          confidence_score: number
          created_at?: string
          due_date?: string | null
          effort_score: number
          expected_result?: string | null
          horizon: string
          id?: string
          impact_score: number
          next_action?: string | null
          owner_id?: string | null
          priority_score?: number | null
          status: string
          thesis: string
          title: string
          updated_at?: string
          urgency_score: number
          value_type: string
        }
        Update: {
          archived_at?: string | null
          blocker?: string | null
          brand_id?: string
          completed_at?: string | null
          confidence_score?: number
          created_at?: string
          due_date?: string | null
          effort_score?: number
          expected_result?: string | null
          horizon?: string
          id?: string
          impact_score?: number
          next_action?: string | null
          owner_id?: string | null
          priority_score?: number | null
          status?: string
          thesis?: string
          title?: string
          updated_at?: string
          urgency_score?: number
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategic_moves_brand_id_fk"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_customers: {
        Row: {
          contact_id: string | null
          created_at: string
          id: string
          metadata: Json
          organization_id: string | null
          stripe_customer_id: string
          updated_at: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          organization_id?: string | null
          stripe_customer_id: string
          updated_at?: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          organization_id?: string | null
          stripe_customer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_customers_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stripe_customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_events: {
        Row: {
          api_version: string | null
          error_message: string | null
          event_type: string
          id: string
          livemode: boolean | null
          payload: Json
          processed_at: string | null
          processing_attempts: number
          processing_status: string
          received_at: string
          stripe_event_id: string
          stripe_object_id: string | null
        }
        Insert: {
          api_version?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          livemode?: boolean | null
          payload: Json
          processed_at?: string | null
          processing_attempts?: number
          processing_status?: string
          received_at?: string
          stripe_event_id: string
          stripe_object_id?: string | null
        }
        Update: {
          api_version?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          livemode?: boolean | null
          payload?: Json
          processed_at?: string | null
          processing_attempts?: number
          processing_status?: string
          received_at?: string
          stripe_event_id?: string
          stripe_object_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_integration_connections_safe: {
        Row: {
          access_token_expires_at: string | null
          archived_at: string | null
          authentication_type: string | null
          channel_id: string | null
          connection_status: string | null
          created_at: string | null
          environment: string | null
          granted_scopes: string[] | null
          id: string | null
          last_error_code: string | null
          last_successful_sync_at: string | null
          last_sync_attempt_at: string | null
          next_scheduled_sync_at: string | null
          provider: string | null
          provider_external_account_id: string | null
          refresh_token_expires_at: string | null
          sync_enabled: boolean | null
          updated_at: string | null
        }
        Insert: {
          access_token_expires_at?: string | null
          archived_at?: string | null
          authentication_type?: string | null
          channel_id?: string | null
          connection_status?: string | null
          created_at?: string | null
          environment?: string | null
          granted_scopes?: string[] | null
          id?: string | null
          last_error_code?: string | null
          last_successful_sync_at?: string | null
          last_sync_attempt_at?: string | null
          next_scheduled_sync_at?: string | null
          provider?: string | null
          provider_external_account_id?: string | null
          refresh_token_expires_at?: string | null
          sync_enabled?: boolean | null
          updated_at?: string | null
        }
        Update: {
          access_token_expires_at?: string | null
          archived_at?: string | null
          authentication_type?: string | null
          channel_id?: string | null
          connection_status?: string | null
          created_at?: string | null
          environment?: string | null
          granted_scopes?: string[] | null
          id?: string | null
          last_error_code?: string | null
          last_successful_sync_at?: string | null
          last_sync_attempt_at?: string | null
          next_scheduled_sync_at?: string | null
          provider?: string | null
          provider_external_account_id?: string | null
          refresh_token_expires_at?: string | null
          sync_enabled?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_connections_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      v_integration_sync_runs_safe: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_code: string | null
          id: string | null
          integration_connection_id: string | null
          records_read: number | null
          records_skipped: number | null
          records_written: number | null
          requested_at: string | null
          retry_count: number | null
          started_at: string | null
          status: string | null
          sync_type: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_code?: string | null
          id?: string | null
          integration_connection_id?: string | null
          records_read?: number | null
          records_skipped?: number | null
          records_written?: number | null
          requested_at?: string | null
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          sync_type?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_code?: string | null
          id?: string | null
          integration_connection_id?: string | null
          records_read?: number | null
          records_skipped?: number | null
          records_written?: number | null
          requested_at?: string | null
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          sync_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_sync_runs_integration_connection_id_fkey"
            columns: ["integration_connection_id"]
            isOneToOne: false
            referencedRelation: "integration_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_sync_runs_integration_connection_id_fkey"
            columns: ["integration_connection_id"]
            isOneToOne: false
            referencedRelation: "v_integration_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      consume_integration_oauth_state: {
        Args: { p_nonce_hash: string }
        Returns: {
          channel_id: string
          expires_at: string
          provider: string
          user_id: string
        }[]
      }
      create_engagement_with_events: {
        Args: { p_engagement_data: Json; p_initial_events: Json }
        Returns: Json
      }
      delete_integration_credential: {
        Args: { p_secret_id: string }
        Returns: undefined
      }
      get_integration_credential: {
        Args: { p_secret_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_website_outbound_crm_lead: {
        Args: { p_payload: Json }
        Returns: Json
      }
      ingest_buyer_inquiry: { Args: { payload: Json }; Returns: Json }
      process_stripe_event: {
        Args: { event: Json }
        Returns: {
          duplicate: boolean
          processing_status: string
          received: boolean
        }[]
      }
      record_booking_confirmation: {
        Args: {
          p_calendar_provider: string
          p_calendar_url: string
          p_submission_id: string
          p_timestamp: string
        }
        Returns: Json
      }
      store_integration_credential: {
        Args: {
          p_existing_secret_id: string
          p_secret_description: string
          p_secret_name: string
          p_secret_payload: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "owner"
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
      app_role: ["owner"],
    },
  },
} as const

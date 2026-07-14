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
      alert_categories: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          is_system: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      alert_history: {
        Row: {
          alert_id: string
          channel: Database["public"]["Enums"]["notification_channel"]
          days_before_due: number | null
          error_message: string | null
          id: string
          recipient_email: string | null
          recipient_phone: string | null
          sent_at: string
          status: string
        }
        Insert: {
          alert_id: string
          channel: Database["public"]["Enums"]["notification_channel"]
          days_before_due?: number | null
          error_message?: string | null
          id?: string
          recipient_email?: string | null
          recipient_phone?: string | null
          sent_at?: string
          status?: string
        }
        Update: {
          alert_id?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          days_before_due?: number | null
          error_message?: string | null
          id?: string
          recipient_email?: string | null
          recipient_phone?: string | null
          sent_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_history_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_recipients: {
        Row: {
          alert_id: string
          created_at: string
          email: string | null
          id: string
          phone: string | null
          user_id: string | null
        }
        Insert: {
          alert_id: string
          created_at?: string
          email?: string | null
          id?: string
          phone?: string | null
          user_id?: string | null
        }
        Update: {
          alert_id?: string
          created_at?: string
          email?: string | null
          id?: string
          phone?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alert_recipients_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_viewers: {
        Row: {
          alert_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          alert_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          alert_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_viewers_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          alert_subtype: string | null
          alert_type: Database["public"]["Enums"]["alert_type"]
          assigned_to: string | null
          category_id: string | null
          channels: Database["public"]["Enums"]["notification_channel"][]
          completed_at: string | null
          completed_by: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          days_before: number[]
          deleted_at: string | null
          deleted_by: string | null
          due_date: string
          external_emails: string[] | null
          id: string
          is_active: boolean
          item_id: string | null
          item_type: string | null
          last_sent_at: string | null
          message: string | null
          next_send_at: string | null
          priority: number | null
          repeat_every_days: number | null
          service_contract_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          alert_subtype?: string | null
          alert_type?: Database["public"]["Enums"]["alert_type"]
          assigned_to?: string | null
          category_id?: string | null
          channels?: Database["public"]["Enums"]["notification_channel"][]
          completed_at?: string | null
          completed_by?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          days_before?: number[]
          deleted_at?: string | null
          deleted_by?: string | null
          due_date: string
          external_emails?: string[] | null
          id?: string
          is_active?: boolean
          item_id?: string | null
          item_type?: string | null
          last_sent_at?: string | null
          message?: string | null
          next_send_at?: string | null
          priority?: number | null
          repeat_every_days?: number | null
          service_contract_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          alert_subtype?: string | null
          alert_type?: Database["public"]["Enums"]["alert_type"]
          assigned_to?: string | null
          category_id?: string | null
          channels?: Database["public"]["Enums"]["notification_channel"][]
          completed_at?: string | null
          completed_by?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          days_before?: number[]
          deleted_at?: string | null
          deleted_by?: string | null
          due_date?: string
          external_emails?: string[] | null
          id?: string
          is_active?: boolean
          item_id?: string | null
          item_type?: string | null
          last_sent_at?: string | null
          message?: string | null
          next_send_at?: string | null
          priority?: number | null
          repeat_every_days?: number | null
          service_contract_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "alert_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_service_contract_id_fkey"
            columns: ["service_contract_id"]
            isOneToOne: false
            referencedRelation: "service_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      app_logos: {
        Row: {
          created_at: string
          display_name: string
          display_order: number | null
          id: string
          is_active: boolean | null
          logo_key: string
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          logo_key: string
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          logo_key?: string
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      budget_carryover: {
        Row: {
          amount_uf: number
          budget_type: string
          contract_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          purchase_order_id: string
          source_year: number
          target_year: number
        }
        Insert: {
          amount_uf?: number
          budget_type: string
          contract_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          purchase_order_id: string
          source_year: number
          target_year: number
        }
        Update: {
          amount_uf?: number
          budget_type?: string
          contract_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          purchase_order_id?: string
          source_year?: number
          target_year?: number
        }
        Relationships: [
          {
            foreignKeyName: "budget_carryover_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_carryover_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_line_progress_statuses: {
        Row: {
          color: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          is_selectable: boolean
          name: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_selectable?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_selectable?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      budget_lines: {
        Row: {
          amount_uf: number
          budget_id: string
          calc_percentage: number | null
          calc_source_line_id: string | null
          calc_type: string | null
          category_id: string | null
          created_at: string
          currency: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          display_order: number | null
          id: string
          is_ghost: boolean
          is_surcharge: boolean
          merged_into_line_id: string | null
          moved_at: string | null
          moved_by: string | null
          moved_to_line_id: string | null
          name: string
          original_amount_uf: number | null
          parent_id: string | null
          progress_status_id: string | null
          quantity: number | null
          status: string
          supplier_id: string | null
          supplier_name: string | null
          surcharge_parent_line_id: string | null
          surcharge_reason: string | null
          template_line_id: string | null
          unit_price: number | null
          unit_type: string | null
          updated_at: string
        }
        Insert: {
          amount_uf?: number
          budget_id: string
          calc_percentage?: number | null
          calc_source_line_id?: string | null
          calc_type?: string | null
          category_id?: string | null
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_ghost?: boolean
          is_surcharge?: boolean
          merged_into_line_id?: string | null
          moved_at?: string | null
          moved_by?: string | null
          moved_to_line_id?: string | null
          name: string
          original_amount_uf?: number | null
          parent_id?: string | null
          progress_status_id?: string | null
          quantity?: number | null
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          surcharge_parent_line_id?: string | null
          surcharge_reason?: string | null
          template_line_id?: string | null
          unit_price?: number | null
          unit_type?: string | null
          updated_at?: string
        }
        Update: {
          amount_uf?: number
          budget_id?: string
          calc_percentage?: number | null
          calc_source_line_id?: string | null
          calc_type?: string | null
          category_id?: string | null
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_ghost?: boolean
          is_surcharge?: boolean
          merged_into_line_id?: string | null
          moved_at?: string | null
          moved_by?: string | null
          moved_to_line_id?: string | null
          name?: string
          original_amount_uf?: number | null
          parent_id?: string | null
          progress_status_id?: string | null
          quantity?: number | null
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          surcharge_parent_line_id?: string | null
          surcharge_reason?: string | null
          template_line_id?: string | null
          unit_price?: number | null
          unit_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_lines_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "contract_budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_calc_source_line_id_fkey"
            columns: ["calc_source_line_id"]
            isOneToOne: false
            referencedRelation: "budget_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "supplier_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_merged_into_line_id_fkey"
            columns: ["merged_into_line_id"]
            isOneToOne: false
            referencedRelation: "budget_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_moved_to_line_id_fkey"
            columns: ["moved_to_line_id"]
            isOneToOne: false
            referencedRelation: "budget_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "budget_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_progress_status_id_fkey"
            columns: ["progress_status_id"]
            isOneToOne: false
            referencedRelation: "budget_line_progress_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_surcharge_parent_line_id_fkey"
            columns: ["surcharge_parent_line_id"]
            isOneToOne: false
            referencedRelation: "budget_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_template_line_id_fkey"
            columns: ["template_line_id"]
            isOneToOne: false
            referencedRelation: "budget_template_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_lines_audit: {
        Row: {
          action: string
          budget_id: string
          budget_line_id: string
          changed_at: string | null
          changed_by: string | null
          id: string
          new_values: Json | null
          old_values: Json | null
        }
        Insert: {
          action: string
          budget_id: string
          budget_line_id: string
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
        }
        Update: {
          action?: string
          budget_id?: string
          budget_line_id?: string
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
        }
        Relationships: []
      }
      budget_reassignments: {
        Row: {
          amount_uf: number
          budget_line_id: string | null
          id: string
          notes: string | null
          purchase_item_id: string | null
          purchase_order_id: string | null
          reassigned_at: string
          reassigned_by: string | null
          source_budget_id: string
          target_budget_id: string
        }
        Insert: {
          amount_uf: number
          budget_line_id?: string | null
          id?: string
          notes?: string | null
          purchase_item_id?: string | null
          purchase_order_id?: string | null
          reassigned_at?: string
          reassigned_by?: string | null
          source_budget_id: string
          target_budget_id: string
        }
        Update: {
          amount_uf?: number
          budget_line_id?: string | null
          id?: string
          notes?: string | null
          purchase_item_id?: string | null
          purchase_order_id?: string | null
          reassigned_at?: string
          reassigned_by?: string | null
          source_budget_id?: string
          target_budget_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_reassignments_budget_line_id_fkey"
            columns: ["budget_line_id"]
            isOneToOne: false
            referencedRelation: "budget_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_reassignments_purchase_item_id_fkey"
            columns: ["purchase_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_reassignments_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_reassignments_source_budget_id_fkey"
            columns: ["source_budget_id"]
            isOneToOne: false
            referencedRelation: "contract_budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_reassignments_target_budget_id_fkey"
            columns: ["target_budget_id"]
            isOneToOne: false
            referencedRelation: "contract_budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_template_lines: {
        Row: {
          calc_percentage: number | null
          calc_source_line_id: string | null
          calc_type: string | null
          category_id: string | null
          created_at: string
          currency: string | null
          default_amount_uf: number | null
          description: string | null
          display_order: number | null
          id: string
          name: string
          parent_id: string | null
          quantity: number | null
          quantity_source: string | null
          supplier_name: string | null
          template_id: string
          unit_type: string | null
        }
        Insert: {
          calc_percentage?: number | null
          calc_source_line_id?: string | null
          calc_type?: string | null
          category_id?: string | null
          created_at?: string
          currency?: string | null
          default_amount_uf?: number | null
          description?: string | null
          display_order?: number | null
          id?: string
          name: string
          parent_id?: string | null
          quantity?: number | null
          quantity_source?: string | null
          supplier_name?: string | null
          template_id: string
          unit_type?: string | null
        }
        Update: {
          calc_percentage?: number | null
          calc_source_line_id?: string | null
          calc_type?: string | null
          category_id?: string | null
          created_at?: string
          currency?: string | null
          default_amount_uf?: number | null
          description?: string | null
          display_order?: number | null
          id?: string
          name?: string
          parent_id?: string | null
          quantity?: number | null
          quantity_source?: string | null
          supplier_name?: string | null
          template_id?: string
          unit_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_template_lines_calc_source_line_id_fkey"
            columns: ["calc_source_line_id"]
            isOneToOne: false
            referencedRelation: "budget_template_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_template_lines_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "supplier_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_template_lines_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "budget_template_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_template_lines_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "budget_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_templates: {
        Row: {
          budget_type: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          budget_type: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          budget_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      closing_process_notes: {
        Row: {
          contract_id: string
          created_at: string
          created_by: string | null
          id: string
          note: string
          updated_at: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          note: string
          updated_at?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "closing_process_notes_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      cloud_storage_connections: {
        Row: {
          config: Json | null
          created_at: string
          folder_url: string | null
          id: string
          is_active: boolean | null
          name: string
          provider: string
          updated_at: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          folder_url?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          provider: string
          updated_at?: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          folder_url?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      cloud_storage_tokens: {
        Row: {
          access_token: string | null
          connection_id: string
          created_at: string
          id: string
          refresh_token: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          connection_id: string
          created_at?: string
          id?: string
          refresh_token?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          connection_id?: string
          created_at?: string
          id?: string
          refresh_token?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cloud_storage_tokens_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "cloud_storage_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cloud_storage_tokens_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "cloud_storage_connections_public"
            referencedColumns: ["id"]
          },
        ]
      }
      comite_gp_statuses: {
        Row: {
          color: string | null
          created_at: string
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      contract_addresses: {
        Row: {
          commune: string
          contract_id: string
          country: string
          created_at: string
          geocode_source: string | null
          geocoded_at: string | null
          id: string
          lat: number | null
          lng: number | null
          number: string
          region: string
          rol_sii: string | null
          street: string
        }
        Insert: {
          commune: string
          contract_id: string
          country?: string
          created_at?: string
          geocode_source?: string | null
          geocoded_at?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          number: string
          region: string
          rol_sii?: string | null
          street: string
        }
        Update: {
          commune?: string
          contract_id?: string
          country?: string
          created_at?: string
          geocode_source?: string | null
          geocoded_at?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          number?: string
          region?: string
          rol_sii?: string | null
          street?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_addresses_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_budgets: {
        Row: {
          amount_uf: number
          budget_type: string
          closed_at: string | null
          closed_by: string | null
          contract_id: string | null
          created_at: string
          frozen_amount_uf: number | null
          frozen_at: string | null
          frozen_by: string | null
          id: string
          is_closed: boolean | null
          service_contract_id: string | null
          updated_at: string
          year: number
        }
        Insert: {
          amount_uf?: number
          budget_type: string
          closed_at?: string | null
          closed_by?: string | null
          contract_id?: string | null
          created_at?: string
          frozen_amount_uf?: number | null
          frozen_at?: string | null
          frozen_by?: string | null
          id?: string
          is_closed?: boolean | null
          service_contract_id?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          amount_uf?: number
          budget_type?: string
          closed_at?: string | null
          closed_by?: string | null
          contract_id?: string | null
          created_at?: string
          frozen_amount_uf?: number | null
          frozen_at?: string | null
          frozen_by?: string | null
          id?: string
          is_closed?: boolean | null
          service_contract_id?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_budgets_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_budgets_service_contract_id_fkey"
            columns: ["service_contract_id"]
            isOneToOne: false
            referencedRelation: "service_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_business_cases: {
        Row: {
          computed: Json
          contract_id: string
          created_at: string
          created_by: string | null
          id: string
          inputs: Json
          overrides: Json
          updated_at: string
        }
        Insert: {
          computed?: Json
          contract_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          inputs?: Json
          overrides?: Json
          updated_at?: string
        }
        Update: {
          computed?: Json
          contract_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          inputs?: Json
          overrides?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_business_cases_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_companies: {
        Row: {
          company_id: string
          contract_id: string
          created_at: string
          id: string
        }
        Insert: {
          company_id: string
          contract_id: string
          created_at?: string
          id?: string
        }
        Update: {
          company_id?: string
          contract_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_companies_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_contacts: {
        Row: {
          cedula_identidad: string | null
          company: string
          contract_id: string
          created_at: string
          domicilio_comercial: string | null
          email: string | null
          id: string
          name: string
          phone: string
        }
        Insert: {
          cedula_identidad?: string | null
          company: string
          contract_id: string
          created_at?: string
          domicilio_comercial?: string | null
          email?: string | null
          id?: string
          name: string
          phone: string
        }
        Update: {
          cedula_identidad?: string | null
          company?: string
          contract_id?: string
          created_at?: string
          domicilio_comercial?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_contacts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_custom_field_values: {
        Row: {
          contract_id: string
          created_at: string
          field_id: string
          field_value: string | null
          id: string
          updated_at: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          field_id: string
          field_value?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          field_id?: string
          field_value?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_custom_field_values_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_custom_field_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "contract_custom_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_custom_fields: {
        Row: {
          created_at: string
          created_by: string | null
          display_order: number | null
          field_name: string
          id: string
          is_active: boolean | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_order?: number | null
          field_name: string
          id?: string
          is_active?: boolean | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_order?: number | null
          field_name?: string
          id?: string
          is_active?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      contract_documents: {
        Row: {
          contract_id: string
          document_type: Database["public"]["Enums"]["document_type"]
          id: string
          uploaded_at: string
          url: string
          version_id: string | null
        }
        Insert: {
          contract_id: string
          document_type: Database["public"]["Enums"]["document_type"]
          id?: string
          uploaded_at?: string
          url: string
          version_id?: string | null
        }
        Update: {
          contract_id?: string
          document_type?: Database["public"]["Enums"]["document_type"]
          id?: string
          uploaded_at?: string
          url?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_documents_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "contract_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_import_audit: {
        Row: {
          category: string
          confidence: string
          contract_id: string
          field_label: string
          field_name: string
          id: string
          imported_at: string
          imported_by: string | null
          imported_value: string
        }
        Insert: {
          category: string
          confidence: string
          contract_id: string
          field_label: string
          field_name: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          imported_value: string
        }
        Update: {
          category?: string
          confidence?: string
          contract_id?: string
          field_label?: string
          field_name?: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          imported_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_import_audit_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_patents: {
        Row: {
          comments: string | null
          contract_id: string
          created_at: string
          id: string
          next_actions: string | null
          priority: Database["public"]["Enums"]["patent_priority"]
          priority_changed_at: string | null
          priority_changed_by: string | null
          updated_at: string
        }
        Insert: {
          comments?: string | null
          contract_id: string
          created_at?: string
          id?: string
          next_actions?: string | null
          priority?: Database["public"]["Enums"]["patent_priority"]
          priority_changed_at?: string | null
          priority_changed_by?: string | null
          updated_at?: string
        }
        Update: {
          comments?: string | null
          contract_id?: string
          created_at?: string
          id?: string
          next_actions?: string | null
          priority?: Database["public"]["Enums"]["patent_priority"]
          priority_changed_at?: string | null
          priority_changed_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_patents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_versions: {
        Row: {
          adicional_administracion_percentage: number | null
          adjustment_periodicity_months: number | null
          adjustment_type: string | null
          adjustment_value: number | null
          auto_renewal: boolean | null
          auto_renewal_months: number | null
          auto_renewal_type: string | null
          contract_id: string
          created_at: string
          duration_months: number
          effective_date: string | null
          first_adjustment_month: number | null
          fondo_promocion_percentage: number | null
          gastos_comunes_fixed_admin_uf: number | null
          gastos_comunes_methodology: string | null
          gastos_comunes_percentage: number | null
          gastos_comunes_prorrata_kwh_clima: number | null
          gastos_comunes_tope: number | null
          gastos_comunes_tope_type: string | null
          gastos_comunes_total_centro: number | null
          gastos_comunes_uf_m2: number | null
          gastos_comunes_uf_ml_frente: number | null
          grace_months: number | null
          guarantee_fixed_amount: number | null
          guarantee_fixed_currency: string | null
          guarantee_multiplier: number | null
          guarantee_type: string | null
          has_extended_gastos_comunes: boolean | null
          has_periodic_adjustments: boolean | null
          id: string
          initial_rent: number | null
          initial_rent_is_uf_m2: boolean | null
          is_current: boolean
          is_renegotiation: boolean
          notice_bilaterality: string | null
          notice_type: Database["public"]["Enums"]["notice_type"]
          notice_value: string
          otros_egresos_amount: number | null
          otros_egresos_description: string | null
          regime_rent: number
          regime_rent_is_uf_m2: boolean | null
          variable_rent_percentage: number | null
          version_number: number
        }
        Insert: {
          adicional_administracion_percentage?: number | null
          adjustment_periodicity_months?: number | null
          adjustment_type?: string | null
          adjustment_value?: number | null
          auto_renewal?: boolean | null
          auto_renewal_months?: number | null
          auto_renewal_type?: string | null
          contract_id: string
          created_at?: string
          duration_months: number
          effective_date?: string | null
          first_adjustment_month?: number | null
          fondo_promocion_percentage?: number | null
          gastos_comunes_fixed_admin_uf?: number | null
          gastos_comunes_methodology?: string | null
          gastos_comunes_percentage?: number | null
          gastos_comunes_prorrata_kwh_clima?: number | null
          gastos_comunes_tope?: number | null
          gastos_comunes_tope_type?: string | null
          gastos_comunes_total_centro?: number | null
          gastos_comunes_uf_m2?: number | null
          gastos_comunes_uf_ml_frente?: number | null
          grace_months?: number | null
          guarantee_fixed_amount?: number | null
          guarantee_fixed_currency?: string | null
          guarantee_multiplier?: number | null
          guarantee_type?: string | null
          has_extended_gastos_comunes?: boolean | null
          has_periodic_adjustments?: boolean | null
          id?: string
          initial_rent?: number | null
          initial_rent_is_uf_m2?: boolean | null
          is_current?: boolean
          is_renegotiation?: boolean
          notice_bilaterality?: string | null
          notice_type: Database["public"]["Enums"]["notice_type"]
          notice_value: string
          otros_egresos_amount?: number | null
          otros_egresos_description?: string | null
          regime_rent: number
          regime_rent_is_uf_m2?: boolean | null
          variable_rent_percentage?: number | null
          version_number: number
        }
        Update: {
          adicional_administracion_percentage?: number | null
          adjustment_periodicity_months?: number | null
          adjustment_type?: string | null
          adjustment_value?: number | null
          auto_renewal?: boolean | null
          auto_renewal_months?: number | null
          auto_renewal_type?: string | null
          contract_id?: string
          created_at?: string
          duration_months?: number
          effective_date?: string | null
          first_adjustment_month?: number | null
          fondo_promocion_percentage?: number | null
          gastos_comunes_fixed_admin_uf?: number | null
          gastos_comunes_methodology?: string | null
          gastos_comunes_percentage?: number | null
          gastos_comunes_prorrata_kwh_clima?: number | null
          gastos_comunes_tope?: number | null
          gastos_comunes_tope_type?: string | null
          gastos_comunes_total_centro?: number | null
          gastos_comunes_uf_m2?: number | null
          gastos_comunes_uf_ml_frente?: number | null
          grace_months?: number | null
          guarantee_fixed_amount?: number | null
          guarantee_fixed_currency?: string | null
          guarantee_multiplier?: number | null
          guarantee_type?: string | null
          has_extended_gastos_comunes?: boolean | null
          has_periodic_adjustments?: boolean | null
          id?: string
          initial_rent?: number | null
          initial_rent_is_uf_m2?: boolean | null
          is_current?: boolean
          is_renegotiation?: boolean
          notice_bilaterality?: string | null
          notice_type?: Database["public"]["Enums"]["notice_type"]
          notice_value?: string
          otros_egresos_amount?: number | null
          otros_egresos_description?: string | null
          regime_rent?: number
          regime_rent_is_uf_m2?: boolean | null
          variable_rent_percentage?: number | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_versions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          business_case_url: string | null
          clasificacion: string | null
          comite_gp_status: string | null
          company_id: string | null
          created_at: string
          deleted_at: string | null
          display_currency: string | null
          drive_folder_id: string | null
          es_esquina: boolean | null
          id: string
          is_expired_but_operating: boolean | null
          metros_lineales_frente: number | null
          metros_lineales_frente_2: number | null
          name: string
          negotiation_notes: string | null
          negotiation_subcategory: string | null
          num_estacionamientos: number | null
          obra_status: string | null
          operation_status: string | null
          origen: string | null
          patente_status: string | null
          proyecto_status: string | null
          requires_special_attention: boolean | null
          signed_date: string | null
          special_attention_reason: string | null
          status: Database["public"]["Enums"]["contract_status"]
          superficie_bodega_backoffice: number | null
          superficie_edificada_local: number | null
          superficie_exterior_cubierto: number | null
          superficie_exterior_descubierto: number | null
          superficie_mezanina_altillo: number | null
          superficie_segundo_nivel: number | null
          superficie_showroom: number | null
          superficie_terreno: number | null
          updated_at: string
          venta_estimada: number | null
          venta_estimada_max: number | null
        }
        Insert: {
          business_case_url?: string | null
          clasificacion?: string | null
          comite_gp_status?: string | null
          company_id?: string | null
          created_at?: string
          deleted_at?: string | null
          display_currency?: string | null
          drive_folder_id?: string | null
          es_esquina?: boolean | null
          id?: string
          is_expired_but_operating?: boolean | null
          metros_lineales_frente?: number | null
          metros_lineales_frente_2?: number | null
          name: string
          negotiation_notes?: string | null
          negotiation_subcategory?: string | null
          num_estacionamientos?: number | null
          obra_status?: string | null
          operation_status?: string | null
          origen?: string | null
          patente_status?: string | null
          proyecto_status?: string | null
          requires_special_attention?: boolean | null
          signed_date?: string | null
          special_attention_reason?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          superficie_bodega_backoffice?: number | null
          superficie_edificada_local?: number | null
          superficie_exterior_cubierto?: number | null
          superficie_exterior_descubierto?: number | null
          superficie_mezanina_altillo?: number | null
          superficie_segundo_nivel?: number | null
          superficie_showroom?: number | null
          superficie_terreno?: number | null
          updated_at?: string
          venta_estimada?: number | null
          venta_estimada_max?: number | null
        }
        Update: {
          business_case_url?: string | null
          clasificacion?: string | null
          comite_gp_status?: string | null
          company_id?: string | null
          created_at?: string
          deleted_at?: string | null
          display_currency?: string | null
          drive_folder_id?: string | null
          es_esquina?: boolean | null
          id?: string
          is_expired_but_operating?: boolean | null
          metros_lineales_frente?: number | null
          metros_lineales_frente_2?: number | null
          name?: string
          negotiation_notes?: string | null
          negotiation_subcategory?: string | null
          num_estacionamientos?: number | null
          obra_status?: string | null
          operation_status?: string | null
          origen?: string | null
          patente_status?: string | null
          proyecto_status?: string | null
          requires_special_attention?: boolean | null
          signed_date?: string | null
          special_attention_reason?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          superficie_bodega_backoffice?: number | null
          superficie_edificada_local?: number | null
          superficie_exterior_cubierto?: number | null
          superficie_exterior_descubierto?: number | null
          superficie_mezanina_altillo?: number | null
          superficie_segundo_nivel?: number | null
          superficie_showroom?: number | null
          superficie_terreno?: number | null
          updated_at?: string
          venta_estimada?: number | null
          venta_estimada_max?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notes: {
        Row: {
          amount_clp: number | null
          amount_uf: number
          attachment_url: string | null
          created_at: string
          credit_note_date: string
          credit_note_number: string
          deleted_at: string | null
          deleted_by: string | null
          drive_file_id: string | null
          id: string
          input_currency: string | null
          invoice_id: string
          purchase_order_id: string
          reason: string | null
          storage_provider: string | null
          uf_value_at_entry: number | null
          updated_at: string
        }
        Insert: {
          amount_clp?: number | null
          amount_uf?: number
          attachment_url?: string | null
          created_at?: string
          credit_note_date?: string
          credit_note_number: string
          deleted_at?: string | null
          deleted_by?: string | null
          drive_file_id?: string | null
          id?: string
          input_currency?: string | null
          invoice_id: string
          purchase_order_id: string
          reason?: string | null
          storage_provider?: string | null
          uf_value_at_entry?: number | null
          updated_at?: string
        }
        Update: {
          amount_clp?: number | null
          amount_uf?: number
          attachment_url?: string | null
          created_at?: string
          credit_note_date?: string
          credit_note_number?: string
          deleted_at?: string | null
          deleted_by?: string | null
          drive_file_id?: string | null
          id?: string
          input_currency?: string | null
          invoice_id?: string
          purchase_order_id?: string
          reason?: string | null
          storage_provider?: string | null
          uf_value_at_entry?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_sections: {
        Row: {
          created_at: string | null
          display_order: number
          id: string
          is_visible: boolean
          section_key: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          display_order?: number
          id?: string
          is_visible?: boolean
          section_key: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          display_order?: number
          id?: string
          is_visible?: boolean
          section_key?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      economic_indicators_cache: {
        Row: {
          date: string
          indicator: string
          is_stale: boolean
          last_updated: string
          source: string
          value: number
        }
        Insert: {
          date: string
          indicator: string
          is_stale?: boolean
          last_updated?: string
          source?: string
          value: number
        }
        Update: {
          date?: string
          indicator?: string
          is_stale?: boolean
          last_updated?: string
          source?: string
          value?: number
        }
        Relationships: []
      }
      entry_expenses: {
        Row: {
          amount_clp: number | null
          amount_uf: number
          contract_id: string
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          display_order: number | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          amount_clp?: number | null
          amount_uf?: number
          contract_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          display_order?: number | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          amount_clp?: number | null
          amount_uf?: number
          contract_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          display_order?: number | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_expenses_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      file_destination_settings: {
        Row: {
          created_at: string
          folder_name: string
          id: string
          setting_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          folder_name: string
          id?: string
          setting_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          folder_name?: string
          id?: string
          setting_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      finalized_contracts: {
        Row: {
          contract_id: string
          final_conditions: Json
          finalized_at: string
          id: string
        }
        Insert: {
          contract_id: string
          final_conditions: Json
          finalized_at?: string
          id?: string
        }
        Update: {
          contract_id?: string
          final_conditions?: Json
          finalized_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finalized_contracts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      folder_statuses: {
        Row: {
          color: string | null
          created_at: string
          folder_id: string
          id: string
          name: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          folder_id: string
          id?: string
          name: string
        }
        Update: {
          color?: string | null
          created_at?: string
          folder_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "folder_statuses_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "repository_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      folder_templates: {
        Row: {
          created_at: string
          display_order: number | null
          folder_type: string | null
          id: string
          name: string
          parent_id: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          folder_type?: string | null
          id?: string
          name: string
          parent_id?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number | null
          folder_type?: string | null
          id?: string
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "folder_templates_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "folder_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      gantt_task_dependencies: {
        Row: {
          created_at: string
          dep_type: string
          depends_on_task_id: string
          id: string
          lag_days: number
          lag_type: string
          task_id: string
        }
        Insert: {
          created_at?: string
          dep_type?: string
          depends_on_task_id: string
          id?: string
          lag_days?: number
          lag_type?: string
          task_id: string
        }
        Update: {
          created_at?: string
          dep_type?: string
          depends_on_task_id?: string
          id?: string
          lag_days?: number
          lag_type?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gantt_task_dependencies_depends_on_task_id_fkey"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "gantt_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gantt_task_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "gantt_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      gantt_task_purchase_orders: {
        Row: {
          created_at: string
          id: string
          purchase_order_id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          purchase_order_id: string
          task_id: string
        }
        Update: {
          created_at?: string
          id?: string
          purchase_order_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gantt_task_purchase_orders_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gantt_task_purchase_orders_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "gantt_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      gantt_tasks: {
        Row: {
          budget_line_id: string | null
          color: string | null
          created_at: string
          dependency_join_mode: string
          discarded_at: string | null
          discarded_snapshot: Json | null
          display_order: number | null
          duration_days: number | null
          duration_type: string
          end_date: string | null
          has_lag: boolean | null
          id: string
          lag_days: number | null
          lag_type: string
          name: string
          notes: string | null
          origin: string | null
          parent_id: string | null
          progress: number | null
          responsible_member_id: string | null
          start_date: string | null
          status: string
          template_task_id: string | null
          timeline_id: string
          updated_at: string
        }
        Insert: {
          budget_line_id?: string | null
          color?: string | null
          created_at?: string
          dependency_join_mode?: string
          discarded_at?: string | null
          discarded_snapshot?: Json | null
          display_order?: number | null
          duration_days?: number | null
          duration_type?: string
          end_date?: string | null
          has_lag?: boolean | null
          id?: string
          lag_days?: number | null
          lag_type?: string
          name: string
          notes?: string | null
          origin?: string | null
          parent_id?: string | null
          progress?: number | null
          responsible_member_id?: string | null
          start_date?: string | null
          status?: string
          template_task_id?: string | null
          timeline_id: string
          updated_at?: string
        }
        Update: {
          budget_line_id?: string | null
          color?: string | null
          created_at?: string
          dependency_join_mode?: string
          discarded_at?: string | null
          discarded_snapshot?: Json | null
          display_order?: number | null
          duration_days?: number | null
          duration_type?: string
          end_date?: string | null
          has_lag?: boolean | null
          id?: string
          lag_days?: number | null
          lag_type?: string
          name?: string
          notes?: string | null
          origin?: string | null
          parent_id?: string | null
          progress?: number | null
          responsible_member_id?: string | null
          start_date?: string | null
          status?: string
          template_task_id?: string | null
          timeline_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gantt_tasks_budget_line_id_fkey"
            columns: ["budget_line_id"]
            isOneToOne: false
            referencedRelation: "budget_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gantt_tasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "gantt_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gantt_tasks_responsible_member_id_fkey"
            columns: ["responsible_member_id"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gantt_tasks_template_task_id_fkey"
            columns: ["template_task_id"]
            isOneToOne: false
            referencedRelation: "gantt_template_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gantt_tasks_timeline_id_fkey"
            columns: ["timeline_id"]
            isOneToOne: false
            referencedRelation: "gantt_timelines"
            referencedColumns: ["id"]
          },
        ]
      }
      gantt_template_dependencies: {
        Row: {
          created_at: string
          dep_type: string
          depends_on_task_id: string
          id: string
          lag_days: number | null
          lag_type: string
          task_id: string
        }
        Insert: {
          created_at?: string
          dep_type?: string
          depends_on_task_id: string
          id?: string
          lag_days?: number | null
          lag_type?: string
          task_id: string
        }
        Update: {
          created_at?: string
          dep_type?: string
          depends_on_task_id?: string
          id?: string
          lag_days?: number | null
          lag_type?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gantt_template_dependencies_depends_on_task_id_fkey"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "gantt_template_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gantt_template_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "gantt_template_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      gantt_template_tasks: {
        Row: {
          color: string | null
          created_at: string
          default_duration_days: number | null
          default_origin: string | null
          default_responsible_member_id: string | null
          display_order: number | null
          duration_type: string
          id: string
          name: string
          parent_id: string | null
          template_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          default_duration_days?: number | null
          default_origin?: string | null
          default_responsible_member_id?: string | null
          display_order?: number | null
          duration_type?: string
          id?: string
          name: string
          parent_id?: string | null
          template_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          default_duration_days?: number | null
          default_origin?: string | null
          default_responsible_member_id?: string | null
          display_order?: number | null
          duration_type?: string
          id?: string
          name?: string
          parent_id?: string | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gantt_template_tasks_default_responsible_member_id_fkey"
            columns: ["default_responsible_member_id"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gantt_template_tasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "gantt_template_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gantt_template_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "gantt_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      gantt_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      gantt_timelines: {
        Row: {
          category: string
          contract_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_priority: boolean
          name: string
          service_contract_id: string | null
          source: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_priority?: boolean
          name?: string
          service_contract_id?: string | null
          source?: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_priority?: boolean
          name?: string
          service_contract_id?: string | null
          source?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gantt_timelines_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gantt_timelines_service_contract_id_fkey"
            columns: ["service_contract_id"]
            isOneToOne: false
            referencedRelation: "service_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gantt_timelines_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "gantt_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      general_folder_files: {
        Row: {
          drive_file_id: string | null
          file_type: string | null
          folder_id: string
          id: string
          name: string
          uploaded_at: string | null
          uploaded_by: string | null
          url: string
        }
        Insert: {
          drive_file_id?: string | null
          file_type?: string | null
          folder_id: string
          id?: string
          name: string
          uploaded_at?: string | null
          uploaded_by?: string | null
          url: string
        }
        Update: {
          drive_file_id?: string | null
          file_type?: string | null
          folder_id?: string
          id?: string
          name?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "general_folder_files_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "general_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      general_folders: {
        Row: {
          contract_id: string | null
          created_at: string | null
          created_by: string | null
          display_order: number | null
          drive_folder_id: string | null
          id: string
          is_contract_root: boolean | null
          name: string
          parent_id: string | null
          updated_at: string | null
        }
        Insert: {
          contract_id?: string | null
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          drive_folder_id?: string | null
          id?: string
          is_contract_root?: boolean | null
          name: string
          parent_id?: string | null
          updated_at?: string | null
        }
        Update: {
          contract_id?: string | null
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          drive_folder_id?: string | null
          id?: string
          is_contract_root?: boolean | null
          name?: string
          parent_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "general_folders_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "general_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "general_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      geoloc_drive_sync: {
        Row: {
          folders_file_drive_id: string | null
          last_error: string | null
          last_synced_at: string | null
          pois_file_drive_id: string | null
          root_folder_drive_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          folders_file_drive_id?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          pois_file_drive_id?: string | null
          root_folder_drive_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          folders_file_drive_id?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          pois_file_drive_id?: string | null
          root_folder_drive_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      geoloc_sync_log: {
        Row: {
          conflicts: Json
          executed_at: string
          files_skipped_protected: number
          files_updated: number
          id: string
          request_id: string | null
          summary: string | null
        }
        Insert: {
          conflicts?: Json
          executed_at?: string
          files_skipped_protected?: number
          files_updated?: number
          id?: string
          request_id?: string | null
          summary?: string | null
        }
        Update: {
          conflicts?: Json
          executed_at?: string
          files_skipped_protected?: number
          files_updated?: number
          id?: string
          request_id?: string | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "geoloc_sync_log_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "geoloc_sync_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      geoloc_sync_requests: {
        Row: {
          id: string
          notes: string | null
          requested_at: string
          requested_by: string | null
          status: string
        }
        Insert: {
          id?: string
          notes?: string | null
          requested_at?: string
          requested_by?: string | null
          status?: string
        }
        Update: {
          id?: string
          notes?: string | null
          requested_at?: string
          requested_by?: string | null
          status?: string
        }
        Relationships: []
      }
      geoloc_sync_state: {
        Row: {
          folders_synced_total: number
          last_cursor_folders: string | null
          last_cursor_pois: string | null
          last_error: string | null
          last_run_at: string | null
          pois_synced_total: number
          source_project: string
          status: string | null
          updated_at: string
        }
        Insert: {
          folders_synced_total?: number
          last_cursor_folders?: string | null
          last_cursor_pois?: string | null
          last_error?: string | null
          last_run_at?: string | null
          pois_synced_total?: number
          source_project: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          folders_synced_total?: number
          last_cursor_folders?: string | null
          last_cursor_pois?: string | null
          last_error?: string | null
          last_run_at?: string | null
          pois_synced_total?: number
          source_project?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      geoloc_user_map: {
        Row: {
          created_at: string
          email: string | null
          gplanet_user_id: string
          source_project: string
          source_user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          gplanet_user_id: string
          source_project: string
          source_user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          gplanet_user_id?: string
          source_project?: string
          source_user_id?: string
        }
        Relationships: []
      }
      holidays: {
        Row: {
          country: string
          created_at: string
          date: string
          id: string
          is_recurring: boolean
          name: string
        }
        Insert: {
          country?: string
          created_at?: string
          date: string
          id?: string
          is_recurring?: boolean
          name: string
        }
        Update: {
          country?: string
          created_at?: string
          date?: string
          id?: string
          is_recurring?: boolean
          name?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount_clp: number | null
          amount_uf: number
          attachment_url: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          drive_file_id: string | null
          email_sent_at: string | null
          email_sent_to: string | null
          id: string
          input_currency: string | null
          invoice_date: string
          invoice_number: string
          purchase_order_id: string
          received_at: string | null
          received_by: string | null
          reception_status: string
          storage_provider: string | null
          uf_value_at_entry: number | null
          updated_at: string
        }
        Insert: {
          amount_clp?: number | null
          amount_uf?: number
          attachment_url?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          drive_file_id?: string | null
          email_sent_at?: string | null
          email_sent_to?: string | null
          id?: string
          input_currency?: string | null
          invoice_date?: string
          invoice_number: string
          purchase_order_id: string
          received_at?: string | null
          received_by?: string | null
          reception_status?: string
          storage_provider?: string | null
          uf_value_at_entry?: number | null
          updated_at?: string
        }
        Update: {
          amount_clp?: number | null
          amount_uf?: number
          attachment_url?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          drive_file_id?: string | null
          email_sent_at?: string | null
          email_sent_to?: string | null
          id?: string
          input_currency?: string | null
          invoice_date?: string
          invoice_number?: string
          purchase_order_id?: string
          received_at?: string | null
          received_by?: string | null
          reception_status?: string
          storage_provider?: string | null
          uf_value_at_entry?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_audit_log: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          entity_id: string
          entity_type: string
          id: string
          new_values: Json | null
          old_values: Json | null
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          entity_id: string
          entity_type: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
        }
        Relationships: []
      }
      kpi_categories: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      kpi_empresa_entries: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          entry_date: string
          id: string
          kpi_id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date?: string
          id?: string
          kpi_id: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date?: string
          id?: string
          kpi_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_empresa_entries_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_formula_versions: {
        Row: {
          created_at: string
          created_by: string | null
          formula: string
          formula_variables: Json | null
          id: string
          kpi_id: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          formula: string
          formula_variables?: Json | null
          id?: string
          kpi_id: string
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          formula?: string
          formula_variables?: Json | null
          id?: string
          kpi_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "kpi_formula_versions_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_frequencies: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          months_interval: number
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          months_interval?: number
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          months_interval?: number
          name?: string
        }
        Relationships: []
      }
      kpi_goal_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      kpi_measurements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kpi_id: string
          notes: string | null
          period_end: string
          period_start: string
          value: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kpi_id: string
          notes?: string | null
          period_end: string
          period_start: string
          value: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kpi_id?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "kpi_measurements_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      kpis: {
        Row: {
          assigned_user_id: string | null
          category_id: string
          created_at: string
          created_by: string | null
          data_source: string | null
          description: string | null
          display_order: number | null
          formula: string | null
          formula_variables: Json | null
          frequency_id: string | null
          goal_100: number | null
          goal_type_id: string | null
          goal_value: number | null
          id: string
          is_active: boolean | null
          kpi_classification: string | null
          name: string
          parent_kpi_id: string | null
          responsible_user_id: string | null
          threshold_green: number | null
          threshold_red: number | null
          threshold_yellow: number | null
          unit: string | null
          updated_at: string
          validity_end: string | null
          validity_start: string | null
        }
        Insert: {
          assigned_user_id?: string | null
          category_id: string
          created_at?: string
          created_by?: string | null
          data_source?: string | null
          description?: string | null
          display_order?: number | null
          formula?: string | null
          formula_variables?: Json | null
          frequency_id?: string | null
          goal_100?: number | null
          goal_type_id?: string | null
          goal_value?: number | null
          id?: string
          is_active?: boolean | null
          kpi_classification?: string | null
          name: string
          parent_kpi_id?: string | null
          responsible_user_id?: string | null
          threshold_green?: number | null
          threshold_red?: number | null
          threshold_yellow?: number | null
          unit?: string | null
          updated_at?: string
          validity_end?: string | null
          validity_start?: string | null
        }
        Update: {
          assigned_user_id?: string | null
          category_id?: string
          created_at?: string
          created_by?: string | null
          data_source?: string | null
          description?: string | null
          display_order?: number | null
          formula?: string | null
          formula_variables?: Json | null
          frequency_id?: string | null
          goal_100?: number | null
          goal_type_id?: string | null
          goal_value?: number | null
          id?: string
          is_active?: boolean | null
          kpi_classification?: string | null
          name?: string
          parent_kpi_id?: string | null
          responsible_user_id?: string | null
          threshold_green?: number | null
          threshold_red?: number | null
          threshold_yellow?: number | null
          unit?: string | null
          updated_at?: string
          validity_end?: string | null
          validity_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kpis_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "kpi_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpis_frequency_id_fkey"
            columns: ["frequency_id"]
            isOneToOne: false
            referencedRelation: "kpi_frequencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpis_goal_type_id_fkey"
            columns: ["goal_type_id"]
            isOneToOne: false
            referencedRelation: "kpi_goal_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpis_parent_kpi_id_fkey"
            columns: ["parent_kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_criticality_categories: {
        Row: {
          code: string
          color: string | null
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      maintenance_forms: {
        Row: {
          additional_comments: string | null
          civil_description: string | null
          contract_id: string | null
          contract_name: string | null
          created_at: string | null
          created_by: string | null
          created_date: string | null
          criticality_category_id: string | null
          deleted_at: string | null
          electrical_description: string | null
          evidence_links: string[] | null
          fixed_assets_description: string | null
          form_number: string
          gantt_task_id: string | null
          general_description: string | null
          hvac_description: string | null
          id: string
          ot_file_url: string | null
          purchase_order_id: string | null
          purchase_order_number: string | null
          resolution_date: string | null
          resolution_observations: string | null
          status: string
          status_changed_at: string | null
          sub_status: string
          sub_status_cotizando_at: string | null
          sub_status_en_ejecucion_at: string | null
          sub_status_evaluado_at: string | null
          sub_status_pre_aprobado_at: string | null
          sub_status_resuelto_at: string | null
          sub_status_revisado_at: string | null
          sub_status_solicitado_at: string | null
          supplier_id: string | null
          supplier_name: string | null
          updated_at: string | null
          year: number | null
        }
        Insert: {
          additional_comments?: string | null
          civil_description?: string | null
          contract_id?: string | null
          contract_name?: string | null
          created_at?: string | null
          created_by?: string | null
          created_date?: string | null
          criticality_category_id?: string | null
          deleted_at?: string | null
          electrical_description?: string | null
          evidence_links?: string[] | null
          fixed_assets_description?: string | null
          form_number: string
          gantt_task_id?: string | null
          general_description?: string | null
          hvac_description?: string | null
          id?: string
          ot_file_url?: string | null
          purchase_order_id?: string | null
          purchase_order_number?: string | null
          resolution_date?: string | null
          resolution_observations?: string | null
          status?: string
          status_changed_at?: string | null
          sub_status?: string
          sub_status_cotizando_at?: string | null
          sub_status_en_ejecucion_at?: string | null
          sub_status_evaluado_at?: string | null
          sub_status_pre_aprobado_at?: string | null
          sub_status_resuelto_at?: string | null
          sub_status_revisado_at?: string | null
          sub_status_solicitado_at?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          updated_at?: string | null
          year?: number | null
        }
        Update: {
          additional_comments?: string | null
          civil_description?: string | null
          contract_id?: string | null
          contract_name?: string | null
          created_at?: string | null
          created_by?: string | null
          created_date?: string | null
          criticality_category_id?: string | null
          deleted_at?: string | null
          electrical_description?: string | null
          evidence_links?: string[] | null
          fixed_assets_description?: string | null
          form_number?: string
          gantt_task_id?: string | null
          general_description?: string | null
          hvac_description?: string | null
          id?: string
          ot_file_url?: string | null
          purchase_order_id?: string | null
          purchase_order_number?: string | null
          resolution_date?: string | null
          resolution_observations?: string | null
          status?: string
          status_changed_at?: string | null
          sub_status?: string
          sub_status_cotizando_at?: string | null
          sub_status_en_ejecucion_at?: string | null
          sub_status_evaluado_at?: string | null
          sub_status_pre_aprobado_at?: string | null
          sub_status_resuelto_at?: string | null
          sub_status_revisado_at?: string | null
          sub_status_solicitado_at?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          updated_at?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_forms_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_forms_criticality_category_id_fkey"
            columns: ["criticality_category_id"]
            isOneToOne: false
            referencedRelation: "maintenance_criticality_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_forms_gantt_task_id_fkey"
            columns: ["gantt_task_id"]
            isOneToOne: false
            referencedRelation: "gantt_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_forms_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_forms_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_locations: {
        Row: {
          centro_sap: string | null
          contract_id: string | null
          created_at: string
          folder: string
          gerente_zonal: string | null
          id: string
          is_active: boolean
          lat: number
          lng: number
          local_code: string | null
          local_name: string | null
          name: string
          poi_id: string
          zona: string | null
        }
        Insert: {
          centro_sap?: string | null
          contract_id?: string | null
          created_at?: string
          folder: string
          gerente_zonal?: string | null
          id?: string
          is_active?: boolean
          lat: number
          lng: number
          local_code?: string | null
          local_name?: string | null
          name: string
          poi_id: string
          zona?: string | null
        }
        Update: {
          centro_sap?: string | null
          contract_id?: string | null
          created_at?: string
          folder?: string
          gerente_zonal?: string | null
          id?: string
          is_active?: boolean
          lat?: number
          lng?: number
          local_code?: string | null
          local_name?: string | null
          name?: string
          poi_id?: string
          zona?: string | null
        }
        Relationships: []
      }
      maintenance_route_forms: {
        Row: {
          completed: boolean
          completed_at: string | null
          completed_by: string | null
          created_at: string
          estimated_minutes: number | null
          id: string
          maintenance_form_id: string
          operator_notes: string | null
          postpone_note: string | null
          postponed_to: string | null
          real_minutes: number | null
          route_stop_id: string
          started_at: string | null
          visit_evidence_urls: string[] | null
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          estimated_minutes?: number | null
          id?: string
          maintenance_form_id: string
          operator_notes?: string | null
          postpone_note?: string | null
          postponed_to?: string | null
          real_minutes?: number | null
          route_stop_id: string
          started_at?: string | null
          visit_evidence_urls?: string[] | null
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          estimated_minutes?: number | null
          id?: string
          maintenance_form_id?: string
          operator_notes?: string | null
          postpone_note?: string | null
          postponed_to?: string | null
          real_minutes?: number | null
          route_stop_id?: string
          started_at?: string | null
          visit_evidence_urls?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_route_forms_maintenance_form_id_fkey"
            columns: ["maintenance_form_id"]
            isOneToOne: false
            referencedRelation: "maintenance_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_route_forms_route_stop_id_fkey"
            columns: ["route_stop_id"]
            isOneToOne: false
            referencedRelation: "maintenance_route_stops"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_route_stops: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          estimated_travel_min: number | null
          id: string
          location_id: string | null
          postpone_note: string | null
          postponed_to: string | null
          route_id: string
          status: string
          stop_kind: string | null
          stop_label: string | null
          stop_lat: number | null
          stop_lng: number | null
          stop_minutes: number | null
          stop_order: number
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          estimated_travel_min?: number | null
          id?: string
          location_id?: string | null
          postpone_note?: string | null
          postponed_to?: string | null
          route_id: string
          status?: string
          stop_kind?: string | null
          stop_label?: string | null
          stop_lat?: number | null
          stop_lng?: number | null
          stop_minutes?: number | null
          stop_order: number
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          estimated_travel_min?: number | null
          id?: string
          location_id?: string | null
          postpone_note?: string | null
          postponed_to?: string | null
          route_id?: string
          status?: string
          stop_kind?: string | null
          stop_label?: string | null
          stop_lat?: number | null
          stop_lng?: number | null
          stop_minutes?: number | null
          stop_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_route_stops_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "maintenance_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_route_stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "maintenance_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_routes: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          name: string
          notes: string | null
          scheduled_date: string | null
          status: string
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          notes?: string | null
          scheduled_date?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          scheduled_date?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_routes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          field_changed: string
          form_id: string
          id: string
          new_value: string
          old_value: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          field_changed: string
          form_id: string
          id?: string
          new_value: string
          old_value?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          field_changed?: string
          form_id?: string
          id?: string
          new_value?: string
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_status_history_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "maintenance_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_sub_statuses: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          display_order: number
          id: string
          is_active: boolean | null
          label: string
          name: string
          responsible: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          display_order: number
          id?: string
          is_active?: boolean | null
          label: string
          name: string
          responsible?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean | null
          label?: string
          name?: string
          responsible?: string | null
        }
        Relationships: []
      }
      notice_ranges: {
        Row: {
          created_at: string
          end_month: number
          id: string
          start_month: number
          version_id: string
        }
        Insert: {
          created_at?: string
          end_month: number
          id?: string
          start_month: number
          version_id: string
        }
        Update: {
          created_at?: string
          end_month?: number
          id?: string
          start_month?: number
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notice_ranges_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "contract_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      oc_budget_lines: {
        Row: {
          amount_uf: number
          budget_line_id: string
          created_at: string
          id: string
          oc_request_id: string | null
          purchase_order_id: string | null
        }
        Insert: {
          amount_uf?: number
          budget_line_id: string
          created_at?: string
          id?: string
          oc_request_id?: string | null
          purchase_order_id?: string | null
        }
        Update: {
          amount_uf?: number
          budget_line_id?: string
          created_at?: string
          id?: string
          oc_request_id?: string | null
          purchase_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oc_budget_lines_budget_line_id_fkey"
            columns: ["budget_line_id"]
            isOneToOne: false
            referencedRelation: "budget_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_budget_lines_oc_request_id_fkey"
            columns: ["oc_request_id"]
            isOneToOne: false
            referencedRelation: "oc_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_budget_lines_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      oc_import_batches: {
        Row: {
          drive_file_id: string | null
          drive_synced_at: string | null
          filename: string
          id: string
          imported_at: string | null
          imported_by: string | null
          rows_duplicate: number | null
          rows_ok: number | null
          rows_pending_local: number | null
          rows_pending_supplier: number | null
          rows_total: number | null
          storage_path: string | null
        }
        Insert: {
          drive_file_id?: string | null
          drive_synced_at?: string | null
          filename: string
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          rows_duplicate?: number | null
          rows_ok?: number | null
          rows_pending_local?: number | null
          rows_pending_supplier?: number | null
          rows_total?: number | null
          storage_path?: string | null
        }
        Update: {
          drive_file_id?: string | null
          drive_synced_at?: string | null
          filename?: string
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          rows_duplicate?: number | null
          rows_ok?: number | null
          rows_pending_local?: number | null
          rows_pending_supplier?: number | null
          rows_total?: number | null
          storage_path?: string | null
        }
        Relationships: []
      }
      oc_payment_plans: {
        Row: {
          amount_uf: number
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          oc_request_id: string | null
          paid_date: string | null
          payment_number: number
          purchase_order_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_uf?: number
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          oc_request_id?: string | null
          paid_date?: string | null
          payment_number?: number
          purchase_order_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_uf?: number
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          oc_request_id?: string | null
          paid_date?: string | null
          payment_number?: number
          purchase_order_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "oc_payment_plans_oc_request_id_fkey"
            columns: ["oc_request_id"]
            isOneToOne: false
            referencedRelation: "oc_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_payment_plans_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      oc_quotations: {
        Row: {
          amount_clp: number | null
          amount_uf: number | null
          budget_line_id: string
          contract_id: string
          correlative: number
          created_at: string
          created_by: string | null
          description: string | null
          file_name: string | null
          file_path: string | null
          id: string
          is_selected: boolean | null
          line_name: string
          project_name: string
          quotation_date: string
          quotation_number: string
          supplier_id: string | null
          supplier_name: string | null
          updated_at: string
        }
        Insert: {
          amount_clp?: number | null
          amount_uf?: number | null
          budget_line_id: string
          contract_id: string
          correlative?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          is_selected?: boolean | null
          line_name: string
          project_name: string
          quotation_date?: string
          quotation_number: string
          supplier_id?: string | null
          supplier_name?: string | null
          updated_at?: string
        }
        Update: {
          amount_clp?: number | null
          amount_uf?: number | null
          budget_line_id?: string
          contract_id?: string
          correlative?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          is_selected?: boolean | null
          line_name?: string
          project_name?: string
          quotation_date?: string
          quotation_number?: string
          supplier_id?: string | null
          supplier_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "oc_quotations_budget_line_id_fkey"
            columns: ["budget_line_id"]
            isOneToOne: false
            referencedRelation: "budget_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_quotations_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_quotations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_quotations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      oc_request_contract_allocations: {
        Row: {
          amount_clp: number | null
          amount_uf: number
          contract_id: string
          created_at: string
          id: string
          oc_request_id: string
        }
        Insert: {
          amount_clp?: number | null
          amount_uf?: number
          contract_id: string
          created_at?: string
          id?: string
          oc_request_id: string
        }
        Update: {
          amount_clp?: number | null
          amount_uf?: number
          contract_id?: string
          created_at?: string
          id?: string
          oc_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oc_request_contract_allocations_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_request_contract_allocations_oc_request_id_fkey"
            columns: ["oc_request_id"]
            isOneToOne: false
            referencedRelation: "oc_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      oc_request_forms: {
        Row: {
          amount_clp: number
          amount_uf: number
          created_at: string
          description: string | null
          id: string
          maintenance_form_id: string
          oc_request_id: string
        }
        Insert: {
          amount_clp?: number
          amount_uf?: number
          created_at?: string
          description?: string | null
          id?: string
          maintenance_form_id: string
          oc_request_id: string
        }
        Update: {
          amount_clp?: number
          amount_uf?: number
          created_at?: string
          description?: string | null
          id?: string
          maintenance_form_id?: string
          oc_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oc_request_forms_oc_request_id_fkey"
            columns: ["oc_request_id"]
            isOneToOne: false
            referencedRelation: "oc_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      oc_request_templates: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      oc_requests: {
        Row: {
          amount_clp: number | null
          amount_uf: number | null
          budget_id: string | null
          budget_line_id: string | null
          contract_id: string
          correlative_of_day: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          input_currency: string | null
          is_multi_contract: boolean | null
          line_name: string
          opex_master_id: string | null
          project_name: string
          purchase_order_id: string | null
          quotation_file_name: string | null
          quotation_url: string | null
          request_date: string
          request_number: string
          status: string
          supplier_id: string | null
          supplier_name: string | null
          uf_value_at_entry: number | null
          updated_at: string
          year: number
        }
        Insert: {
          amount_clp?: number | null
          amount_uf?: number | null
          budget_id?: string | null
          budget_line_id?: string | null
          contract_id: string
          correlative_of_day?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          input_currency?: string | null
          is_multi_contract?: boolean | null
          line_name: string
          opex_master_id?: string | null
          project_name: string
          purchase_order_id?: string | null
          quotation_file_name?: string | null
          quotation_url?: string | null
          request_date?: string
          request_number: string
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          uf_value_at_entry?: number | null
          updated_at?: string
          year: number
        }
        Update: {
          amount_clp?: number | null
          amount_uf?: number | null
          budget_id?: string | null
          budget_line_id?: string | null
          contract_id?: string
          correlative_of_day?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          input_currency?: string | null
          is_multi_contract?: boolean | null
          line_name?: string
          opex_master_id?: string | null
          project_name?: string
          purchase_order_id?: string | null
          quotation_file_name?: string | null
          quotation_url?: string | null
          request_date?: string
          request_number?: string
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          uf_value_at_entry?: number | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "oc_requests_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "contract_budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_requests_budget_line_id_fkey"
            columns: ["budget_line_id"]
            isOneToOne: false
            referencedRelation: "budget_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_requests_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_requests_opex_master_id_fkey"
            columns: ["opex_master_id"]
            isOneToOne: false
            referencedRelation: "opex_master_budget"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_requests_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_requests_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_suppliers: {
        Row: {
          created_at: string
          id: string
          supplier_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          supplier_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          supplier_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      opex_categories: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          supplier_category_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          supplier_category_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          supplier_category_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opex_categories_supplier_category_id_fkey"
            columns: ["supplier_category_id"]
            isOneToOne: false
            referencedRelation: "supplier_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      opex_local_additional: {
        Row: {
          amount_uf: number
          category_id: string
          contract_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          updated_at: string
          year: number
        }
        Insert: {
          amount_uf?: number
          category_id: string
          contract_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          amount_uf?: number
          category_id?: string
          contract_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "opex_local_additional_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "opex_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opex_local_additional_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      opex_master_budget: {
        Row: {
          amount_clp: number | null
          amount_uf: number
          category_id: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          id: string
          is_closed: boolean | null
          month_01_clp: number | null
          month_02_clp: number | null
          month_03_clp: number | null
          month_04_clp: number | null
          month_05_clp: number | null
          month_06_clp: number | null
          month_07_clp: number | null
          month_08_clp: number | null
          month_09_clp: number | null
          month_10_clp: number | null
          month_11_clp: number | null
          month_12_clp: number | null
          notes: string | null
          uf_value_at_entry: number | null
          updated_at: string
          year: number
        }
        Insert: {
          amount_clp?: number | null
          amount_uf?: number
          category_id: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_closed?: boolean | null
          month_01_clp?: number | null
          month_02_clp?: number | null
          month_03_clp?: number | null
          month_04_clp?: number | null
          month_05_clp?: number | null
          month_06_clp?: number | null
          month_07_clp?: number | null
          month_08_clp?: number | null
          month_09_clp?: number | null
          month_10_clp?: number | null
          month_11_clp?: number | null
          month_12_clp?: number | null
          notes?: string | null
          uf_value_at_entry?: number | null
          updated_at?: string
          year: number
        }
        Update: {
          amount_clp?: number | null
          amount_uf?: number
          category_id?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_closed?: boolean | null
          month_01_clp?: number | null
          month_02_clp?: number | null
          month_03_clp?: number | null
          month_04_clp?: number | null
          month_05_clp?: number | null
          month_06_clp?: number | null
          month_07_clp?: number | null
          month_08_clp?: number | null
          month_09_clp?: number | null
          month_10_clp?: number | null
          month_11_clp?: number | null
          month_12_clp?: number | null
          notes?: string | null
          uf_value_at_entry?: number | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "opex_master_budget_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "opex_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      org_member_companies: {
        Row: {
          company_id: string
          created_at: string
          id: string
          org_member_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          org_member_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          org_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_member_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_member_companies_org_member_id_fkey"
            columns: ["org_member_id"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id"]
          },
        ]
      }
      org_member_contracts: {
        Row: {
          contract_id: string
          created_at: string | null
          id: string
          org_member_id: string
        }
        Insert: {
          contract_id: string
          created_at?: string | null
          id?: string
          org_member_id: string
        }
        Update: {
          contract_id?: string
          created_at?: string | null
          id?: string
          org_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_member_contracts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_member_contracts_org_member_id_fkey"
            columns: ["org_member_id"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          company_id: string | null
          created_at: string | null
          display_order: number | null
          email: string | null
          id: string
          name: string
          parent_id: string | null
          phone: string | null
          position: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          display_order?: number | null
          email?: string | null
          id?: string
          name: string
          parent_id?: string | null
          phone?: string | null
          position?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          display_order?: number | null
          email?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          phone?: string | null
          position?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id"]
          },
        ]
      }
      patent_checklist_items: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          name: string
          section_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          section_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          section_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patent_checklist_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "patent_checklist_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      patent_checklist_sections: {
        Row: {
          code: string
          created_at: string
          display_order: number
          id: string
          name: string
          repository_folder_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          display_order?: number
          id?: string
          name: string
          repository_folder_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          repository_folder_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patent_checklist_sections_repository_folder_id_fkey"
            columns: ["repository_folder_id"]
            isOneToOne: false
            referencedRelation: "repository_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      patent_custom_columns: {
        Row: {
          column_type: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          column_type?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          column_type?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      patent_document_alerts: {
        Row: {
          alert_column: string
          alert_date: string
          created_at: string
          created_by: string | null
          frequency_days: number | null
          id: string
          is_active: boolean
          last_sent_at: string | null
          patent_document_id: string
          recipients: string[] | null
        }
        Insert: {
          alert_column: string
          alert_date: string
          created_at?: string
          created_by?: string | null
          frequency_days?: number | null
          id?: string
          is_active?: boolean
          last_sent_at?: string | null
          patent_document_id: string
          recipients?: string[] | null
        }
        Update: {
          alert_column?: string
          alert_date?: string
          created_at?: string
          created_by?: string | null
          frequency_days?: number | null
          id?: string
          is_active?: boolean
          last_sent_at?: string | null
          patent_document_id?: string
          recipients?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "patent_document_alerts_patent_document_id_fkey"
            columns: ["patent_document_id"]
            isOneToOne: false
            referencedRelation: "patent_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      patent_documents: {
        Row: {
          checklist_item_id: string
          contract_id: string
          created_at: string
          custom_data: Json | null
          deadline_days: number | null
          document_names: string | null
          document_url: string | null
          drive_file_id: string | null
          emitter_id: string | null
          end_date: string | null
          folder_id: string | null
          id: string
          notes: string | null
          responsible: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["patent_doc_status"]
          status_changed_at: string | null
          status_changed_by: string | null
          storage_provider: string | null
          updated_at: string
        }
        Insert: {
          checklist_item_id: string
          contract_id: string
          created_at?: string
          custom_data?: Json | null
          deadline_days?: number | null
          document_names?: string | null
          document_url?: string | null
          drive_file_id?: string | null
          emitter_id?: string | null
          end_date?: string | null
          folder_id?: string | null
          id?: string
          notes?: string | null
          responsible?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["patent_doc_status"]
          status_changed_at?: string | null
          status_changed_by?: string | null
          storage_provider?: string | null
          updated_at?: string
        }
        Update: {
          checklist_item_id?: string
          contract_id?: string
          created_at?: string
          custom_data?: Json | null
          deadline_days?: number | null
          document_names?: string | null
          document_url?: string | null
          drive_file_id?: string | null
          emitter_id?: string | null
          end_date?: string | null
          folder_id?: string | null
          id?: string
          notes?: string | null
          responsible?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["patent_doc_status"]
          status_changed_at?: string | null
          status_changed_by?: string | null
          storage_provider?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patent_documents_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "patent_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patent_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patent_documents_emitter_id_fkey"
            columns: ["emitter_id"]
            isOneToOne: false
            referencedRelation: "patent_emitters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patent_documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "repository_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      patent_emitters: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          name: string
          section_id: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          section_id?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          section_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patent_emitters_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "patent_checklist_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      patent_item_emitters: {
        Row: {
          checklist_item_id: string
          created_at: string
          emitter_id: string
          id: string
        }
        Insert: {
          checklist_item_id: string
          created_at?: string
          emitter_id: string
          id?: string
        }
        Update: {
          checklist_item_id?: string
          created_at?: string
          emitter_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patent_item_emitters_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "patent_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patent_item_emitters_emitter_id_fkey"
            columns: ["emitter_id"]
            isOneToOne: false
            referencedRelation: "patent_emitters"
            referencedColumns: ["id"]
          },
        ]
      }
      patent_kpi_config: {
        Row: {
          checklist_item_id: string | null
          created_at: string
          id: string
          kpi_id: string | null
          updated_at: string
        }
        Insert: {
          checklist_item_id?: string | null
          created_at?: string
          id?: string
          kpi_id?: string | null
          updated_at?: string
        }
        Update: {
          checklist_item_id?: string | null
          created_at?: string
          id?: string
          kpi_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patent_kpi_config_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "patent_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patent_kpi_config_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      patent_shared_items: {
        Row: {
          checklist_item_id: string
          created_at: string
          id: string
          shared_folder_id: string
        }
        Insert: {
          checklist_item_id: string
          created_at?: string
          id?: string
          shared_folder_id: string
        }
        Update: {
          checklist_item_id?: string
          created_at?: string
          id?: string
          shared_folder_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patent_shared_items_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: true
            referencedRelation: "patent_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patent_shared_items_shared_folder_id_fkey"
            columns: ["shared_folder_id"]
            isOneToOne: false
            referencedRelation: "repository_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      patent_statuses: {
        Row: {
          bg_color: string
          code: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          name: string
          text_color: string
        }
        Insert: {
          bg_color?: string
          code: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          text_color?: string
        }
        Update: {
          bg_color?: string
          code?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          text_color?: string
        }
        Relationships: []
      }
      poi_folders: {
        Row: {
          color: string | null
          created_at: string
          deleted_at: string | null
          id: string
          is_mirror: boolean
          name: string
          parent_id: string | null
          source_id: string | null
          source_project: string | null
          source_user_id: string | null
          synced_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_mirror?: boolean
          name: string
          parent_id?: string | null
          source_id?: string | null
          source_project?: string | null
          source_user_id?: string | null
          synced_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_mirror?: boolean
          name?: string
          parent_id?: string | null
          source_id?: string | null
          source_project?: string | null
          source_user_id?: string | null
          synced_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poi_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "poi_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      pois: {
        Row: {
          category: string | null
          color: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          folder_id: string | null
          icon: string | null
          id: string
          is_mirror: boolean
          lat: number
          lng: number
          name: string
          properties: Json
          source_id: string | null
          source_layer: string | null
          source_project: string | null
          source_user_id: string | null
          synced_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          folder_id?: string | null
          icon?: string | null
          id?: string
          is_mirror?: boolean
          lat: number
          lng: number
          name: string
          properties?: Json
          source_id?: string | null
          source_layer?: string | null
          source_project?: string | null
          source_user_id?: string | null
          synced_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          folder_id?: string | null
          icon?: string | null
          id?: string
          is_mirror?: boolean
          lat?: number
          lng?: number
          name?: string
          properties?: Json
          source_id?: string | null
          source_layer?: string | null
          source_project?: string | null
          source_user_id?: string | null
          synced_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pois_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "poi_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          activity_status: string
          cargo: string | null
          created_at: string
          current_section: string | null
          email: string
          full_name: string | null
          id: string
          last_seen_at: string | null
          updated_at: string
        }
        Insert: {
          activity_status?: string
          cargo?: string | null
          created_at?: string
          current_section?: string | null
          email: string
          full_name?: string | null
          id: string
          last_seen_at?: string | null
          updated_at?: string
        }
        Update: {
          activity_status?: string
          cargo?: string | null
          created_at?: string
          current_section?: string | null
          email?: string
          full_name?: string | null
          id?: string
          last_seen_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      purchase_items: {
        Row: {
          amount_uf: number
          attachment_url: string | null
          budget_id: string | null
          contract_id: string
          created_at: string
          delivery_date: string | null
          description: string | null
          drive_file_id: string | null
          id: string
          item_name: string
          purchase_order_id: string | null
          quantity: number | null
          request_date: string | null
          supplier_id: string | null
          supplier_name: string | null
          updated_at: string
          year: number
        }
        Insert: {
          amount_uf?: number
          attachment_url?: string | null
          budget_id?: string | null
          contract_id: string
          created_at?: string
          delivery_date?: string | null
          description?: string | null
          drive_file_id?: string | null
          id?: string
          item_name: string
          purchase_order_id?: string | null
          quantity?: number | null
          request_date?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          amount_uf?: number
          attachment_url?: string | null
          budget_id?: string | null
          contract_id?: string
          created_at?: string
          delivery_date?: string | null
          description?: string | null
          drive_file_id?: string | null
          id?: string
          item_name?: string
          purchase_order_id?: string | null
          quantity?: number | null
          request_date?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "contract_budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_budget_lines: {
        Row: {
          amount_uf: number
          budget_line_id: string
          created_at: string
          id: string
          purchase_order_id: string
        }
        Insert: {
          amount_uf?: number
          budget_line_id: string
          created_at?: string
          id?: string
          purchase_order_id: string
        }
        Update: {
          amount_uf?: number
          budget_line_id?: string
          created_at?: string
          id?: string
          purchase_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_budget_lines_budget_line_id_fkey"
            columns: ["budget_line_id"]
            isOneToOne: false
            referencedRelation: "budget_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_budget_lines_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_contract_allocations: {
        Row: {
          amount_clp: number | null
          amount_uf: number
          contract_id: string
          created_at: string
          id: string
          purchase_order_id: string
        }
        Insert: {
          amount_clp?: number | null
          amount_uf?: number
          contract_id: string
          created_at?: string
          id?: string
          purchase_order_id: string
        }
        Update: {
          amount_clp?: number | null
          amount_uf?: number
          contract_id?: string
          created_at?: string
          id?: string
          purchase_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_contract_allocations_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_contract_allocations_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          amount_clp: number | null
          amount_uf: number
          attachment_url: string | null
          budget_classification:
            | Database["public"]["Enums"]["budget_classification"]
            | null
          budget_id: string | null
          budget_line_id: string | null
          contract_id: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          drive_file_id: string | null
          id: string
          import_batch_id: string | null
          import_pending_local: boolean | null
          import_pending_supplier: boolean | null
          input_currency: string | null
          is_multi_contract: boolean | null
          maintenance_form_ids: string[] | null
          opex_category_id: string | null
          opex_master_id: string | null
          order_date: string
          order_number: string
          service_contract_id: string | null
          status: string
          storage_provider: string | null
          supplier_id: string | null
          supplier_name: string | null
          uf_value_at_entry: number | null
          updated_at: string
          year: number
        }
        Insert: {
          amount_clp?: number | null
          amount_uf?: number
          attachment_url?: string | null
          budget_classification?:
            | Database["public"]["Enums"]["budget_classification"]
            | null
          budget_id?: string | null
          budget_line_id?: string | null
          contract_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          drive_file_id?: string | null
          id?: string
          import_batch_id?: string | null
          import_pending_local?: boolean | null
          import_pending_supplier?: boolean | null
          input_currency?: string | null
          is_multi_contract?: boolean | null
          maintenance_form_ids?: string[] | null
          opex_category_id?: string | null
          opex_master_id?: string | null
          order_date?: string
          order_number: string
          service_contract_id?: string | null
          status?: string
          storage_provider?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          uf_value_at_entry?: number | null
          updated_at?: string
          year: number
        }
        Update: {
          amount_clp?: number | null
          amount_uf?: number
          attachment_url?: string | null
          budget_classification?:
            | Database["public"]["Enums"]["budget_classification"]
            | null
          budget_id?: string | null
          budget_line_id?: string | null
          contract_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          drive_file_id?: string | null
          id?: string
          import_batch_id?: string | null
          import_pending_local?: boolean | null
          import_pending_supplier?: boolean | null
          input_currency?: string | null
          is_multi_contract?: boolean | null
          maintenance_form_ids?: string[] | null
          opex_category_id?: string | null
          opex_master_id?: string | null
          order_date?: string
          order_number?: string
          service_contract_id?: string | null
          status?: string
          storage_provider?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          uf_value_at_entry?: number | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "contract_budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_budget_line_id_fkey"
            columns: ["budget_line_id"]
            isOneToOne: false
            referencedRelation: "budget_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_opex_category_id_fkey"
            columns: ["opex_category_id"]
            isOneToOne: false
            referencedRelation: "opex_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_opex_master_id_fkey"
            columns: ["opex_master_id"]
            isOneToOne: false
            referencedRelation: "opex_master_budget"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_service_contract_id_fkey"
            columns: ["service_contract_id"]
            isOneToOne: false
            referencedRelation: "service_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      renegotiation_draft_escalations: {
        Row: {
          amount: number
          created_at: string
          draft_id: string
          id: string
          month_number: number
        }
        Insert: {
          amount: number
          created_at?: string
          draft_id: string
          id?: string
          month_number: number
        }
        Update: {
          amount?: number
          created_at?: string
          draft_id?: string
          id?: string
          month_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "renegotiation_draft_escalations_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "renegotiation_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      renegotiation_draft_notice_ranges: {
        Row: {
          created_at: string
          draft_id: string
          end_month: number
          id: string
          start_month: number
        }
        Insert: {
          created_at?: string
          draft_id: string
          end_month: number
          id?: string
          start_month: number
        }
        Update: {
          created_at?: string
          draft_id?: string
          end_month?: number
          id?: string
          start_month?: number
        }
        Relationships: [
          {
            foreignKeyName: "renegotiation_draft_notice_ranges_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "renegotiation_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      renegotiation_drafts: {
        Row: {
          adicional_administracion_percentage: number | null
          adjustment_periodicity_months: number | null
          adjustment_type: string | null
          adjustment_value: number | null
          auto_renewal: boolean | null
          auto_renewal_months: number | null
          auto_renewal_type: string | null
          contract_id: string
          created_at: string
          created_by: string | null
          duration_months: number
          effective_date: string | null
          effective_from_signature: boolean | null
          first_adjustment_month: number | null
          fondo_promocion_percentage: number | null
          gastos_comunes_fixed_admin_uf: number | null
          gastos_comunes_methodology: string | null
          gastos_comunes_percentage: number | null
          gastos_comunes_prorrata_kwh_clima: number | null
          gastos_comunes_tope: number | null
          gastos_comunes_tope_type: string | null
          gastos_comunes_total_centro: number | null
          gastos_comunes_uf_m2: number | null
          gastos_comunes_uf_ml_frente: number | null
          grace_months: number | null
          guarantee_multiplier: number | null
          has_extended_gastos_comunes: boolean | null
          has_periodic_adjustments: boolean | null
          id: string
          initial_rent: number | null
          name: string
          notice_bilaterality: string | null
          notice_type: string
          notice_value: string
          otros_egresos_amount: number | null
          otros_egresos_description: string | null
          regime_rent: number
          source_draft_id: string | null
          source_type: string | null
          status: string | null
          updated_at: string
          variable_rent_percentage: number | null
        }
        Insert: {
          adicional_administracion_percentage?: number | null
          adjustment_periodicity_months?: number | null
          adjustment_type?: string | null
          adjustment_value?: number | null
          auto_renewal?: boolean | null
          auto_renewal_months?: number | null
          auto_renewal_type?: string | null
          contract_id: string
          created_at?: string
          created_by?: string | null
          duration_months: number
          effective_date?: string | null
          effective_from_signature?: boolean | null
          first_adjustment_month?: number | null
          fondo_promocion_percentage?: number | null
          gastos_comunes_fixed_admin_uf?: number | null
          gastos_comunes_methodology?: string | null
          gastos_comunes_percentage?: number | null
          gastos_comunes_prorrata_kwh_clima?: number | null
          gastos_comunes_tope?: number | null
          gastos_comunes_tope_type?: string | null
          gastos_comunes_total_centro?: number | null
          gastos_comunes_uf_m2?: number | null
          gastos_comunes_uf_ml_frente?: number | null
          grace_months?: number | null
          guarantee_multiplier?: number | null
          has_extended_gastos_comunes?: boolean | null
          has_periodic_adjustments?: boolean | null
          id?: string
          initial_rent?: number | null
          name: string
          notice_bilaterality?: string | null
          notice_type?: string
          notice_value: string
          otros_egresos_amount?: number | null
          otros_egresos_description?: string | null
          regime_rent: number
          source_draft_id?: string | null
          source_type?: string | null
          status?: string | null
          updated_at?: string
          variable_rent_percentage?: number | null
        }
        Update: {
          adicional_administracion_percentage?: number | null
          adjustment_periodicity_months?: number | null
          adjustment_type?: string | null
          adjustment_value?: number | null
          auto_renewal?: boolean | null
          auto_renewal_months?: number | null
          auto_renewal_type?: string | null
          contract_id?: string
          created_at?: string
          created_by?: string | null
          duration_months?: number
          effective_date?: string | null
          effective_from_signature?: boolean | null
          first_adjustment_month?: number | null
          fondo_promocion_percentage?: number | null
          gastos_comunes_fixed_admin_uf?: number | null
          gastos_comunes_methodology?: string | null
          gastos_comunes_percentage?: number | null
          gastos_comunes_prorrata_kwh_clima?: number | null
          gastos_comunes_tope?: number | null
          gastos_comunes_tope_type?: string | null
          gastos_comunes_total_centro?: number | null
          gastos_comunes_uf_m2?: number | null
          gastos_comunes_uf_ml_frente?: number | null
          grace_months?: number | null
          guarantee_multiplier?: number | null
          has_extended_gastos_comunes?: boolean | null
          has_periodic_adjustments?: boolean | null
          id?: string
          initial_rent?: number | null
          name?: string
          notice_bilaterality?: string | null
          notice_type?: string
          notice_value?: string
          otros_egresos_amount?: number | null
          otros_egresos_description?: string | null
          regime_rent?: number
          source_draft_id?: string | null
          source_type?: string | null
          status?: string | null
          updated_at?: string
          variable_rent_percentage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "renegotiation_drafts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renegotiation_drafts_source_draft_id_fkey"
            columns: ["source_draft_id"]
            isOneToOne: false
            referencedRelation: "renegotiation_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      rent_escalations: {
        Row: {
          amount: number
          created_at: string
          id: string
          is_uf_m2: boolean
          month_number: number
          version_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          is_uf_m2?: boolean
          month_number: number
          version_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          is_uf_m2?: boolean
          month_number?: number
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rent_escalations_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "contract_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      repository_files: {
        Row: {
          drive_file_id: string | null
          file_type: string | null
          folder_id: string
          id: string
          name: string
          status: string | null
          storage_provider: string | null
          sync_status: string | null
          synced_at: string | null
          uploaded_at: string
          url: string
        }
        Insert: {
          drive_file_id?: string | null
          file_type?: string | null
          folder_id: string
          id?: string
          name: string
          status?: string | null
          storage_provider?: string | null
          sync_status?: string | null
          synced_at?: string | null
          uploaded_at?: string
          url: string
        }
        Update: {
          drive_file_id?: string | null
          file_type?: string | null
          folder_id?: string
          id?: string
          name?: string
          status?: string | null
          storage_provider?: string | null
          sync_status?: string | null
          synced_at?: string | null
          uploaded_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "repository_files_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "repository_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      repository_folders: {
        Row: {
          contract_id: string | null
          created_at: string
          drive_folder_id: string | null
          folder_type: string | null
          id: string
          is_base_folder: boolean
          name: string
          parent_id: string | null
        }
        Insert: {
          contract_id?: string | null
          created_at?: string
          drive_folder_id?: string | null
          folder_type?: string | null
          id?: string
          is_base_folder?: boolean
          name: string
          parent_id?: string | null
        }
        Update: {
          contract_id?: string | null
          created_at?: string
          drive_folder_id?: string | null
          folder_type?: string | null
          id?: string
          is_base_folder?: boolean
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repository_folders_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repository_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "repository_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      route_compliance_log: {
        Row: {
          event_type: string
          form_id: string | null
          id: string
          notes: string | null
          performed_at: string
          performed_by: string | null
          postponed_to: string | null
          route_id: string
          stop_id: string | null
        }
        Insert: {
          event_type: string
          form_id?: string | null
          id?: string
          notes?: string | null
          performed_at?: string
          performed_by?: string | null
          postponed_to?: string | null
          route_id: string
          stop_id?: string | null
        }
        Update: {
          event_type?: string
          form_id?: string | null
          id?: string
          notes?: string | null
          performed_at?: string
          performed_by?: string | null
          postponed_to?: string | null
          route_id?: string
          stop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "route_compliance_log_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "maintenance_route_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_compliance_log_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "maintenance_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_compliance_log_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "maintenance_route_stops"
            referencedColumns: ["id"]
          },
        ]
      }
      special_attention_checklist: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          contract_id: string
          created_at: string
          id: string
          is_completed: boolean
          parent_id: string | null
          text: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          contract_id: string
          created_at?: string
          id?: string
          is_completed?: boolean
          parent_id?: string | null
          text: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          contract_id?: string
          created_at?: string
          id?: string
          is_completed?: boolean
          parent_id?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "special_attention_checklist_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_attention_checklist_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "special_attention_checklist"
            referencedColumns: ["id"]
          },
        ]
      }
      special_attention_meeting_participants: {
        Row: {
          created_at: string
          id: string
          meeting_id: string
          name: string
          role: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          meeting_id: string
          name: string
          role?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          meeting_id?: string
          name?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "special_attention_meeting_participants_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "special_attention_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      special_attention_meetings: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          meeting_date: string
          notes: string | null
          pdf_path: string | null
          pdf_url: string | null
          snapshot: Json | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          meeting_date?: string
          notes?: string | null
          pdf_path?: string | null
          pdf_url?: string | null
          snapshot?: Json | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          meeting_date?: string
          notes?: string | null
          pdf_path?: string | null
          pdf_url?: string | null
          snapshot?: Json | null
        }
        Relationships: []
      }
      special_attention_participants_directory: {
        Row: {
          created_at: string
          id: string
          is_recurring: boolean
          name: string
          role: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_recurring?: boolean
          name: string
          role?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_recurring?: boolean
          name?: string
          role?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      storage_settings: {
        Row: {
          active_provider: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          active_provider?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          active_provider?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      supplier_bank_details: {
        Row: {
          bank_account_number: string | null
          bank_account_type: string | null
          bank_name: string | null
          created_at: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          bank_account_number?: string | null
          bank_account_type?: string | null
          bank_name?: string | null
          created_at?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          bank_account_number?: string | null
          bank_account_type?: string | null
          bank_name?: string | null
          created_at?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_bank_details_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: true
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_categories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "supplier_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_category_assignments: {
        Row: {
          category_id: string
          created_at: string
          id: string
          supplier_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          supplier_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_category_assignments_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "supplier_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_category_assignments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          is_primary: boolean | null
          supplier_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_primary?: boolean | null
          supplier_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_primary?: boolean | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_emails_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_influence_zones: {
        Row: {
          commune: string | null
          created_at: string
          id: string
          region: string
          supplier_id: string
        }
        Insert: {
          commune?: string | null
          created_at?: string
          id?: string
          region: string
          supplier_id: string
        }
        Update: {
          commune?: string | null
          created_at?: string
          id?: string
          region?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_influence_zones_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_opex_categories: {
        Row: {
          created_at: string
          id: string
          opex_category_id: string
          supplier_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          opex_category_id: string
          supplier_id: string
        }
        Update: {
          created_at?: string
          id?: string
          opex_category_id?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_opex_categories_opex_category_id_fkey"
            columns: ["opex_category_id"]
            isOneToOne: false
            referencedRelation: "opex_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_opex_categories_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_products: {
        Row: {
          created_at: string
          id: string
          supplier_id: string
          template_line_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          supplier_id: string
          template_line_id: string
        }
        Update: {
          created_at?: string
          id?: string
          supplier_id?: string
          template_line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_template_line_id_fkey"
            columns: ["template_line_id"]
            isOneToOne: false
            referencedRelation: "budget_template_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      service_contract_approvers: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          org_member_id: string
          profile_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          org_member_id: string
          profile_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          org_member_id?: string
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_contract_approvers_org_member_id_fkey"
            columns: ["org_member_id"]
            isOneToOne: true
            referencedRelation: "org_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_contract_approvers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_contract_approval_events: {
        Row: {
          action: string
          actor_id: string | null
          comment: string | null
          created_at: string | null
          id: string
          service_contract_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          comment?: string | null
          created_at?: string | null
          id?: string
          service_contract_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          comment?: string | null
          created_at?: string | null
          id?: string
          service_contract_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_contract_approval_events_service_contract_id_fkey"
            columns: ["service_contract_id"]
            isOneToOne: false
            referencedRelation: "service_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_contract_approval_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_contract_contracts: {
        Row: {
          contract_id: string
          created_at: string
          id: string
          service_contract_id: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          id?: string
          service_contract_id: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          id?: string
          service_contract_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_contract_contracts_service_contract_id_fkey"
            columns: ["service_contract_id"]
            isOneToOne: false
            referencedRelation: "service_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_contract_contracts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      service_contracts: {
        Row: {
          amount_clp: number | null
          amount_uf: number
          approval_comment: string | null
          approval_requested_at: string | null
          approval_status: string
          approved_at: string | null
          approver_id: string | null
          approver_name: string | null
          approver_org_member_id: string | null
          auto_renewal: boolean
          created_at: string
          created_by: string | null
          display_currency: string
          drive_folder_id: string | null
          end_date: string | null
          frequency: Database["public"]["Enums"]["service_contract_frequency"]
          id: string
          name: string
          notes: string | null
          notice_days: number | null
          opex_category_id: string | null
          pricing_mode: string
          renewal_term_months: number | null
          service_type: string
          start_date: string
          status: Database["public"]["Enums"]["service_contract_status"]
          supplier_id: string
          updated_at: string
        }
        Insert: {
          amount_clp?: number | null
          amount_uf: number
          approval_comment?: string | null
          approval_requested_at?: string | null
          approval_status?: string
          approved_at?: string | null
          approver_id?: string | null
          approver_name?: string | null
          approver_org_member_id?: string | null
          auto_renewal?: boolean
          created_at?: string
          created_by?: string | null
          display_currency?: string
          drive_folder_id?: string | null
          end_date?: string | null
          frequency?: Database["public"]["Enums"]["service_contract_frequency"]
          id?: string
          name: string
          notes?: string | null
          notice_days?: number | null
          opex_category_id?: string | null
          pricing_mode?: string
          renewal_term_months?: number | null
          service_type: string
          start_date: string
          status?: Database["public"]["Enums"]["service_contract_status"]
          supplier_id: string
          updated_at?: string
        }
        Update: {
          amount_clp?: number | null
          amount_uf?: number
          approval_comment?: string | null
          approval_requested_at?: string | null
          approval_status?: string
          approved_at?: string | null
          approver_id?: string | null
          approver_name?: string | null
          approver_org_member_id?: string | null
          auto_renewal?: boolean
          created_at?: string
          created_by?: string | null
          display_currency?: string
          drive_folder_id?: string | null
          end_date?: string | null
          frequency?: Database["public"]["Enums"]["service_contract_frequency"]
          id?: string
          name?: string
          notes?: string | null
          notice_days?: number | null
          opex_category_id?: string | null
          pricing_mode?: string
          renewal_term_months?: number | null
          service_type?: string
          start_date?: string
          status?: Database["public"]["Enums"]["service_contract_status"]
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_contracts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_contracts_opex_category_id_fkey"
            columns: ["opex_category_id"]
            isOneToOne: false
            referencedRelation: "opex_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_contracts_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_contracts_approver_org_member_id_fkey"
            columns: ["approver_org_member_id"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          category_id: string | null
          commune: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_generic: boolean | null
          is_internal_transfer: boolean
          name: string
          phone: string | null
          rut: string | null
          street: string | null
          street_number: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          category_id?: string | null
          commune?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_generic?: boolean | null
          is_internal_transfer?: boolean
          name: string
          phone?: string | null
          rut?: string | null
          street?: string | null
          street_number?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          category_id?: string | null
          commune?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_generic?: boolean | null
          is_internal_transfer?: boolean
          name?: string
          phone?: string | null
          rut?: string | null
          street?: string | null
          street_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "supplier_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      termination_notices: {
        Row: {
          contract_id: string
          created_at: string
          created_by: string | null
          document_url: string | null
          drive_file_id: string | null
          id: string
          issuer_name: string | null
          notice_date: string
          notice_type: string
          required_exit_date: string | null
          storage_provider: string | null
        }
        Insert: {
          contract_id: string
          created_at?: string
          created_by?: string | null
          document_url?: string | null
          drive_file_id?: string | null
          id?: string
          issuer_name?: string | null
          notice_date: string
          notice_type: string
          required_exit_date?: string | null
          storage_provider?: string | null
        }
        Update: {
          contract_id?: string
          created_at?: string
          created_by?: string | null
          document_url?: string | null
          drive_file_id?: string | null
          id?: string
          issuer_name?: string | null
          notice_date?: string
          notice_type?: string
          required_exit_date?: string | null
          storage_provider?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "termination_notices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_thresholds: {
        Row: {
          idle_minutes: number
          inactive_minutes: number
          user_id: string
        }
        Insert: {
          idle_minutes?: number
          inactive_minutes?: number
          user_id: string
        }
        Update: {
          idle_minutes?: number
          inactive_minutes?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_thresholds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          created_at: string
          id: string
          permission: Database["public"]["Enums"]["permission_type"]
          resource: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission?: Database["public"]["Enums"]["permission_type"]
          resource: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission?: Database["public"]["Enums"]["permission_type"]
          resource?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string
          id: string
          preference_key: string
          preference_value: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          preference_key: string
          preference_value: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          preference_key?: string
          preference_value?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          id: string
          last_invoice_email: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_invoice_email?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_invoice_email?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      version_notices: {
        Row: {
          created_at: string
          description: string | null
          id: string
          notice_bilaterality: string | null
          notice_type: string
          notice_value: string
          version_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          notice_bilaterality?: string | null
          notice_type: string
          notice_value: string
          version_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          notice_bilaterality?: string | null
          notice_type?: string
          notice_value?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "version_notices_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "contract_versions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      cloud_storage_connections_public: {
        Row: {
          created_at: string | null
          folder_url: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          provider: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          folder_url?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          provider?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          folder_url?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          provider?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      append_maintenance_comment: {
        Args: { p_comment: string; p_form_id: string }
        Returns: undefined
      }
      resolve_sc_approver: {
        Args: { creator: string }
        Returns: {
          approver_profile: string
          approver_org_member: string
          approver_name: string
        }[]
      }
      calculate_next_send_at: {
        Args: {
          p_days_before: number[]
          p_due_date: string
          p_last_sent_at: string
          p_repeat_every_days: number
        }
        Returns: string
      }
      can_access_gantt: { Args: { _user_id: string }; Returns: boolean }
      get_cloud_storage_token: {
        Args: { p_connection_id: string }
        Returns: {
          access_token: string
          refresh_token: string
        }[]
      }
      get_cloud_storage_token_internal: {
        Args: { p_connection_id: string }
        Returns: {
          access_token: string
          refresh_token: string
        }[]
      }
      get_dashboard_stats: { Args: never; Returns: Json }
      get_folder_file_counts: {
        Args: { p_folder_ids: string[] }
        Returns: {
          file_count: number
          folder_id: string
        }[]
      }
      get_org_members_admin: {
        Args: never
        Returns: {
          company_id: string | null
          created_at: string | null
          display_order: number | null
          email: string | null
          id: string
          name: string
          parent_id: string | null
          phone: string | null
          position: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "org_members"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_org_members_basic: {
        Args: never
        Returns: {
          company_id: string
          created_at: string
          display_order: number
          id: string
          name: string
          parent_id: string
          position: string
        }[]
      }
      get_termination_alerts: { Args: never; Returns: Json }
      has_permission: {
        Args: {
          _permission: Database["public"]["Enums"]["permission_type"]
          _resource: string
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      purge_deleted_pois: { Args: never; Returns: undefined }
      purge_deleted_routes: { Args: never; Returns: undefined }
      set_cloud_storage_token: {
        Args: {
          p_access_token: string
          p_connection_id: string
          p_refresh_token: string
        }
        Returns: undefined
      }
    }
    Enums: {
      alert_type:
        | "contract_expiration"
        | "contract_renewal"
        | "early_termination_notice"
        | "inspection"
        | "maintenance"
        | "license"
        | "permit"
        | "certificate"
        | "other"
      app_role: "admin" | "user" | "operador_terreno"
      budget_classification: "CAPEX" | "OPEX"
      contract_status: "en_negociacion" | "firmado" | "vencido"
      document_type:
        | "borrador"
        | "borrador_final"
        | "firmado"
        | "borrador_r"
        | "borrador_final_r"
        | "firmado_r"
      notice_type: "fecha" | "meses" | "rangos" | "desde_mes" | "sin_termino"
      notification_channel: "email" | "whatsapp"
      patent_doc_status:
        | "pendiente"
        | "solicitado"
        | "en_curso"
        | "ok"
        | "nuevo_doc"
        | "no_aplica"
      patent_priority: "priority_1" | "priority_2" | "priority_3" | "vigente"
      permission_type: "view" | "edit" | "all"
      service_contract_frequency: "mensual" | "trimestral" | "semestral" | "anual" | "otro"
      service_contract_status: "en_negociacion" | "activo" | "vencido" | "cancelado"
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
      alert_type: [
        "contract_expiration",
        "contract_renewal",
        "early_termination_notice",
        "inspection",
        "maintenance",
        "license",
        "permit",
        "certificate",
        "other",
      ],
      app_role: ["admin", "user", "operador_terreno"],
      budget_classification: ["CAPEX", "OPEX"],
      contract_status: ["en_negociacion", "firmado", "vencido"],
      document_type: [
        "borrador",
        "borrador_final",
        "firmado",
        "borrador_r",
        "borrador_final_r",
        "firmado_r",
      ],
      notice_type: ["fecha", "meses", "rangos", "desde_mes", "sin_termino"],
      notification_channel: ["email", "whatsapp"],
      patent_doc_status: [
        "pendiente",
        "solicitado",
        "en_curso",
        "ok",
        "nuevo_doc",
        "no_aplica",
      ],
      patent_priority: ["priority_1", "priority_2", "priority_3", "vigente"],
      permission_type: ["view", "edit", "all"],
      service_contract_frequency: ["mensual", "trimestral", "semestral", "anual", "otro"],
      service_contract_status: ["en_negociacion", "activo", "vencido", "cancelado"],
    },
  },
} as const

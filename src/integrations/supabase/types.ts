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
      alerts: {
        Row: {
          alert_subtype: string | null
          alert_type: Database["public"]["Enums"]["alert_type"]
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
          id: string
          is_active: boolean
          item_id: string | null
          item_type: string | null
          last_sent_at: string | null
          message: string | null
          next_send_at: string | null
          priority: number | null
          repeat_every_days: number | null
          title: string
          updated_at: string
        }
        Insert: {
          alert_subtype?: string | null
          alert_type?: Database["public"]["Enums"]["alert_type"]
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
          id?: string
          is_active?: boolean
          item_id?: string | null
          item_type?: string | null
          last_sent_at?: string | null
          message?: string | null
          next_send_at?: string | null
          priority?: number | null
          repeat_every_days?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          alert_subtype?: string | null
          alert_type?: Database["public"]["Enums"]["alert_type"]
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
          id?: string
          is_active?: boolean
          item_id?: string | null
          item_type?: string | null
          last_sent_at?: string | null
          message?: string | null
          next_send_at?: string | null
          priority?: number | null
          repeat_every_days?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_lines: {
        Row: {
          amount_uf: number
          budget_id: string
          created_at: string
          currency: string | null
          description: string | null
          display_order: number | null
          id: string
          name: string
          parent_id: string | null
          quantity: number | null
          status: string
          template_line_id: string | null
          unit_price: number | null
          unit_type: string | null
          updated_at: string
        }
        Insert: {
          amount_uf?: number
          budget_id: string
          created_at?: string
          currency?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          name: string
          parent_id?: string | null
          quantity?: number | null
          status?: string
          template_line_id?: string | null
          unit_price?: number | null
          unit_type?: string | null
          updated_at?: string
        }
        Update: {
          amount_uf?: number
          budget_id?: string
          created_at?: string
          currency?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          name?: string
          parent_id?: string | null
          quantity?: number | null
          status?: string
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
            foreignKeyName: "budget_lines_parent_id_fkey"
            columns: ["parent_id"]
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
          created_at: string
          currency: string | null
          default_amount_uf: number | null
          description: string | null
          display_order: number | null
          id: string
          name: string
          parent_id: string | null
          quantity: number | null
          template_id: string
          unit_type: string | null
        }
        Insert: {
          created_at?: string
          currency?: string | null
          default_amount_uf?: number | null
          description?: string | null
          display_order?: number | null
          id?: string
          name: string
          parent_id?: string | null
          quantity?: number | null
          template_id: string
          unit_type?: string | null
        }
        Update: {
          created_at?: string
          currency?: string | null
          default_amount_uf?: number | null
          description?: string | null
          display_order?: number | null
          id?: string
          name?: string
          parent_id?: string | null
          quantity?: number | null
          template_id?: string
          unit_type?: string | null
        }
        Relationships: [
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
      cloud_storage_connections: {
        Row: {
          access_token: string | null
          created_at: string
          folder_url: string | null
          id: string
          is_active: boolean | null
          name: string
          provider: string
          refresh_token: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          folder_url?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          provider: string
          refresh_token?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          folder_url?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          provider?: string
          refresh_token?: string | null
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
          id: string
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
          id?: string
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
          id?: string
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
          contract_id: string
          created_at: string
          id: string
          is_closed: boolean | null
          updated_at: string
          year: number
        }
        Insert: {
          amount_uf?: number
          budget_type: string
          closed_at?: string | null
          closed_by?: string | null
          contract_id: string
          created_at?: string
          id?: string
          is_closed?: boolean | null
          updated_at?: string
          year: number
        }
        Update: {
          amount_uf?: number
          budget_type?: string
          closed_at?: string | null
          closed_by?: string | null
          contract_id?: string
          created_at?: string
          id?: string
          is_closed?: boolean | null
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
        ]
      }
      contract_contacts: {
        Row: {
          cedula_identidad: string | null
          company: string
          contract_id: string
          created_at: string
          domicilio_comercial: string | null
          email: string
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
          email: string
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
          email?: string
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
          contract_id: string
          created_at: string
          id: string
          priority: Database["public"]["Enums"]["patent_priority"]
          priority_changed_at: string | null
          priority_changed_by: string | null
          updated_at: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          id?: string
          priority?: Database["public"]["Enums"]["patent_priority"]
          priority_changed_at?: string | null
          priority_changed_by?: string | null
          updated_at?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          id?: string
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
          contract_id: string
          created_at: string
          duration_months: number
          effective_date: string | null
          first_adjustment_month: number | null
          fondo_promocion_percentage: number | null
          gastos_comunes_prorrata_kwh_clima: number | null
          gastos_comunes_uf_m2: number | null
          gastos_comunes_uf_ml_frente: number | null
          grace_months: number | null
          guarantee_multiplier: number | null
          has_extended_gastos_comunes: boolean | null
          has_periodic_adjustments: boolean | null
          id: string
          initial_rent: number | null
          is_current: boolean
          is_renegotiation: boolean
          notice_bilaterality: string | null
          notice_type: Database["public"]["Enums"]["notice_type"]
          notice_value: string
          regime_rent: number
          variable_rent_percentage: number | null
          version_number: number
        }
        Insert: {
          adicional_administracion_percentage?: number | null
          adjustment_periodicity_months?: number | null
          adjustment_type?: string | null
          adjustment_value?: number | null
          contract_id: string
          created_at?: string
          duration_months: number
          effective_date?: string | null
          first_adjustment_month?: number | null
          fondo_promocion_percentage?: number | null
          gastos_comunes_prorrata_kwh_clima?: number | null
          gastos_comunes_uf_m2?: number | null
          gastos_comunes_uf_ml_frente?: number | null
          grace_months?: number | null
          guarantee_multiplier?: number | null
          has_extended_gastos_comunes?: boolean | null
          has_periodic_adjustments?: boolean | null
          id?: string
          initial_rent?: number | null
          is_current?: boolean
          is_renegotiation?: boolean
          notice_bilaterality?: string | null
          notice_type: Database["public"]["Enums"]["notice_type"]
          notice_value: string
          regime_rent: number
          variable_rent_percentage?: number | null
          version_number: number
        }
        Update: {
          adicional_administracion_percentage?: number | null
          adjustment_periodicity_months?: number | null
          adjustment_type?: string | null
          adjustment_value?: number | null
          contract_id?: string
          created_at?: string
          duration_months?: number
          effective_date?: string | null
          first_adjustment_month?: number | null
          fondo_promocion_percentage?: number | null
          gastos_comunes_prorrata_kwh_clima?: number | null
          gastos_comunes_uf_m2?: number | null
          gastos_comunes_uf_ml_frente?: number | null
          grace_months?: number | null
          guarantee_multiplier?: number | null
          has_extended_gastos_comunes?: boolean | null
          has_periodic_adjustments?: boolean | null
          id?: string
          initial_rent?: number | null
          is_current?: boolean
          is_renegotiation?: boolean
          notice_bilaterality?: string | null
          notice_type?: Database["public"]["Enums"]["notice_type"]
          notice_value?: string
          regime_rent?: number
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
          created_at: string
          deleted_at: string | null
          display_currency: string | null
          drive_folder_id: string | null
          id: string
          is_expired_but_operating: boolean | null
          metros_lineales_frente: number | null
          name: string
          num_estacionamientos: number | null
          obra_status: string | null
          operation_status: string | null
          patente_status: string | null
          proyecto_status: string | null
          signed_date: string | null
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
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          display_currency?: string | null
          drive_folder_id?: string | null
          id?: string
          is_expired_but_operating?: boolean | null
          metros_lineales_frente?: number | null
          name: string
          num_estacionamientos?: number | null
          obra_status?: string | null
          operation_status?: string | null
          patente_status?: string | null
          proyecto_status?: string | null
          signed_date?: string | null
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
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          display_currency?: string | null
          drive_folder_id?: string | null
          id?: string
          is_expired_but_operating?: boolean | null
          metros_lineales_frente?: number | null
          name?: string
          num_estacionamientos?: number | null
          obra_status?: string | null
          operation_status?: string | null
          patente_status?: string | null
          proyecto_status?: string | null
          signed_date?: string | null
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
        }
        Relationships: []
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
          depends_on_task_id: string
          id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          depends_on_task_id: string
          id?: string
          task_id: string
        }
        Update: {
          created_at?: string
          depends_on_task_id?: string
          id?: string
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
          created_at: string
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
          parent_id: string | null
          progress: number | null
          start_date: string | null
          status: string
          template_task_id: string | null
          timeline_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
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
          parent_id?: string | null
          progress?: number | null
          start_date?: string | null
          status?: string
          template_task_id?: string | null
          timeline_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
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
          parent_id?: string | null
          progress?: number | null
          start_date?: string | null
          status?: string
          template_task_id?: string | null
          timeline_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gantt_tasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "gantt_tasks"
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
          depends_on_task_id: string
          id: string
          lag_days: number | null
          lag_type: string
          task_id: string
        }
        Insert: {
          created_at?: string
          depends_on_task_id: string
          id?: string
          lag_days?: number | null
          lag_type?: string
          task_id: string
        }
        Update: {
          created_at?: string
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
          created_at: string
          default_duration_days: number | null
          display_order: number | null
          duration_type: string
          id: string
          name: string
          parent_id: string | null
          template_id: string
        }
        Insert: {
          created_at?: string
          default_duration_days?: number | null
          display_order?: number | null
          duration_type?: string
          id?: string
          name: string
          parent_id?: string | null
          template_id: string
        }
        Update: {
          created_at?: string
          default_duration_days?: number | null
          display_order?: number | null
          duration_type?: string
          id?: string
          name?: string
          parent_id?: string | null
          template_id?: string
        }
        Relationships: [
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
          contract_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
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
            foreignKeyName: "gantt_timelines_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "gantt_templates"
            referencedColumns: ["id"]
          },
        ]
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
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          display_order?: number
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
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
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
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
      purchase_orders: {
        Row: {
          amount_clp: number | null
          amount_uf: number
          attachment_url: string | null
          budget_id: string | null
          budget_line_id: string | null
          contract_id: string
          created_at: string
          description: string | null
          drive_file_id: string | null
          id: string
          input_currency: string | null
          order_date: string
          order_number: string
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
          budget_id?: string | null
          budget_line_id?: string | null
          contract_id: string
          created_at?: string
          description?: string | null
          drive_file_id?: string | null
          id?: string
          input_currency?: string | null
          order_date?: string
          order_number: string
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
          budget_id?: string | null
          budget_line_id?: string | null
          contract_id?: string
          created_at?: string
          description?: string | null
          drive_file_id?: string | null
          id?: string
          input_currency?: string | null
          order_date?: string
          order_number?: string
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
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      rent_escalations: {
        Row: {
          amount: number
          created_at: string
          id: string
          month_number: number
          version_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          month_number: number
          version_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
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
      suppliers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          rut: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          rut?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          rut?: string | null
          updated_at?: string
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_next_send_at: {
        Args: {
          p_days_before: number[]
          p_due_date: string
          p_last_sent_at: string
          p_repeat_every_days: number
        }
        Returns: string
      }
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
      app_role: "admin" | "user"
      contract_status: "en_negociacion" | "firmado" | "vencido"
      document_type:
        | "borrador"
        | "borrador_final"
        | "firmado"
        | "borrador_r"
        | "borrador_final_r"
        | "firmado_r"
      notice_type: "fecha" | "meses" | "rangos"
      notification_channel: "email" | "whatsapp"
      patent_doc_status: "pendiente" | "en_curso" | "ok" | "nuevo_doc"
      patent_priority: "priority_1" | "priority_2" | "priority_3" | "vigente"
      permission_type: "view" | "edit" | "all"
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
      app_role: ["admin", "user"],
      contract_status: ["en_negociacion", "firmado", "vencido"],
      document_type: [
        "borrador",
        "borrador_final",
        "firmado",
        "borrador_r",
        "borrador_final_r",
        "firmado_r",
      ],
      notice_type: ["fecha", "meses", "rangos"],
      notification_channel: ["email", "whatsapp"],
      patent_doc_status: ["pendiente", "en_curso", "ok", "nuevo_doc"],
      patent_priority: ["priority_1", "priority_2", "priority_3", "vigente"],
      permission_type: ["view", "edit", "all"],
    },
  },
} as const

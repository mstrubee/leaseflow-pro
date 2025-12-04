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
          repeat_every_days: number | null
          title: string
          updated_at: string
        }
        Insert: {
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
          repeat_every_days?: number | null
          title: string
          updated_at?: string
        }
        Update: {
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
      contract_contacts: {
        Row: {
          company: string
          contract_id: string
          created_at: string
          email: string
          id: string
          name: string
          phone: string
        }
        Insert: {
          company: string
          contract_id: string
          created_at?: string
          email: string
          id?: string
          name: string
          phone: string
        }
        Update: {
          company?: string
          contract_id?: string
          created_at?: string
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
      contract_versions: {
        Row: {
          contract_id: string
          created_at: string
          duration_months: number
          effective_date: string | null
          id: string
          initial_rent: number | null
          is_current: boolean
          is_renegotiation: boolean
          notice_type: Database["public"]["Enums"]["notice_type"]
          notice_value: string
          regime_rent: number
          variable_rent_percentage: number | null
          version_number: number
        }
        Insert: {
          contract_id: string
          created_at?: string
          duration_months: number
          effective_date?: string | null
          id?: string
          initial_rent?: number | null
          is_current?: boolean
          is_renegotiation?: boolean
          notice_type: Database["public"]["Enums"]["notice_type"]
          notice_value: string
          regime_rent: number
          variable_rent_percentage?: number | null
          version_number: number
        }
        Update: {
          contract_id?: string
          created_at?: string
          duration_months?: number
          effective_date?: string | null
          id?: string
          initial_rent?: number | null
          is_current?: boolean
          is_renegotiation?: boolean
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
          drive_folder_id: string | null
          id: string
          name: string
          obra_status: string | null
          operation_status: string | null
          patente_status: string | null
          signed_date: string | null
          status: Database["public"]["Enums"]["contract_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          drive_folder_id?: string | null
          id?: string
          name: string
          obra_status?: string | null
          operation_status?: string | null
          patente_status?: string | null
          signed_date?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          drive_folder_id?: string | null
          id?: string
          name?: string
          obra_status?: string | null
          operation_status?: string | null
          patente_status?: string | null
          signed_date?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
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
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          folder_type?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          folder_type?: string | null
          id?: string
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
      notice_type: "fecha" | "meses"
      notification_channel: "email" | "whatsapp"
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
      notice_type: ["fecha", "meses"],
      notification_channel: ["email", "whatsapp"],
      permission_type: ["view", "edit", "all"],
    },
  },
} as const

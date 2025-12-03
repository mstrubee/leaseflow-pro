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
          id: string
          name: string
          signed_date: string | null
          status: Database["public"]["Enums"]["contract_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          signed_date?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
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
          file_type: string | null
          folder_id: string
          id: string
          name: string
          uploaded_at: string
          url: string
        }
        Insert: {
          file_type?: string | null
          folder_id: string
          id?: string
          name: string
          uploaded_at?: string
          url: string
        }
        Update: {
          file_type?: string | null
          folder_id?: string
          id?: string
          name?: string
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
          folder_type: string | null
          id: string
          is_base_folder: boolean
          name: string
          parent_id: string | null
        }
        Insert: {
          contract_id?: string | null
          created_at?: string
          folder_type?: string | null
          id?: string
          is_base_folder?: boolean
          name: string
          parent_id?: string | null
        }
        Update: {
          contract_id?: string | null
          created_at?: string
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
      app_role: "admin" | "user"
      contract_status: "en_negociacion" | "firmado" | "vencido"
      document_type: "borrador" | "borrador_final" | "firmado"
      notice_type: "fecha" | "meses"
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
      app_role: ["admin", "user"],
      contract_status: ["en_negociacion", "firmado", "vencido"],
      document_type: ["borrador", "borrador_final", "firmado"],
      notice_type: ["fecha", "meses"],
      permission_type: ["view", "edit", "all"],
    },
  },
} as const

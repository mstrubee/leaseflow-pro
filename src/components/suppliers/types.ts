export interface SupplierCategory {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  display_order: number;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  children?: SupplierCategory[];
}

export interface SupplierEmail {
  id: string;
  supplier_id: string;
  email: string;
  is_primary: boolean;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  rut: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  street: string | null;
  street_number: string | null;
  commune: string | null;
  /** Bank fields live in the admin-only supplier_bank_details table; populated only for admins */
  bank_name?: string | null;
  bank_account_type?: string | null;
  bank_account_number?: string | null;
  contact_name: string | null;
  is_generic: boolean;
  is_internal_transfer: boolean;
  category_id: string | null;
  created_at: string;
  updated_at: string;
  category?: { id: string; name: string } | null;
  /** All assigned rubros via supplier_category_assignments */
  category_assignments?: { category: { id: string; name: string } }[];
  emails?: SupplierEmail[];
}

export interface SupplierOpexCategory {
  id: string;
  supplier_id: string;
  opex_category_id: string;
  created_at: string;
}

export interface SupplierInfluenceZone {
  id: string;
  supplier_id: string;
  region: string;
  commune: string | null;
  created_at: string;
}

export interface SupplierFormData {
  name: string;
  rut: string;
  street: string;
  street_number: string;
  commune: string;
  bank_name: string;
  bank_account_type: string;
  bank_account_number: string;
  contact_name: string;
  phone: string;
  emails: string[];
  /** Primary category (kept for backward compat — equals category_ids[0]) */
  category_id: string;
  /** All assigned rubros (multi-select) */
  category_ids: string[];
  opex_category_ids: string[];
  influence_zones: { region: string; commune: string | null }[];
  is_generic: boolean;
  is_internal_transfer: boolean;
}

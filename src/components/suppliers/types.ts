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
  bank_name: string | null;
  bank_account_type: string | null;
  bank_account_number: string | null;
  contact_name: string | null;
  is_generic: boolean;
  category_id: string | null;
  created_at: string;
  updated_at: string;
  category?: { id: string; name: string } | null;
  emails?: SupplierEmail[];
}

export interface SupplierOpexCategory {
  id: string;
  supplier_id: string;
  opex_category_id: string;
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
  category_id: string;
  opex_category_ids: string[];
  is_generic: boolean;
}

export interface MaintenanceForm {
  id: string;
  form_number: string;
  status: string;
  created_date: string | null;
  resolution_date: string | null;
  contract_id: string | null;
  contract_name: string | null;
  general_description: string | null;
  electrical_description: string | null;
  civil_description: string | null;
  hvac_description: string | null;
  fixed_assets_description: string | null;
  additional_comments: string | null;
  year: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: string | null;
}

export interface ParsedMaintenanceRow {
  rowIndex: number;
  form_number: string;
  status: string;
  created_date: string | null;
  contract_name: string | null;
  contract_id: string | null;
  general_description: string | null;
  electrical_description: string | null;
  civil_description: string | null;
  hvac_description: string | null;
  fixed_assets_description: string | null;
  additional_comments: string | null;
  errors: string[];
  warnings: string[];
}

export type MaintenanceType = 'Eléctrico' | 'Obra Civil' | 'Climatización' | 'Activos Fijos' | 'General' | 'Múltiple';

export function detectMaintenanceType(form: Pick<MaintenanceForm | ParsedMaintenanceRow, 'electrical_description' | 'civil_description' | 'hvac_description' | 'fixed_assets_description' | 'general_description'>): MaintenanceType {
  const types: { field: keyof typeof form; label: MaintenanceType }[] = [
    { field: 'electrical_description', label: 'Eléctrico' },
    { field: 'civil_description', label: 'Obra Civil' },
    { field: 'hvac_description', label: 'Climatización' },
    { field: 'fixed_assets_description', label: 'Activos Fijos' },
  ];
  
  const found = types.filter(t => form[t.field]?.toString().trim());
  if (found.length > 1) return 'Múltiple';
  if (found.length === 1) return found[0].label;
  if (form.general_description?.toString().trim()) return 'General';
  return 'General';
}

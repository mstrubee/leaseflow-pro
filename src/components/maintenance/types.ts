export const SUB_STATUS_ORDER = [
  'solicitado',
  'pre_aprobado',
  'evaluado',
  'cotizando',
  'en_ejecucion',
  'resuelto',
] as const;

export type SubStatus = typeof SUB_STATUS_ORDER[number];

export const SUB_STATUS_LABELS: Record<SubStatus, string> = {
  solicitado: 'Solicitado',
  pre_aprobado: 'Pre Aprobado',
  evaluado: 'Evaluado',
  cotizando: 'Cotizando',
  en_ejecucion: 'En Ejecución',
  resuelto: 'Resuelto',
};

export const SUB_STATUS_INFO: Record<SubStatus, { description: string; responsible: string }> = {
  solicitado: { description: 'La tienda ha solicitado el Form. Se requiere aprobación de Gerente Zonal y Gerente Operaciones para avanzar.', responsible: 'Control de Gestión' },
  pre_aprobado: { description: 'Requiere Aprobación de Gerente Zonal y Gerente Operaciones para avanzar a Evaluación Técnica.', responsible: 'Control de Gestión' },
  evaluado: { description: 'Preaprobado por Gerencia. Se requiere evaluación Técnica para avanzar a Cotización.', responsible: 'Jefe Mantenciones' },
  cotizando: { description: 'Evaluación Técnica OK. Se requiere cotización para Avanzar a Ejecución.', responsible: 'Jefe Compras' },
  en_ejecucion: { description: 'En ejecución. Se requiere recepción para marcar como Resuelto.', responsible: 'Jefe Mantenciones' },
  resuelto: { description: 'Form Resuelto.', responsible: 'Control de Gestión' },
};

export function getNextSubStatus(current: SubStatus): SubStatus | null {
  const idx = SUB_STATUS_ORDER.indexOf(current);
  if (idx < 0 || idx >= SUB_STATUS_ORDER.length - 1) return null;
  return SUB_STATUS_ORDER[idx + 1];
}

export interface MaintenanceForm {
  id: string;
  form_number: string;
  status: string;
  sub_status: SubStatus;
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
  evidence_links: string[] | null;
  year: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: string | null;
  status_changed_at: string | null;
  sub_status_solicitado_at: string | null;
  sub_status_pre_aprobado_at: string | null;
  sub_status_evaluado_at: string | null;
  sub_status_cotizando_at: string | null;
  sub_status_en_ejecucion_at: string | null;
  sub_status_resuelto_at: string | null;
}

export interface ParsedMaintenanceRow {
  rowIndex: number;
  form_number: string;
  status: string;
  created_date: string | null;
  resolution_date: string | null;
  contract_name: string | null;
  contract_id: string | null;
  general_description: string | null;
  electrical_description: string | null;
  civil_description: string | null;
  hvac_description: string | null;
  fixed_assets_description: string | null;
  additional_comments: string | null;
  evidence_links: string[];
  ambiguousCandidates?: { id: string; name: string }[];
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

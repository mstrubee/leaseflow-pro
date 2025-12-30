export type PatentPriority = 'priority_1' | 'priority_2' | 'priority_3' | 'vigente';
export type PatentDocStatus = 'pendiente' | 'en_curso' | 'ok' | 'nuevo_doc' | 'no_aplica';

export interface PatentChecklistSection {
  id: string;
  code: string;
  name: string;
  display_order: number;
}

export interface PatentChecklistItem {
  id: string;
  section_id: string;
  name: string;
  display_order: number;
  is_active: boolean;
}

export interface PatentEmitter {
  id: string;
  name: string;
  is_active: boolean;
  section_id?: string;
}

export interface PatentStatus {
  id: string;
  code: string;
  name: string;
  bg_color: string;
  text_color: string;
  display_order: number;
  is_active: boolean;
}

export interface PatentItemEmitter {
  id: string;
  checklist_item_id: string;
  emitter_id: string;
}

export interface PatentCustomColumn {
  id: string;
  name: string;
  column_type: string;
  display_order: number;
  is_active: boolean;
}

export interface ContractPatent {
  id: string;
  contract_id: string;
  priority: PatentPriority;
  priority_changed_at?: string;
  priority_changed_by?: string;
}

export interface PatentDocument {
  id: string;
  contract_id: string;
  checklist_item_id: string;
  status: PatentDocStatus;
  status_changed_at?: string;
  status_changed_by?: string;
  emitter_id?: string;
  responsible?: string;
  start_date?: string;
  deadline_days?: number;
  end_date?: string;
  document_url?: string;
  drive_file_id?: string;
  storage_provider?: string;
  folder_id?: string;
  notes?: string;
  custom_data?: Record<string, string>;
}

export interface PatentDocumentAlert {
  id: string;
  patent_document_id: string;
  alert_column: string;
  alert_date: string;
  frequency_days?: number;
  recipients?: string[];
  is_active: boolean;
  last_sent_at?: string;
  created_by?: string;
}

export interface ContractWithPatent {
  id: string;
  name: string;
  status: string;
  patente_status: string;
  contract_patents?: ContractPatent;
  contract_addresses?: Array<{ region: string; commune: string }>;
  patent_documents?: PatentDocument[];
}

export const PRIORITY_CONFIG: Record<PatentPriority, { label: string; color: string; bgColor: string; textColor: string }> = {
  priority_1: { label: 'Prioridad 1', color: 'hsl(0, 84%, 60%)', bgColor: 'bg-red-100', textColor: 'text-red-800' },
  priority_2: { label: 'Prioridad 2', color: 'hsl(25, 95%, 53%)', bgColor: 'bg-orange-100', textColor: 'text-orange-800' },
  priority_3: { label: 'Prioridad 3', color: 'hsl(48, 96%, 53%)', bgColor: 'bg-yellow-100', textColor: 'text-yellow-800' },
  vigente: { label: 'Vigente', color: 'hsl(142, 71%, 45%)', bgColor: 'bg-green-100', textColor: 'text-green-800' },
};

// Default fallback config - will be overridden by dynamic statuses
export const STATUS_CONFIG: Record<PatentDocStatus, { label: string; color: string; bgColor: string; textColor: string }> = {
  pendiente: { label: 'Pendiente', color: 'hsl(0, 84%, 60%)', bgColor: 'bg-red-100', textColor: 'text-red-800' },
  en_curso: { label: 'En Curso', color: 'hsl(48, 96%, 53%)', bgColor: 'bg-yellow-100', textColor: 'text-yellow-800' },
  ok: { label: 'Ok', color: 'hsl(142, 71%, 45%)', bgColor: 'bg-green-100', textColor: 'text-green-800' },
  nuevo_doc: { label: 'Nuevo Doc', color: 'hsl(217, 91%, 60%)', bgColor: 'bg-blue-100', textColor: 'text-blue-800' },
  no_aplica: { label: 'No Aplica', color: 'hsl(220, 9%, 46%)', bgColor: 'bg-gray-100', textColor: 'text-gray-800' },
};

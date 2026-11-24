export type FixedAssetStatus = "activo" | "mantencion" | "baja";

export interface FixedAsset {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  sku: string | null;
  unit: string;
  total_quantity: number;
  available_quantity?: number | null;
  acquisition_value: number | null;
  acquisition_date: string | null;
  status: FixedAssetStatus;
  location: string | null;
  photo_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FixedAssetFormData {
  name: string;
  description: string;
  category: string;
  sku: string;
  unit: string;
  total_quantity: string;
  acquisition_value: string;
  acquisition_date: string;
  status: FixedAssetStatus;
  location: string;
  notes: string;
}

export interface ContractFixedAsset {
  id: string;
  contract_id: string;
  fixed_asset_id: string;
  quantity: number;
  assigned_at: string;
  notes: string | null;
  fixed_asset?: Pick<FixedAsset, "id" | "name" | "sku" | "unit" | "category"> | null;
  contract?: { id: string; name: string } | null;
}

export const STATUS_LABELS: Record<FixedAssetStatus, string> = {
  activo: "Activo",
  mantencion: "En mantención",
  baja: "De baja",
};

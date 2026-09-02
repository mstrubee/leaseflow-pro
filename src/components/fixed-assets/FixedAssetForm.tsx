import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { FixedAsset, FixedAssetFormData, STATUS_LABELS } from "./types";

interface FixedAssetFormProps {
  asset?: FixedAsset | null;
  onSave: () => void;
  onCancel: () => void;
}

const emptyForm: FixedAssetFormData = {
  name: "",
  description: "",
  category: "",
  sku: "",
  unit: "unidad",
  total_quantity: "1",
  acquisition_value: "",
  acquisition_date: "",
  status: "activo",
  location: "",
  notes: "",
};

export const FixedAssetForm = ({ asset, onSave, onCancel }: FixedAssetFormProps) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<FixedAssetFormData>(emptyForm);

  useEffect(() => {
    if (asset) {
      setFormData({
        name: asset.name || "",
        description: asset.description || "",
        category: asset.category || "",
        sku: asset.sku || "",
        unit: asset.unit || "unidad",
        total_quantity: String(asset.total_quantity ?? 1),
        acquisition_value: asset.acquisition_value != null ? String(asset.acquisition_value) : "",
        acquisition_date: asset.acquisition_date || "",
        status: asset.status,
        location: asset.location || "",
        notes: asset.notes || "",
      });
    } else {
      setFormData(emptyForm);
    }
  }, [asset]);

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      toast.error("El nombre es requerido");
      return false;
    }
    const qty = Number(formData.total_quantity);
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error("La cantidad debe ser un número válido");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        category: formData.category.trim() || null,
        sku: formData.sku.trim() || null,
        unit: formData.unit.trim() || "unidad",
        total_quantity: Number(formData.total_quantity),
        acquisition_value: formData.acquisition_value ? Number(formData.acquisition_value) : null,
        acquisition_date: formData.acquisition_date || null,
        status: formData.status,
        location: formData.location.trim() || null,
        notes: formData.notes.trim() || null,
      };

      if (asset) {
        const { error } = await supabase
          .from("fixed_assets")
          .update(payload)
          .eq("id", asset.id);
        if (error) throw error;
        toast.success("Activo actualizado");
      } else {
        const { error } = await supabase
          .from("fixed_assets")
          .insert({ ...payload, created_by: user?.id || null });
        if (error) throw error;
        toast.success("Activo creado");
      }
      onSave();
    } catch (error) {
      console.error("Error saving fixed asset:", error);
      toast.error("Error al guardar el activo");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label htmlFor="name">Nombre *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
            placeholder="Ej: Extintor 6kg"
          />
        </div>

        <div className="col-span-2">
          <Label htmlFor="description">Descripción</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
            rows={2}
          />
        </div>

        <div>
          <Label htmlFor="category">Categoría</Label>
          <Input
            id="category"
            value={formData.category}
            onChange={(e) => setFormData((p) => ({ ...p, category: e.target.value }))}
            placeholder="Ej: Seguridad"
          />
        </div>

        <div>
          <Label htmlFor="sku">SKU / Código</Label>
          <Input
            id="sku"
            value={formData.sku}
            onChange={(e) => setFormData((p) => ({ ...p, sku: e.target.value }))}
          />
        </div>

        <div>
          <Label htmlFor="total_quantity">Cantidad total *</Label>
          <Input
            id="total_quantity"
            type="number"
            min="0"
            value={formData.total_quantity}
            onChange={(e) => setFormData((p) => ({ ...p, total_quantity: e.target.value }))}
          />
        </div>

        <div>
          <Label htmlFor="unit">Unidad de medida</Label>
          <Input
            id="unit"
            value={formData.unit}
            onChange={(e) => setFormData((p) => ({ ...p, unit: e.target.value }))}
            placeholder="unidad, caja, set..."
          />
        </div>

        <div>
          <Label htmlFor="acquisition_value">Valor de adquisición</Label>
          <Input
            id="acquisition_value"
            type="number"
            min="0"
            step="0.01"
            value={formData.acquisition_value}
            onChange={(e) => setFormData((p) => ({ ...p, acquisition_value: e.target.value }))}
          />
        </div>

        <div>
          <Label htmlFor="acquisition_date">Fecha de adquisición</Label>
          <Input
            id="acquisition_date"
            type="date"
            value={formData.acquisition_date}
            onChange={(e) => setFormData((p) => ({ ...p, acquisition_date: e.target.value }))}
          />
        </div>

        <div>
          <Label htmlFor="status">Estado</Label>
          <Select
            value={formData.status}
            onValueChange={(value) => setFormData((p) => ({ ...p, status: value as FixedAssetFormData["status"] }))}
          >
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="location">Ubicación / Bodega</Label>
          <Input
            id="location"
            value={formData.location}
            onChange={(e) => setFormData((p) => ({ ...p, location: e.target.value }))}
          />
        </div>

        <div className="col-span-2">
          <Label htmlFor="notes">Notas</Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
            rows={2}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {asset ? "Guardar cambios" : "Crear activo"}
        </Button>
      </div>
    </form>
  );
};

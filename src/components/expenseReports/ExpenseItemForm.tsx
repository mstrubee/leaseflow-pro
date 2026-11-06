import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import {
  CURRENCY_OPTIONS,
  EXPENSE_TYPE_LABELS,
  PAYMENT_TYPE_LABELS,
  RECEIPT_TYPE_LABELS,
  type ExpenseItem,
  type ExpenseItemFields,
} from "./expenseReportsTypes";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ExpenseItem;
  readOnly: boolean;
  saving: boolean;
  onSave: (fields: Partial<ExpenseItemFields>) => Promise<boolean>;
  onUploadPhoto: (file: File) => Promise<boolean>;
  onDeletePhoto: () => Promise<void>;
}

export function ExpenseItemForm({ open, onOpenChange, item, readOnly, saving, onSave, onUploadPhoto, onDeletePhoto }: Props) {
  const photoUrl = useSignedUrl(item.photo_path);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const [fields, setFields] = useState<Partial<ExpenseItemFields>>({
    expense_type: item.expense_type,
    transaction_date: item.transaction_date,
    business_purpose: item.business_purpose,
    purchase_city: item.purchase_city,
    payment_type: item.payment_type,
    total_amount: item.total_amount,
    currency: item.currency,
    tax_amount: item.tax_amount,
    has_receipt: item.has_receipt,
    receipt_type: item.receipt_type,
    provider_rut: item.provider_rut,
    provider_name: item.provider_name,
    receipt_number: item.receipt_number,
  });

  const update = <K extends keyof ExpenseItemFields>(key: K, value: ExpenseItemFields[K]) =>
    setFields((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    const ok = await onSave(fields);
    if (ok) {
      toast.success("Gasto guardado");
      onOpenChange(false);
    } else {
      toast.error("No se pudo guardar el gasto");
    }
  };

  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    const ok = await onUploadPhoto(file);
    setUploading(false);
    if (!ok) toast.error("No se pudo subir la foto");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{readOnly ? "Gasto" : "Editar gasto"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Foto */}
          <div>
            <Label className="text-xs">Foto del comprobante</Label>
            <div className="mt-1">
              {photoUrl ? (
                <div className="relative">
                  <img src={photoUrl} alt="Comprobante" className="w-full h-40 object-cover rounded-md border" />
                  {!readOnly && (
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      className="absolute top-1.5 right-1.5 h-7 w-7"
                      onClick={onDeletePhoto}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ) : !readOnly ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-16 gap-2 border-dashed"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  {uploading ? "Subiendo…" : "Tomar/subir foto"}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground italic">Sin foto</p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoSelected}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tipo de gasto</Label>
              <Select
                value={fields.expense_type ?? undefined}
                disabled={readOnly}
                onValueChange={(v) => update("expense_type", v as ExpenseItemFields["expense_type"])}
              >
                <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(EXPENSE_TYPE_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Fecha de la transacción</Label>
              <Input
                type="date"
                className="h-9 text-sm mt-1"
                disabled={readOnly}
                value={fields.transaction_date ?? ""}
                onChange={(e) => update("transaction_date", e.target.value || null)}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Propósito de negocios</Label>
            <Textarea
              className="text-sm mt-1"
              rows={2}
              disabled={readOnly}
              value={fields.business_purpose ?? ""}
              onChange={(e) => update("business_purpose", e.target.value)}
              placeholder="Breve explicación del motivo del gasto"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Ciudad de la compra</Label>
              <Input
                className="h-9 text-sm mt-1"
                disabled={readOnly}
                value={fields.purchase_city ?? ""}
                onChange={(e) => update("purchase_city", e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Tipo de pago</Label>
              <Select
                value={fields.payment_type ?? undefined}
                disabled={readOnly}
                onValueChange={(v) => update("payment_type", v as ExpenseItemFields["payment_type"])}
              >
                <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_TYPE_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Monto total</Label>
              <Input
                type="number"
                className="h-9 text-sm mt-1"
                disabled={readOnly}
                value={fields.total_amount ?? ""}
                onChange={(e) => update("total_amount", e.target.value === "" ? null : Number(e.target.value))}
              />
            </div>
            <div>
              <Label className="text-xs">Moneda</Label>
              <Select
                value={fields.currency ?? undefined}
                disabled={readOnly}
                onValueChange={(v) => update("currency", v)}
              >
                <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="CLP" /></SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Monto impuestos</Label>
              <Input
                type="number"
                className="h-9 text-sm mt-1"
                disabled={readOnly}
                value={fields.tax_amount ?? ""}
                onChange={(e) => update("tax_amount", e.target.value === "" ? null : Number(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Estado del comprobante</Label>
              <Select
                value={fields.has_receipt == null ? undefined : String(fields.has_receipt)}
                disabled={readOnly}
                onValueChange={(v) => update("has_receipt", v === "true")}
              >
                <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Con comprobante</SelectItem>
                  <SelectItem value="false">Sin comprobante</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tipo de comprobante</Label>
              <Select
                value={fields.receipt_type ?? undefined}
                disabled={readOnly}
                onValueChange={(v) => update("receipt_type", v as ExpenseItemFields["receipt_type"])}
              >
                <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(RECEIPT_TYPE_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">RUT de proveedor</Label>
              <Input
                className="h-9 text-sm mt-1"
                disabled={readOnly}
                value={fields.provider_rut ?? ""}
                onChange={(e) => update("provider_rut", e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Nombre de proveedor</Label>
              <Input
                className="h-9 text-sm mt-1"
                disabled={readOnly}
                value={fields.provider_name ?? ""}
                onChange={(e) => update("provider_name", e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Número de comprobante</Label>
            <Input
              className="h-9 text-sm mt-1"
              disabled={readOnly}
              value={fields.receipt_number ?? ""}
              onChange={(e) => update("receipt_number", e.target.value)}
            />
          </div>

          {!readOnly && (
            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Guardar gasto
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

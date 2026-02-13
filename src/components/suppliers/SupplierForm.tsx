import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Supplier, SupplierFormData } from "./types";
import { CategorySelect } from "./CategorySelect";
import { OpexCategoryMultiSelect } from "./OpexCategoryMultiSelect";

interface SupplierFormProps {
  supplier?: Supplier | null;
  onSave: () => void;
  onCancel: () => void;
  defaultCategoryId?: string;
}

export const SupplierForm = ({ supplier, onSave, onCancel, defaultCategoryId }: SupplierFormProps) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<SupplierFormData>({
    name: "",
    rut: "",
    street: "",
    street_number: "",
    commune: "",
    bank_name: "",
    bank_account_type: "",
    bank_account_number: "",
    contact_name: "",
    phone: "",
    emails: [""],
    category_id: defaultCategoryId || "",
    opex_category_ids: [],
    is_generic: false,
  });
  const [newEmail, setNewEmail] = useState("");

  useEffect(() => {
    if (supplier) {
      loadSupplierData();
    }
  }, [supplier]);

  const loadSupplierData = async () => {
    if (!supplier) return;
    
    // Load emails
    const { data: emails } = await supabase
      .from("supplier_emails")
      .select("email")
      .eq("supplier_id", supplier.id);

    // Load OPEX categories
    const { data: opexCategories } = await supabase
      .from("supplier_opex_categories")
      .select("opex_category_id")
      .eq("supplier_id", supplier.id);

    setFormData({
      name: supplier.name || "",
      rut: supplier.rut || "",
      street: supplier.street || "",
      street_number: supplier.street_number || "",
      commune: supplier.commune || "",
      bank_name: supplier.bank_name || "",
      bank_account_type: supplier.bank_account_type || "",
      bank_account_number: supplier.bank_account_number || "",
      contact_name: supplier.contact_name || "",
      phone: supplier.phone || "",
      emails: emails?.map(e => e.email) || [""],
      category_id: supplier.category_id || "",
      opex_category_ids: opexCategories?.map(c => c.opex_category_id) || [],
      is_generic: supplier.is_generic || false,
    });
  };

  const handleAddEmail = () => {
    if (newEmail && !formData.emails.includes(newEmail)) {
      setFormData(prev => ({ ...prev, emails: [...prev.emails, newEmail] }));
      setNewEmail("");
    }
  };

  const handleRemoveEmail = (email: string) => {
    setFormData(prev => ({ 
      ...prev, 
      emails: prev.emails.filter(e => e !== email) 
    }));
  };

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      toast.error("El nombre es requerido");
      return false;
    }
    if (!formData.category_id) {
      toast.error("Debe seleccionar un rubro");
      return false;
    }
    const validEmails = formData.emails.filter(e => e.trim());
    if (validEmails.length === 0 && !formData.phone.trim()) {
      toast.error("Debe ingresar al menos un email o teléfono");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      // Check for duplicates
      const { data: existing } = await supabase
        .from("suppliers")
        .select("id, name, rut")
        .or(`name.eq.${formData.name},rut.eq.${formData.rut || ""}`)
        .neq("id", supplier?.id || "00000000-0000-0000-0000-000000000000");

      if (existing && existing.length > 0) {
        const dupName = existing.find(s => s.name === formData.name);
        const dupRut = existing.find(s => s.rut === formData.rut);
        if (dupName) {
          toast.error("Ya existe un proveedor con ese nombre");
          setLoading(false);
          return;
        }
        if (dupRut && formData.rut) {
          toast.error("Ya existe un proveedor con ese RUT");
          setLoading(false);
          return;
        }
      }

      const supplierData = {
        name: formData.name.trim(),
        rut: formData.rut.trim() || null,
        street: formData.street.trim() || null,
        street_number: formData.street_number.trim() || null,
        commune: formData.commune.trim() || null,
        bank_name: formData.bank_name.trim() || null,
        bank_account_type: formData.bank_account_type || null,
        bank_account_number: formData.bank_account_number.trim() || null,
        contact_name: formData.contact_name.trim() || null,
        phone: formData.phone.trim() || null,
        category_id: formData.category_id || null,
        is_generic: formData.is_generic,
      };

      let supplierId: string;

      if (supplier) {
        // Update
        const { error } = await supabase
          .from("suppliers")
          .update(supplierData)
          .eq("id", supplier.id);
        if (error) throw error;
        supplierId = supplier.id;
      } else {
        // Insert
        const { data, error } = await supabase
          .from("suppliers")
          .insert(supplierData)
          .select()
          .single();
        if (error) throw error;
        supplierId = data.id;
      }

      // Update emails
      await supabase.from("supplier_emails").delete().eq("supplier_id", supplierId);
      const validEmails = formData.emails.filter(e => e.trim());
      if (validEmails.length > 0) {
        await supabase.from("supplier_emails").insert(
          validEmails.map((email, idx) => ({
            supplier_id: supplierId,
            email: email.trim(),
            is_primary: idx === 0,
          }))
        );
      }

      // Update OPEX categories
      await supabase.from("supplier_opex_categories").delete().eq("supplier_id", supplierId);
      if (formData.opex_category_ids.length > 0) {
        await supabase.from("supplier_opex_categories").insert(
          formData.opex_category_ids.map((opex_category_id) => ({
            supplier_id: supplierId,
            opex_category_id,
          }))
        );
      }

      toast.success(supplier ? "Proveedor actualizado" : "Proveedor creado");
      onSave();
    } catch (error: any) {
      console.error("Error saving supplier:", error);
      toast.error("Error al guardar proveedor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Company Data */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm border-b pb-2">Datos de la Empresa</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre de la empresa *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Nombre de la empresa"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rut">RUT</Label>
            <Input
              id="rut"
              value={formData.rut}
              onChange={e => setFormData(prev => ({ ...prev, rut: e.target.value }))}
              placeholder="12.345.678-9"
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="street">Calle</Label>
            <Input
              id="street"
              value={formData.street}
              onChange={e => setFormData(prev => ({ ...prev, street: e.target.value }))}
              placeholder="Calle"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="street_number">Número</Label>
            <Input
              id="street_number"
              value={formData.street_number}
              onChange={e => setFormData(prev => ({ ...prev, street_number: e.target.value }))}
              placeholder="Número"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="commune">Comuna</Label>
            <Input
              id="commune"
              value={formData.commune}
              onChange={e => setFormData(prev => ({ ...prev, commune: e.target.value }))}
              placeholder="Comuna"
            />
          </div>
        </div>
      </div>

      {/* Bank Data */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm border-b pb-2">Datos Bancarios</h4>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="bank_name">Banco</Label>
            <Input
              id="bank_name"
              value={formData.bank_name}
              onChange={e => setFormData(prev => ({ ...prev, bank_name: e.target.value }))}
              placeholder="Nombre del banco"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bank_account_type">Tipo de cuenta</Label>
            <Select
              value={formData.bank_account_type}
              onValueChange={value => setFormData(prev => ({ ...prev, bank_account_type: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="corriente">Cuenta Corriente</SelectItem>
                <SelectItem value="vista">Cuenta Vista</SelectItem>
                <SelectItem value="ahorro">Cuenta de Ahorro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bank_account_number">Número de cuenta</Label>
            <Input
              id="bank_account_number"
              value={formData.bank_account_number}
              onChange={e => setFormData(prev => ({ ...prev, bank_account_number: e.target.value }))}
              placeholder="Número de cuenta"
            />
          </div>
        </div>
      </div>

      {/* Contact Data */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm border-b pb-2">Datos de Contacto</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="contact_name">Nombre del contacto</Label>
            <Input
              id="contact_name"
              value={formData.contact_name}
              onChange={e => setFormData(prev => ({ ...prev, contact_name: e.target.value }))}
              placeholder="Nombre del contacto"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Teléfono</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              placeholder="+56 9 1234 5678"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Emails</Label>
          <div className="flex flex-wrap gap-2 mb-2">
            {formData.emails.filter(e => e).map((email, idx) => (
              <Badge key={idx} variant="secondary" className="gap-1">
                {email}
                <button type="button" onClick={() => handleRemoveEmail(email)}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              type="email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              placeholder="Agregar email"
              onKeyDown={e => e.key === "Enter" && (e.preventDefault(), handleAddEmail())}
            />
            <Button type="button" variant="outline" size="icon" onClick={handleAddEmail}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Category */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm border-b pb-2">Rubro *</h4>
        <CategorySelect
          value={formData.category_id || null}
          onChange={(categoryId) => setFormData(prev => ({ ...prev, category_id: categoryId || "" }))}
          placeholder="Seleccionar rubro"
          allowAllLevels={true}
        />
        <p className="text-xs text-muted-foreground">
          Puedes seleccionar cualquier nivel de la jerarquía de rubros
        </p>
      </div>

      {/* OPEX Categories */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm border-b pb-2">Categorías OPEX (opcional)</h4>
        <OpexCategoryMultiSelect
          value={formData.opex_category_ids}
          onChange={(opex_category_ids) => setFormData(prev => ({ ...prev, opex_category_ids }))}
          supplierCategoryId={formData.category_id || null}
        />
        <p className="text-xs text-muted-foreground">
          Asigna categorías OPEX para que el proveedor aparezca como opción al crear órdenes de compra.
          Las categorías sugeridas se basan en el rubro seleccionado.
        </p>
      </div>

      {/* Generic supplier */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="is_generic"
            checked={formData.is_generic}
            onCheckedChange={checked => setFormData(prev => ({ ...prev, is_generic: !!checked }))}
          />
          <Label htmlFor="is_generic">Proveedor genérico (disponible para todos los rubros)</Label>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {supplier ? "Guardar cambios" : "Crear proveedor"}
        </Button>
      </div>
    </form>
  );
};

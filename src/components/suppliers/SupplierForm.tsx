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

interface SupplierFormProps {
  supplier?: Supplier | null;
  onSave: () => void;
  onCancel: () => void;
}

interface TemplateLineOption {
  id: string;
  name: string;
  template_name: string;
  parent_name?: string;
}

export const SupplierForm = ({ supplier, onSave, onCancel }: SupplierFormProps) => {
  const [loading, setLoading] = useState(false);
  const [templateLines, setTemplateLines] = useState<TemplateLineOption[]>([]);
  const [searchProduct, setSearchProduct] = useState("");
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
    category_id: "",
    is_generic: false,
    product_ids: [],
  });
  const [newEmail, setNewEmail] = useState("");

  useEffect(() => {
    loadTemplateLines();
    if (supplier) {
      loadSupplierData();
    }
  }, [supplier]);

  const loadTemplateLines = async () => {
    // Get all template lines with parent info
    const { data: allLines } = await supabase
      .from("budget_template_lines")
      .select(`
        id,
        name,
        parent_id,
        template:budget_templates(name)
      `)
      .order("name");
    
    if (allLines) {
      // Create a map for parent names
      const lineMap = new Map(allLines.map(l => [l.id, l]));
      
      // Find IDs that are parents (have children)
      const parentIds = new Set(
        allLines
          .filter(line => line.parent_id)
          .map(line => line.parent_id)
      );
      
      // Filter to only leaf lines (not parents)
      const leafLines = allLines.filter(line => !parentIds.has(line.id));
      
      setTemplateLines(leafLines.map((line: any) => {
        const parent = line.parent_id ? lineMap.get(line.parent_id) : null;
        return {
          id: line.id,
          name: line.name,
          template_name: line.template?.name || "",
          parent_name: parent?.name || undefined
        };
      }));
    }
  };

  const loadSupplierData = async () => {
    if (!supplier) return;
    
    // Load emails
    const { data: emails } = await supabase
      .from("supplier_emails")
      .select("email")
      .eq("supplier_id", supplier.id);
    
    // Load products
    const { data: products } = await supabase
      .from("supplier_products")
      .select("template_line_id")
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
      is_generic: supplier.is_generic || false,
      product_ids: products?.map(p => p.template_line_id) || [],
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

  const handleProductToggle = (productId: string) => {
    setFormData(prev => ({
      ...prev,
      product_ids: prev.product_ids.includes(productId)
        ? prev.product_ids.filter(id => id !== productId)
        : [...prev.product_ids, productId]
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

      // Update products
      await supabase.from("supplier_products").delete().eq("supplier_id", supplierId);
      if (formData.product_ids.length > 0) {
        await supabase.from("supplier_products").insert(
          formData.product_ids.map(template_line_id => ({
            supplier_id: supplierId,
            template_line_id,
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
                <SelectValue placeholder="Seleccionar tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="corriente">Corriente</SelectItem>
                <SelectItem value="vista">Vista</SelectItem>
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
            <Label htmlFor="contact_name">Nombre de contacto</Label>
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
        <h4 className="font-medium text-sm border-b pb-2">Rubro</h4>
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

      {/* Generic / Products */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm border-b pb-2">Asignación a Productos/Servicios</h4>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="is_generic"
            checked={formData.is_generic}
            onCheckedChange={checked => setFormData(prev => ({ ...prev, is_generic: !!checked }))}
          />
          <Label htmlFor="is_generic">Proveedor genérico (disponible para todos los productos)</Label>
        </div>
        {!formData.is_generic && (
          <div className="space-y-2">
            <Label>Productos/Servicios asociados de plantillas</Label>
            
            {/* Selected products badges */}
            {formData.product_ids.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {formData.product_ids.map(id => {
                  const line = templateLines.find(l => l.id === id);
                  return line ? (
                    <Badge key={id} variant="secondary" className="gap-1">
                      {line.name}
                      <button type="button" onClick={() => handleProductToggle(id)}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ) : null;
                })}
              </div>
            )}
            
            {/* Search input */}
            <Input
              type="text"
              value={searchProduct}
              onChange={e => setSearchProduct(e.target.value)}
              placeholder="Buscar producto o servicio..."
              className="mb-2"
            />
            
            <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1">
              {templateLines
                .filter(line => 
                  line.name.toLowerCase().includes(searchProduct.toLowerCase()) ||
                  line.template_name.toLowerCase().includes(searchProduct.toLowerCase()) ||
                  line.parent_name?.toLowerCase().includes(searchProduct.toLowerCase())
                )
                .map(line => (
                  <div key={line.id} className="flex items-center space-x-2 hover:bg-muted/50 rounded px-1">
                    <Checkbox
                      id={`product-${line.id}`}
                      checked={formData.product_ids.includes(line.id)}
                      onCheckedChange={() => handleProductToggle(line.id)}
                    />
                    <Label htmlFor={`product-${line.id}`} className="text-sm font-normal cursor-pointer flex-1">
                      {line.name}
                      {line.parent_name && (
                        <span className="text-muted-foreground text-xs ml-1">→ {line.parent_name}</span>
                      )}
                      <span className="text-muted-foreground text-xs ml-1">({line.template_name})</span>
                    </Label>
                  </div>
                ))}
              {templateLines.filter(line => 
                line.name.toLowerCase().includes(searchProduct.toLowerCase()) ||
                line.template_name.toLowerCase().includes(searchProduct.toLowerCase())
              ).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  No se encontraron productos
                </p>
              )}
            </div>
          </div>
        )}
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

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Settings2, X, Check, Pencil } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";

interface CustomField {
  id: string;
  field_name: string;
  display_order: number;
  is_active: boolean;
}

interface CustomFieldValue {
  id?: string;
  field_id: string;
  field_value: string;
}

interface CustomFieldsManagerProps {
  contractId?: string;
  values: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
  onFieldsChange?: () => void;
}

export function CustomFieldsManager({
  contractId,
  values,
  onChange,
  onFieldsChange,
}: CustomFieldsManagerProps) {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [addingField, setAddingField] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editingFieldName, setEditingFieldName] = useState("");

  useEffect(() => {
    loadFields();
  }, []);

  const loadFields = async () => {
    try {
      const { data, error } = await supabase
        .from("contract_custom_fields")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (error) throw error;
      setFields(data || []);
    } catch (error) {
      console.error("Error loading custom fields:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddField = async () => {
    if (!newFieldName.trim()) return;
    
    setAddingField(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      const maxOrder = fields.length > 0 ? Math.max(...fields.map(f => f.display_order)) : 0;
      
      const { data, error } = await supabase
        .from("contract_custom_fields")
        .insert({
          field_name: newFieldName.trim(),
          display_order: maxOrder + 1,
          created_by: user.user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      setFields([...fields, data]);
      setNewFieldName("");
      setShowAddField(false);
      onFieldsChange?.();
      toast({
        title: "Campo creado",
        description: `El campo "${data.field_name}" fue creado exitosamente.`,
      });
    } catch (error) {
      console.error("Error adding field:", error);
      toast({
        title: "Error",
        description: "No se pudo crear el campo.",
        variant: "destructive",
      });
    } finally {
      setAddingField(false);
    }
  };

  const handleUpdateFieldName = async (fieldId: string) => {
    if (!editingFieldName.trim()) {
      setEditingFieldId(null);
      return;
    }

    try {
      const { error } = await supabase
        .from("contract_custom_fields")
        .update({ field_name: editingFieldName.trim() })
        .eq("id", fieldId);

      if (error) throw error;

      setFields(fields.map(f => 
        f.id === fieldId ? { ...f, field_name: editingFieldName.trim() } : f
      ));
      setEditingFieldId(null);
      toast({
        title: "Campo actualizado",
        description: "El nombre del campo fue actualizado.",
      });
    } catch (error) {
      console.error("Error updating field:", error);
      toast({
        title: "Error",
        description: "No se pudo actualizar el campo.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    try {
      const { error } = await supabase
        .from("contract_custom_fields")
        .update({ is_active: false })
        .eq("id", fieldId);

      if (error) throw error;

      setFields(fields.filter(f => f.id !== fieldId));
      onFieldsChange?.();
      toast({
        title: "Campo eliminado",
        description: "El campo fue eliminado exitosamente.",
      });
    } catch (error) {
      console.error("Error deleting field:", error);
      toast({
        title: "Error",
        description: "No se pudo eliminar el campo.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return null;
  }

  if (fields.length === 0 && !isAdmin) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Field inputs */}
      {fields.map((field) => (
        <div key={field.id} className="space-y-2">
          <div className="flex items-center gap-2">
            {editingFieldId === field.id ? (
              <div className="flex items-center gap-2 flex-1">
                <Input
                  value={editingFieldName}
                  onChange={(e) => setEditingFieldName(e.target.value)}
                  className="h-7 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleUpdateFieldName(field.id);
                    } else if (e.key === "Escape") {
                      setEditingFieldId(null);
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleUpdateFieldName(field.id)}
                >
                  <Check className="h-3 w-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setEditingFieldId(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <>
                <Label htmlFor={`custom-${field.id}`} className="flex-1">
                  {field.field_name}
                </Label>
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setEditingFieldId(field.id);
                        setEditingFieldName(field.field_name);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteField(field.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
          <Input
            id={`custom-${field.id}`}
            value={values[field.id] || ""}
            onChange={(e) => onChange(field.id, e.target.value)}
            placeholder={`Ingrese ${field.field_name.toLowerCase()}`}
          />
        </div>
      ))}

      {/* Add new field (Admin only) */}
      {isAdmin && (
        <div className="pt-2 border-t border-border">
          {showAddField ? (
            <div className="flex items-center gap-2">
              <Input
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                placeholder="Nombre del campo"
                className="flex-1"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddField();
                  } else if (e.key === "Escape") {
                    setShowAddField(false);
                    setNewFieldName("");
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                onClick={handleAddField}
                disabled={addingField || !newFieldName.trim()}
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowAddField(false);
                  setNewFieldName("");
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => setShowAddField(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Agregar campo personalizado
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

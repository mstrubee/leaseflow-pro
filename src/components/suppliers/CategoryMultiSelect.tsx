import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Category {
  id: string;
  name: string;
  parent_id: string | null;
}

interface CategoryWithChildren extends Category {
  children: CategoryWithChildren[];
}

interface CategoryMultiSelectProps {
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

export const CategoryMultiSelect = ({
  value,
  onChange,
  placeholder = "Seleccionar rubro(s)",
  disabled = false,
}: CategoryMultiSelectProps) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tree, setTree] = useState<CategoryWithChildren[]>([]);
  const [open, setOpen] = useState(false);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newParentId, setNewParentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadCategories(); }, []);

  const buildTree = (flat: Category[]): CategoryWithChildren[] => {
    const map = new Map<string, CategoryWithChildren>();
    const roots: CategoryWithChildren[] = [];
    flat.forEach(c => map.set(c.id, { ...c, children: [] }));
    flat.forEach(c => {
      const node = map.get(c.id)!;
      if (c.parent_id && map.has(c.parent_id)) map.get(c.parent_id)!.children.push(node);
      else roots.push(node);
    });
    return roots;
  };

  const loadCategories = async () => {
    const { data } = await supabase
      .from("supplier_categories")
      .select("id, name, parent_id")
      .eq("is_active", true)
      .order("display_order");
    setCategories(data || []);
    setTree(buildTree(data || []));
  };

  const getFullPath = (id: string): string => {
    const path: string[] = [];
    let cur = categories.find(c => c.id === id);
    while (cur) {
      path.unshift(cur.name);
      cur = cur.parent_id ? categories.find(c => c.id === cur!.parent_id) : undefined;
    }
    return path.join(" → ");
  };

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter(v => v !== id));
    else onChange([...value, id]);
  };

  const remove = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter(v => v !== id));
  };

  // Flatten tree for Command list, preserving hierarchy visually
  const flatItems: { id: string; label: string; level: number }[] = [];
  const flatten = (nodes: CategoryWithChildren[], level: number) => {
    for (const node of nodes) {
      flatItems.push({ id: node.id, label: node.name, level });
      flatten(node.children, level + 1);
    }
  };
  flatten(tree, 0);

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    setSaving(true);
    try {
      const siblings = categories.filter(c => c.parent_id === newParentId);
      const { data, error } = await supabase
        .from("supplier_categories")
        .insert({ name: newCategoryName.trim(), display_order: siblings.length + 1, parent_id: newParentId })
        .select().single();
      if (error) {
        if (error.code === "23505") toast.error("Ya existe un rubro con ese nombre");
        else throw error;
        return;
      }
      toast.success(newParentId ? "Sub-rubro creado" : "Rubro creado");
      await loadCategories();
      onChange([...value, data.id]);
      setShowNewDialog(false);
      setNewCategoryName("");
      setNewParentId(null);
    } catch {
      toast.error("Error al crear rubro");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="space-y-2">
        {/* Selected badges */}
        {value.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {value.map(id => (
              <Badge key={id} variant="secondary" className="gap-1 pr-1">
                {getFullPath(id) || id}
                <button
                  type="button"
                  onClick={(e) => remove(id, e)}
                  className="ml-0.5 rounded-full hover:bg-muted p-0.5"
                  disabled={disabled}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Trigger */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              disabled={disabled}
              className={cn("w-full justify-between font-normal", value.length > 0 && "text-muted-foreground")}
            >
              {value.length === 0 ? placeholder : `${value.length} rubro(s) seleccionado(s)`}
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0 z-[1200]" align="start">
            <Command>
              <CommandInput placeholder="Buscar rubro…" />
              <CommandList>
                <CommandEmpty>Sin resultados</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="__new__"
                    onSelect={() => { setOpen(false); setShowNewDialog(true); }}
                    className="text-primary font-medium"
                  >
                    <Plus className="h-3.5 w-3.5 mr-2" />
                    Nuevo rubro…
                  </CommandItem>
                </CommandGroup>
                <CommandGroup heading="Rubros disponibles">
                  {flatItems.map(item => {
                    const selected = value.includes(item.id);
                    return (
                      <CommandItem
                        key={item.id}
                        value={getFullPath(item.id)}
                        onSelect={() => toggle(item.id)}
                      >
                        <div
                          className={cn(
                            "mr-2 h-4 w-4 rounded border flex items-center justify-center shrink-0",
                            selected ? "bg-primary border-primary" : "border-input"
                          )}
                        >
                          {selected && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                        <span style={{ paddingLeft: `${item.level * 12}px` }} className={cn(item.level === 0 && "font-medium")}>
                          {item.level > 0 && <span className="text-muted-foreground mr-1">↳</span>}
                          {item.label}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Create dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="sm:max-w-md z-[1300]">
          <DialogHeader><DialogTitle>Nuevo Rubro</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Rubro padre (opcional)</label>
              <Select value={newParentId || "none"} onValueChange={v => setNewParentId(v === "none" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Ninguno (rubro principal)" /></SelectTrigger>
                <SelectContent className="z-[1400]">
                  <SelectItem value="none">Ninguno (rubro principal)</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{getFullPath(c.id)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{newParentId ? "Nombre del sub-rubro" : "Nombre del rubro"}</label>
              <Input
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                placeholder={newParentId ? "Ej: Muebles Metálicos" : "Ej: Mobiliario"}
                onKeyDown={e => e.key === "Enter" && handleCreateCategory()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateCategory} disabled={saving || !newCategoryName.trim()}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

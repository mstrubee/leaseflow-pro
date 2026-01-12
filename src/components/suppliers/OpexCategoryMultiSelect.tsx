import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, X, Loader2 } from "lucide-react";

interface OpexCategory {
  id: string;
  name: string;
  display_order: number;
  supplier_category_id: string | null;
}

interface OpexCategoryMultiSelectProps {
  value: string[];
  onChange: (categoryIds: string[]) => void;
  supplierCategoryId?: string | null;
  disabled?: boolean;
}

export const OpexCategoryMultiSelect = ({ 
  value, 
  onChange, 
  supplierCategoryId,
  disabled 
}: OpexCategoryMultiSelectProps) => {
  const [categories, setCategories] = useState<OpexCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [supplierCategoryTree, setSupplierCategoryTree] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    loadCategories();
    loadSupplierCategoryTree();
  }, []);

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("opex_categories")
        .select("id, name, display_order, supplier_category_id")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error("Error loading OPEX categories:", error);
    } finally {
      setLoading(false);
    }
  };

  // Load supplier categories tree to match parent/child relationships
  const loadSupplierCategoryTree = async () => {
    try {
      const { data, error } = await supabase
        .from("supplier_categories")
        .select("id, parent_id")
        .eq("is_active", true);

      if (error) throw error;
      
      // Build a map of category -> all ancestor and descendant IDs
      const categoryMap = new Map<string, string[]>();
      if (data) {
        data.forEach(cat => {
          const related: string[] = [cat.id];
          // Add parent
          if (cat.parent_id) {
            related.push(cat.parent_id);
            // Find grandparent
            const parent = data.find(c => c.id === cat.parent_id);
            if (parent?.parent_id) {
              related.push(parent.parent_id);
            }
          }
          // Add children
          data.filter(c => c.parent_id === cat.id).forEach(child => {
            related.push(child.id);
            // Add grandchildren
            data.filter(gc => gc.parent_id === child.id).forEach(grandchild => {
              related.push(grandchild.id);
            });
          });
          categoryMap.set(cat.id, [...new Set(related)]);
        });
      }
      setSupplierCategoryTree(categoryMap);
    } catch (error) {
      console.error("Error loading supplier category tree:", error);
    }
  };

  // Get matching OPEX categories based on supplier's category
  const getMatchingCategories = () => {
    if (!supplierCategoryId) return categories;
    
    const relatedCategoryIds = supplierCategoryTree.get(supplierCategoryId) || [supplierCategoryId];
    
    // Filter OPEX categories that match the supplier's category tree
    const matched = categories.filter(opexCat => 
      opexCat.supplier_category_id && relatedCategoryIds.includes(opexCat.supplier_category_id)
    );
    
    // Also include "Otros" category and categories without supplier_category_id
    const others = categories.filter(c => 
      c.name.toLowerCase() === "otros" || !c.supplier_category_id
    );
    
    return [...new Set([...matched, ...others])].sort((a, b) => a.display_order - b.display_order);
  };

  const handleToggle = (categoryId: string) => {
    if (value.includes(categoryId)) {
      onChange(value.filter(id => id !== categoryId));
    } else {
      onChange([...value, categoryId]);
    }
  };

  const handleRemove = (categoryId: string) => {
    onChange(value.filter(id => id !== categoryId));
  };

  const getSelectedNames = () => {
    return value
      .map(id => categories.find(c => c.id === id)?.name)
      .filter(Boolean) as string[];
  };

  const matchingCategories = getMatchingCategories();
  const allCategories = categories;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando categorías...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={disabled}
          >
            <span className="truncate">
              {value.length === 0 
                ? "Seleccionar categorías OPEX" 
                : `${value.length} categoría${value.length > 1 ? 's' : ''} seleccionada${value.length > 1 ? 's' : ''}`
              }
            </span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <ScrollArea className="h-72 p-2">
            {supplierCategoryId && matchingCategories.length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-medium text-muted-foreground px-2 py-1 bg-muted rounded mb-1">
                  Sugeridas (por rubro)
                </p>
                {matchingCategories.map((category) => (
                  <div
                    key={category.id}
                    className="flex items-center space-x-2 py-1.5 px-2 hover:bg-accent rounded cursor-pointer"
                    onClick={() => handleToggle(category.id)}
                  >
                    <Checkbox
                      id={`match-${category.id}`}
                      checked={value.includes(category.id)}
                      onCheckedChange={() => handleToggle(category.id)}
                    />
                    <label
                      htmlFor={`match-${category.id}`}
                      className="text-sm cursor-pointer flex-1"
                    >
                      {category.name}
                    </label>
                  </div>
                ))}
              </div>
            )}
            
            <div>
              {supplierCategoryId && matchingCategories.length > 0 && (
                <p className="text-xs font-medium text-muted-foreground px-2 py-1 bg-muted rounded mb-1">
                  Todas las categorías
                </p>
              )}
              {allCategories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center space-x-2 py-1.5 px-2 hover:bg-accent rounded cursor-pointer"
                  onClick={() => handleToggle(category.id)}
                >
                  <Checkbox
                    id={category.id}
                    checked={value.includes(category.id)}
                    onCheckedChange={() => handleToggle(category.id)}
                  />
                  <label
                    htmlFor={category.id}
                    className="text-sm cursor-pointer flex-1"
                  >
                    {category.name}
                  </label>
                </div>
              ))}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {getSelectedNames().map((name, idx) => (
            <Badge key={idx} variant="secondary" className="gap-1">
              {name}
              <button type="button" onClick={() => handleRemove(value[idx])}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};

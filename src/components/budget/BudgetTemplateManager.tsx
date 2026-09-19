import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CollapsibleCard } from "@/components/admin/CollapsibleCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
import { Plus, Trash2, Edit2, Loader2, FileText, Copy, Download, Upload } from "lucide-react";
import { BudgetTemplateLineTree, TemplateLine } from "./BudgetTemplateLineTree";
import {
  exportTemplateToExcel,
  parseExcelToTemplateLines,
  downloadExampleTemplateExcel,
} from "./BudgetTemplateExcel";

interface BudgetTemplate {
  id: string;
  name: string;
  description: string | null;
  budget_type: "capex" | "opex";
  is_active: boolean;
  created_at: string;
}

interface BudgetTemplateManagerProps {
  defaultCollapsed?: boolean;
}

export const BudgetTemplateManager = ({ defaultCollapsed = false }: BudgetTemplateManagerProps) => {
  const [templates, setTemplates] = useState<BudgetTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<BudgetTemplate | null>(null);
  const [flatLines, setFlatLines] = useState<TemplateLine[]>([]);
  const [lines, setLines] = useState<TemplateLine[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [activeTab, setActiveTab] = useState<"capex" | "opex">("capex");
  
  // New template dialog
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newType, setNewType] = useState<"capex" | "opex">("capex");
  const [creating, setCreating] = useState(false);
  
  // Edit template dialog
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // Excel import
  const [importing, setImporting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  const { ufValue } = useEconomicIndicators();

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    if (selectedTemplate) {
      loadLines(selectedTemplate.id);
    }
  }, [selectedTemplate]);

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from("budget_templates")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTemplates((data || []) as BudgetTemplate[]);
    } catch (error) {
      console.error("Error loading templates:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadLines = async (templateId: string, showLoading = true) => {
    if (showLoading) setLoadingLines(true);
    try {
      const { data, error } = await supabase
        .from("budget_template_lines")
        .select("*")
        .eq("template_id", templateId)
        .order("display_order");

      if (error) throw error;
      const flat = (data || []) as TemplateLine[];
      setFlatLines(flat);
      setLines(buildTree(flat));
    } catch (error) {
      console.error("Error loading template lines:", error);
    } finally {
      if (showLoading) setLoadingLines(false);
    }
  };

  const buildTree = (flatLines: TemplateLine[]): TemplateLine[] => {
    const map = new Map<string, TemplateLine>();
    const roots: TemplateLine[] = [];

    flatLines.forEach((line) => {
      map.set(line.id, { ...line, children: [] });
    });

    flatLines.forEach((line) => {
      const node = map.get(line.id)!;
      if (line.parent_id) {
        const parent = map.get(line.parent_id);
        if (parent) {
          parent.children!.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    // Ordenar por display_order en cada nivel para que el reordenamiento
    // (arrastrar) se refleje visualmente y no dependa del orden de inserción.
    const sortByOrder = (nodes: TemplateLine[]) => {
      nodes.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
      nodes.forEach((n) => { if (n.children && n.children.length) sortByOrder(n.children); });
    };
    sortByOrder(roots);

    return roots;
  };

  const handleCreateTemplate = async () => {
    if (!newName.trim()) {
      toast({ variant: "destructive", title: "Error", description: "El nombre es requerido" });
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("budget_templates")
        .insert({
          name: newName.trim(),
          description: newDescription.trim() || null,
          budget_type: newType,
        })
        .select()
        .single();

      if (error) throw error;

      const created = data as BudgetTemplate;
      setTemplates(prev => [created, ...prev]);
      toast({ title: "Plantilla creada", description: `"${newName}" creada exitosamente` });
      setShowNewDialog(false);
      setNewName("");
      setNewDescription("");
      setSelectedTemplate(created);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateTemplate = async () => {
    if (!selectedTemplate || !editName.trim()) return;

    try {
      const { error } = await supabase
        .from("budget_templates")
        .update({
          name: editName.trim(),
          description: editDescription.trim() || null,
        })
        .eq("id", selectedTemplate.id);

      if (error) throw error;

      const updated = { ...selectedTemplate, name: editName.trim(), description: editDescription.trim() || null };
      setTemplates(prev => prev.map(t => t.id === selectedTemplate.id ? updated : t));
      setSelectedTemplate(updated);
      toast({ title: "Plantilla actualizada" });
      setShowEditDialog(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleDeleteTemplate = async (template: BudgetTemplate) => {
    if (!confirm(`¿Eliminar la plantilla "${template.name}"? Esta acción no se puede deshacer.`)) return;

    try {
      const { error } = await supabase
        .from("budget_templates")
        .delete()
        .eq("id", template.id);

      if (error) throw error;

      setTemplates(prev => prev.filter(t => t.id !== template.id));
      if (selectedTemplate?.id === template.id) {
        setSelectedTemplate(null);
        setFlatLines([]);
        setLines([]);
      }
      toast({ title: "Plantilla eliminada" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleDuplicateTemplate = async (template: BudgetTemplate) => {
    try {
      // 1. Create new template
      const { data: newTemplate, error: templateError } = await supabase
        .from("budget_templates")
        .insert({
          name: `${template.name} (Copia)`,
          description: template.description,
          budget_type: template.budget_type,
        })
        .select()
        .single();

      if (templateError) throw templateError;

      // 2. Get all lines from original template
      const { data: originalLines, error: linesError } = await supabase
        .from("budget_template_lines")
        .select("*")
        .eq("template_id", template.id)
        .order("display_order");

      if (linesError) throw linesError;

      if (originalLines && originalLines.length > 0) {
        // Pre-generate all new IDs client-side to avoid N sequential inserts
        const idMap = new Map<string, string>();
        originalLines.forEach((line) => {
          idMap.set(line.id, crypto.randomUUID());
        });

        // Single batch insert with all parent_id/calc_source references already resolved
        const newLines = originalLines.map((line) => ({
          id: idMap.get(line.id)!,
          template_id: newTemplate.id,
          name: line.name,
          description: line.description,
          default_amount_uf: line.default_amount_uf,
          display_order: line.display_order,
          quantity: line.quantity,
          unit_type: line.unit_type,
          currency: line.currency,
          supplier_name: line.supplier_name,
          category_id: line.category_id,
          quantity_source: (line as any).quantity_source,
          calc_type: (line as any).calc_type || null,
          calc_percentage: (line as any).calc_percentage || null,
          parent_id: line.parent_id ? (idMap.get(line.parent_id) || null) : null,
          calc_source_line_id: (line as any).calc_source_line_id
            ? (idMap.get((line as any).calc_source_line_id) || null)
            : null,
        }));

        const { error: insertError } = await supabase
          .from("budget_template_lines")
          .insert(newLines);

        if (insertError) throw insertError;
      }

      setTemplates(prev => [newTemplate as BudgetTemplate, ...prev]);
      toast({ title: "Plantilla duplicada", description: `"${template.name} (Copia)" creada` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  // ---- Descargar plantilla a Excel ----
  const handleDownloadExcel = async (template: BudgetTemplate) => {
    setDownloadingId(template.id);
    try {
      const { data, error } = await supabase
        .from("budget_template_lines")
        .select("*")
        .eq("template_id", template.id)
        .order("display_order");

      if (error) throw error;
      const tree = buildTree((data || []) as TemplateLine[]);
      await exportTemplateToExcel(template.name, template.budget_type, tree, ufValue);
      toast({ title: "Excel descargado", description: `"${template.name}"` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setDownloadingId(null);
    }
  };

  // ---- Crear plantilla desde Excel ----
  const handleUploadExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset input so the same file can be re-selected later
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;

    setImporting(true);
    try {
      const parsed = await parseExcelToTemplateLines(file);

      // 1. Create the template. Name from file name (sans extension).
      const baseName = file.name.replace(/\.(xlsx|xls|csv)$/i, "").trim() || "Plantilla importada";
      const { data: newTemplate, error: tplError } = await supabase
        .from("budget_templates")
        .insert({
          name: baseName,
          description: null,
          budget_type: activeTab,
        })
        .select()
        .single();

      if (tplError) throw tplError;

      // 2. Pre-generate IDs so parent references resolve in a single batch insert.
      const ids = parsed.map(() => crypto.randomUUID());
      const rowsToInsert = parsed.map((line, i) => ({
        id: ids[i],
        template_id: newTemplate.id,
        parent_id: line.parent_index !== null ? ids[line.parent_index] : null,
        name: line.name,
        description: line.description,
        default_amount_uf: line.default_amount_uf,
        display_order: i + 1,
        quantity: line.quantity,
        unit_type: line.unit_type,
        currency: line.currency,
        supplier_name: line.supplier_name,
      }));

      const { error: linesError } = await supabase
        .from("budget_template_lines")
        .insert(rowsToInsert);

      if (linesError) throw linesError;

      const created = newTemplate as BudgetTemplate;
      setTemplates(prev => [created, ...prev]);
      setSelectedTemplate(created);
      toast({
        title: "Plantilla importada",
        description: `"${baseName}" con ${parsed.length} línea(s). Puedes editarla ahora.`,
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error al importar", description: error.message });
    } finally {
      setImporting(false);
    }
  };

  const handleAddLine = async (parentId: string | null) => {
    if (!selectedTemplate) return;

    try {
      // Get max display_order among siblings to add at the end
      let query = supabase
        .from("budget_template_lines")
        .select("display_order")
        .eq("template_id", selectedTemplate.id);

      if (parentId === null) {
        query = query.is("parent_id", null);
      } else {
        query = query.eq("parent_id", parentId);
      }

      const { data: siblings } = await query
        .order("display_order", { ascending: false })
        .limit(1);

      const maxOrder = siblings && siblings.length > 0 ? (siblings[0].display_order || 0) : 0;

      const { data: newLine, error } = await supabase.from("budget_template_lines").insert({
        template_id: selectedTemplate.id,
        parent_id: parentId,
        name: "Nueva línea",
        default_amount_uf: 0,
        display_order: maxOrder + 1,
      }).select().single();

      if (error) throw error;
      const updatedFlat = [...flatLines, newLine as TemplateLine];
      setFlatLines(updatedFlat);
      setLines(buildTree(updatedFlat));
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleUpdateLine = async (id: string, data: Partial<TemplateLine>) => {
    // Optimistic update
    const updatedFlat = flatLines.map(l => l.id === id ? { ...l, ...data } : l);
    setFlatLines(updatedFlat);
    setLines(buildTree(updatedFlat));

    try {
      const { error } = await supabase
        .from("budget_template_lines")
        .update(data)
        .eq("id", id);

      if (error) throw error;
    } catch (error: any) {
      // Revert on failure
      setFlatLines(flatLines);
      setLines(buildTree(flatLines));
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleDeleteLine = async (id: string) => {
    // Optimistic: remove line and all descendants
    const idsToRemove = new Set<string>();
    const collectChildren = (parentId: string) => {
      idsToRemove.add(parentId);
      flatLines.forEach(l => { if (l.parent_id === parentId) collectChildren(l.id); });
    };
    collectChildren(id);
    const updatedFlat = flatLines.filter(l => !idsToRemove.has(l.id));
    setFlatLines(updatedFlat);
    setLines(buildTree(updatedFlat));

    try {
      const { error } = await supabase
        .from("budget_template_lines")
        .delete()
        .eq("id", id);

      if (error) throw error;
    } catch (error: any) {
      setFlatLines(flatLines);
      setLines(buildTree(flatLines));
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  // Reordenar hermanos: actualiza display_order de forma atómica en el estado
  // local (evita el clobber del loop) y persiste cada línea en la BD.
  const handleReorderLines = async (newOrder: TemplateLine[]) => {
    const orderMap = new Map(newOrder.map((l, i) => [l.id, i]));
    const updatedFlat = flatLines.map(l =>
      orderMap.has(l.id) ? { ...l, display_order: orderMap.get(l.id)! } : l
    );
    setFlatLines(updatedFlat);
    setLines(buildTree(updatedFlat));

    try {
      await Promise.all(
        newOrder.map((l, i) =>
          supabase.from("budget_template_lines").update({ display_order: i }).eq("id", l.id)
        )
      );
    } catch (error: any) {
      setFlatLines(flatLines);
      setLines(buildTree(flatLines));
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  // Mover una línea a otro nivel (padre) y posición entre hermanos, de forma
  // atómica: cambia parent_id de la línea movida y reindexa display_order de
  // todo el grupo destino. Cubre "reordenar entre madres" y sacar hijas a raíz.
  const handleMoveLine = async (
    activeId: string,
    newParentId: string | null,
    orderedSiblingIds: string[],
  ) => {
    const orderMap = new Map(orderedSiblingIds.map((id, i) => [id, i]));
    const updatedFlat = flatLines.map((l) => {
      if (l.id === activeId) {
        return { ...l, parent_id: newParentId, display_order: orderMap.get(activeId) ?? 0 };
      }
      if (orderMap.has(l.id)) return { ...l, display_order: orderMap.get(l.id)! };
      return l;
    });
    setFlatLines(updatedFlat);
    setLines(buildTree(updatedFlat));

    try {
      await Promise.all(
        orderedSiblingIds.map((id, i) => {
          const patch = id === activeId ? { parent_id: newParentId, display_order: i } : { display_order: i };
          return supabase.from("budget_template_lines").update(patch).eq("id", id);
        }),
      );
      toast({ title: "Línea movida", description: "La estructura se ha actualizado" });
    } catch (error: any) {
      setFlatLines(flatLines);
      setLines(buildTree(flatLines));
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleReparent = async (lineId: string, newParentId: string | null) => {
    const updatedFlat = flatLines.map(l => l.id === lineId ? { ...l, parent_id: newParentId } : l);
    setFlatLines(updatedFlat);
    setLines(buildTree(updatedFlat));

    try {
      const { error } = await supabase
        .from("budget_template_lines")
        .update({ parent_id: newParentId })
        .eq("id", lineId);

      if (error) throw error;
      toast({ title: "Línea movida", description: "La estructura se ha actualizado" });
    } catch (error: any) {
      setFlatLines(flatLines);
      setLines(buildTree(flatLines));
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const openEditDialog = (template: BudgetTemplate) => {
    setEditName(template.name);
    setEditDescription(template.description || "");
    setSelectedTemplate(template);
    setShowEditDialog(true);
  };

  const filteredTemplates = templates.filter((t) => t.budget_type === activeTab);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <CollapsibleCard
      title="Formatos de Presupuesto Tipo"
      description="Define plantillas de presupuesto que podrán aplicarse al crear contratos"
      icon={<FileText className="h-5 w-5 text-blue-500" />}
      defaultOpen={!defaultCollapsed}
      headerActions={
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleUploadExcel}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={downloadExampleTemplateExcel}
            title="Descargar un Excel de ejemplo con el formato esperado"
          >
            <Download className="h-4 w-4 mr-2" />
            Ejemplo
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            title="Crear una plantilla a partir de un archivo Excel"
          >
            {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Cargar Excel
          </Button>
          <Button onClick={() => {
            setNewType(activeTab);
            setShowNewDialog(true);
          }} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Plantilla
          </Button>
        </div>
      }
    >
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="mb-4">
            <TabsTrigger value="capex">CAPEX</TabsTrigger>
            <TabsTrigger value="opex">OPEX</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* Lista de plantillas - más estrecha */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-muted-foreground mb-2">
                  Plantillas de {activeTab === "capex" ? "CAPEX" : "OPEX"}
                </h4>
                {filteredTemplates.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No hay plantillas definidas
                  </p>
                ) : (
                  filteredTemplates.map((template) => (
                    <div
                      key={template.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedTemplate?.id === template.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                      onClick={() => setSelectedTemplate(template)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{template.name}</span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadExcel(template);
                            }}
                            disabled={downloadingId === template.id}
                            title="Descargar Excel"
                          >
                            {downloadingId === template.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <Download className="h-3 w-3" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDuplicateTemplate(template);
                            }}
                            title="Duplicar"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditDialog(template);
                            }}
                            title="Editar"
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTemplate(template);
                            }}
                            title="Eliminar"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      {template.description && (
                        <p className="text-xs text-muted-foreground mt-1">{template.description}</p>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Editor de líneas - más ancho */}
              <div className="lg:col-span-4 border rounded-lg p-4">
                {selectedTemplate ? (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-medium">Estructura: {selectedTemplate.name}</h4>
                    </div>
                    {loadingLines ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    ) : (
                      <BudgetTemplateLineTree
                        lines={lines}
                        onAddLine={handleAddLine}
                        onUpdateLine={handleUpdateLine}
                        onDeleteLine={handleDeleteLine}
                        onReorder={handleReorderLines}
                        onMoveLine={handleMoveLine}
                        onReparent={handleReparent}
                      />
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    Selecciona una plantilla para ver y editar su estructura
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

      {/* Dialog: Nueva plantilla */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Plantilla de Presupuesto</DialogTitle>
            <DialogDescription>
              Crea una estructura predefinida para {newType === "capex" ? "CAPEX" : "OPEX"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ej: Formato Tienda Estándar"
              />
            </div>
            <div className="space-y-2">
              <Label>Titulo</Label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Titulo"
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={newType} onValueChange={(v: any) => setNewType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="capex">CAPEX</SelectItem>
                  <SelectItem value="opex">OPEX</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateTemplate} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Editar plantilla */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Plantilla</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Titulo</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateTemplate}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CollapsibleCard>
  );
};

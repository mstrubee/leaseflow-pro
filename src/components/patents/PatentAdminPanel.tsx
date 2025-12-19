import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, GripVertical, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PatentChecklistSection, PatentChecklistItem, PatentEmitter } from "./types";

interface PatentAdminPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: PatentChecklistSection[];
  items: PatentChecklistItem[];
  emitters: PatentEmitter[];
  onDataChange: () => void;
}

export function PatentAdminPanel({
  open,
  onOpenChange,
  sections,
  items,
  emitters,
  onDataChange,
}: PatentAdminPanelProps) {
  const [activeTab, setActiveTab] = useState<'items' | 'sections' | 'emitters'>('items');
  const [editingItem, setEditingItem] = useState<PatentChecklistItem | null>(null);
  const [editingSection, setEditingSection] = useState<PatentChecklistSection | null>(null);
  const [editingEmitter, setEditingEmitter] = useState<PatentEmitter | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'item' | 'section' | 'emitter'; id: string; name: string } | null>(null);
  
  // Form states
  const [newItemName, setNewItemName] = useState("");
  const [newItemSection, setNewItemSection] = useState("");
  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionCode, setNewSectionCode] = useState("");
  const [newEmitterName, setNewEmitterName] = useState("");

  // --- ITEMS ---
  const handleAddItem = async () => {
    if (!newItemName.trim() || !newItemSection) {
      toast.error("Nombre y sección son requeridos");
      return;
    }

    const sectionItems = items.filter(i => i.section_id === newItemSection);
    const maxOrder = Math.max(0, ...sectionItems.map(i => i.display_order));

    const { error } = await supabase
      .from("patent_checklist_items")
      .insert({
        name: newItemName.trim(),
        section_id: newItemSection,
        display_order: maxOrder + 1,
      });

    if (error) {
      toast.error("Error al crear ítem");
      return;
    }

    // Mark as "nuevo_doc" for contracts with vigente patent status
    const { data: vigentContracts } = await supabase
      .from("contracts")
      .select("id")
      .eq("status", "firmado")
      .eq("patente_status", "vigente")
      .is("deleted_at", null);

    if (vigentContracts && vigentContracts.length > 0) {
      const { data: newItem } = await supabase
        .from("patent_checklist_items")
        .select("id")
        .eq("name", newItemName.trim())
        .eq("section_id", newItemSection)
        .single();

      if (newItem) {
        await supabase.from("patent_documents").insert(
          vigentContracts.map(c => ({
            contract_id: c.id,
            checklist_item_id: newItem.id,
            status: 'nuevo_doc' as const,
          }))
        );
      }
    }

    toast.success("Ítem creado correctamente");
    setNewItemName("");
    setNewItemSection("");
    onDataChange();
  };

  const handleUpdateItem = async (item: PatentChecklistItem) => {
    const { error } = await supabase
      .from("patent_checklist_items")
      .update({ name: item.name, section_id: item.section_id })
      .eq("id", item.id);

    if (error) {
      toast.error("Error al actualizar ítem");
      return;
    }

    toast.success("Ítem actualizado");
    setEditingItem(null);
    onDataChange();
  };

  const handleDeleteItem = async (id: string) => {
    const { error } = await supabase
      .from("patent_checklist_items")
      .update({ is_active: false })
      .eq("id", id);

    if (error) {
      toast.error("Error al eliminar ítem");
      return;
    }

    toast.success("Ítem eliminado");
    setDeleteConfirm(null);
    onDataChange();
  };

  // --- SECTIONS ---
  const handleAddSection = async () => {
    if (!newSectionName.trim() || !newSectionCode.trim()) {
      toast.error("Nombre y código son requeridos");
      return;
    }

    const maxOrder = Math.max(0, ...sections.map(s => s.display_order));

    const { error } = await supabase
      .from("patent_checklist_sections")
      .insert({
        name: newSectionName.trim(),
        code: newSectionCode.trim(),
        display_order: maxOrder + 1,
      });

    if (error) {
      toast.error("Error al crear sección");
      return;
    }

    toast.success("Sección creada correctamente");
    setNewSectionName("");
    setNewSectionCode("");
    onDataChange();
  };

  const handleUpdateSection = async (section: PatentChecklistSection) => {
    const { error } = await supabase
      .from("patent_checklist_sections")
      .update({ name: section.name, code: section.code })
      .eq("id", section.id);

    if (error) {
      toast.error("Error al actualizar sección");
      return;
    }

    toast.success("Sección actualizada");
    setEditingSection(null);
    onDataChange();
  };

  const handleDeleteSection = async (id: string) => {
    // Check if section has items
    const sectionItems = items.filter(i => i.section_id === id);
    if (sectionItems.length > 0) {
      toast.error("No se puede eliminar una sección con ítems");
      setDeleteConfirm(null);
      return;
    }

    const { error } = await supabase
      .from("patent_checklist_sections")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Error al eliminar sección");
      return;
    }

    toast.success("Sección eliminada");
    setDeleteConfirm(null);
    onDataChange();
  };

  // --- EMITTERS ---
  const handleAddEmitter = async () => {
    if (!newEmitterName.trim()) {
      toast.error("El nombre es requerido");
      return;
    }

    const { error } = await supabase
      .from("patent_emitters")
      .insert({ name: newEmitterName.trim() });

    if (error) {
      toast.error("Error al crear emisor");
      return;
    }

    toast.success("Emisor creado correctamente");
    setNewEmitterName("");
    onDataChange();
  };

  const handleUpdateEmitter = async (emitter: PatentEmitter) => {
    const { error } = await supabase
      .from("patent_emitters")
      .update({ name: emitter.name })
      .eq("id", emitter.id);

    if (error) {
      toast.error("Error al actualizar emisor");
      return;
    }

    toast.success("Emisor actualizado");
    setEditingEmitter(null);
    onDataChange();
  };

  const handleDeleteEmitter = async (id: string) => {
    const { error } = await supabase
      .from("patent_emitters")
      .update({ is_active: false })
      .eq("id", id);

    if (error) {
      toast.error("Error al eliminar emisor");
      return;
    }

    toast.success("Emisor eliminado");
    setDeleteConfirm(null);
    onDataChange();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Administrar Checklist de Patentes</DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="items">Ítems del Checklist</TabsTrigger>
              <TabsTrigger value="sections">Secciones</TabsTrigger>
              <TabsTrigger value="emitters">Emisores</TabsTrigger>
            </TabsList>

            {/* ITEMS TAB */}
            <TabsContent value="items" className="flex-1 overflow-auto mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Agregar nuevo ítem</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Input
                        placeholder="Nombre del ítem"
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                      />
                    </div>
                    <Select value={newItemSection} onValueChange={setNewItemSection}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Sección" />
                      </SelectTrigger>
                      <SelectContent>
                        {sections.map(section => (
                          <SelectItem key={section.id} value={section.id}>
                            {section.code}: {section.name.substring(0, 30)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={handleAddItem}>
                      <Plus className="h-4 w-4 mr-1" />
                      Agregar
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="mt-4 space-y-4">
                {sections.map(section => (
                  <Card key={section.id}>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm font-medium">{section.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nombre</TableHead>
                            <TableHead className="w-[100px]">Acciones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items
                            .filter(i => i.section_id === section.id)
                            .sort((a, b) => a.display_order - b.display_order)
                            .map(item => (
                              <TableRow key={item.id}>
                                <TableCell>
                                  {editingItem?.id === item.id ? (
                                    <Input
                                      value={editingItem.name}
                                      onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                                    />
                                  ) : (
                                    item.name
                                  )}
                                </TableCell>
                                <TableCell>
                                  {editingItem?.id === item.id ? (
                                    <div className="flex gap-1">
                                      <Button size="icon" variant="ghost" onClick={() => handleUpdateItem(editingItem)}>
                                        <Save className="h-4 w-4" />
                                      </Button>
                                      <Button size="icon" variant="ghost" onClick={() => setEditingItem(null)}>
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="flex gap-1">
                                      <Button size="icon" variant="ghost" onClick={() => setEditingItem(item)}>
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                      <Button 
                                        size="icon" 
                                        variant="ghost" 
                                        className="text-destructive"
                                        onClick={() => setDeleteConfirm({ type: 'item', id: item.id, name: item.name })}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* SECTIONS TAB */}
            <TabsContent value="sections" className="flex-1 overflow-auto mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Agregar nueva sección</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Código (ej: C)"
                      className="w-[100px]"
                      value={newSectionCode}
                      onChange={(e) => setNewSectionCode(e.target.value)}
                    />
                    <div className="flex-1">
                      <Input
                        placeholder="Nombre de la sección"
                        value={newSectionName}
                        onChange={(e) => setNewSectionName(e.target.value)}
                      />
                    </div>
                    <Button onClick={handleAddSection}>
                      <Plus className="h-4 w-4 mr-1" />
                      Agregar
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="mt-4">
                <CardContent className="pt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">Código</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead className="w-[100px]">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sections.sort((a, b) => a.display_order - b.display_order).map(section => (
                        <TableRow key={section.id}>
                          <TableCell>
                            {editingSection?.id === section.id ? (
                              <Input
                                value={editingSection.code}
                                onChange={(e) => setEditingSection({ ...editingSection, code: e.target.value })}
                              />
                            ) : (
                              section.code
                            )}
                          </TableCell>
                          <TableCell>
                            {editingSection?.id === section.id ? (
                              <Input
                                value={editingSection.name}
                                onChange={(e) => setEditingSection({ ...editingSection, name: e.target.value })}
                              />
                            ) : (
                              section.name
                            )}
                          </TableCell>
                          <TableCell>
                            {editingSection?.id === section.id ? (
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" onClick={() => handleUpdateSection(editingSection)}>
                                  <Save className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => setEditingSection(null)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" onClick={() => setEditingSection(section)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  className="text-destructive"
                                  onClick={() => setDeleteConfirm({ type: 'section', id: section.id, name: section.name })}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* EMITTERS TAB */}
            <TabsContent value="emitters" className="flex-1 overflow-auto mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Agregar nuevo emisor</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Input
                        placeholder="Nombre del emisor"
                        value={newEmitterName}
                        onChange={(e) => setNewEmitterName(e.target.value)}
                      />
                    </div>
                    <Button onClick={handleAddEmitter}>
                      <Plus className="h-4 w-4 mr-1" />
                      Agregar
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="mt-4">
                <CardContent className="pt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead className="w-[100px]">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {emitters.map(emitter => (
                        <TableRow key={emitter.id}>
                          <TableCell>
                            {editingEmitter?.id === emitter.id ? (
                              <Input
                                value={editingEmitter.name}
                                onChange={(e) => setEditingEmitter({ ...editingEmitter, name: e.target.value })}
                              />
                            ) : (
                              emitter.name
                            )}
                          </TableCell>
                          <TableCell>
                            {editingEmitter?.id === emitter.id ? (
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" onClick={() => handleUpdateEmitter(editingEmitter)}>
                                  <Save className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => setEditingEmitter(null)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" onClick={() => setEditingEmitter(emitter)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  className="text-destructive"
                                  onClick={() => setDeleteConfirm({ type: 'emitter', id: emitter.id, name: emitter.name })}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {deleteConfirm?.type === 'item' ? 'ítem' : deleteConfirm?.type === 'section' ? 'sección' : 'emisor'}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará "{deleteConfirm?.name}". Los documentos existentes no se eliminarán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteConfirm?.type === 'item') handleDeleteItem(deleteConfirm.id);
                else if (deleteConfirm?.type === 'section') handleDeleteSection(deleteConfirm.id);
                else if (deleteConfirm?.type === 'emitter') handleDeleteEmitter(deleteConfirm.id);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

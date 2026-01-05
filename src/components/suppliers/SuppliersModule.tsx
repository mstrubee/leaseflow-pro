import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Plus, Building2, Settings } from "lucide-react";
import { SupplierForm } from "./SupplierForm";
import { SuppliersList } from "./SuppliersList";
import { CategoryManager } from "./CategoryManager";
import { Supplier } from "./types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const SuppliersModule = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setShowForm(true);
  };

  const handleSave = () => {
    setShowForm(false);
    setEditingSupplier(null);
    setRefreshKey(prev => prev + 1);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingSupplier(null);
  };

  return (
    <>
      <Card>
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CardHeader className="pb-3">
            <CollapsibleTrigger asChild>
              <div className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-lg">Proveedores</CardTitle>
                </div>
                {isOpen && (
                  <Button
                    size="sm"
                    onClick={e => { e.stopPropagation(); setShowForm(true); }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Nuevo Proveedor
                  </Button>
                )}
              </div>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <Tabs defaultValue="list">
                <TabsList className="mb-4">
                  <TabsTrigger value="list">Listado</TabsTrigger>
                  <TabsTrigger value="categories" className="gap-1">
                    <Settings className="h-3 w-3" />
                    Rubros
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="list">
                  <SuppliersList onEdit={handleEdit} refreshKey={refreshKey} />
                </TabsContent>
                <TabsContent value="categories">
                  <CategoryManager />
                </TabsContent>
              </Tabs>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSupplier ? "Editar Proveedor" : "Nuevo Proveedor"}
            </DialogTitle>
          </DialogHeader>
          <SupplierForm
            supplier={editingSupplier}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

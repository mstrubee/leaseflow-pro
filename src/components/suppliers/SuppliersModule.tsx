import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Building2, Settings, Upload, Download } from "lucide-react";
import { SupplierForm } from "./SupplierForm";
import { SuppliersList } from "./SuppliersList";
import { SupplierBulkUpload } from "./SupplierBulkUpload";
import { CategoryManager } from "./CategoryManager";
import { SupplierCategoryView } from "./SupplierCategoryView";
import { Supplier } from "./types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { generateSupplierTemplate } from "@/lib/generateSupplierTemplate";

type DialogMode = "form" | "bulk";

export const SuppliersModule = () => {
  const [showDialog, setShowDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>("form");
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setDialogMode("form");
    setShowDialog(true);
  };

  const handleNewSupplier = () => {
    setEditingSupplier(null);
    setDialogMode("form");
    setShowDialog(true);
  };

  const handleSave = () => {
    setShowDialog(false);
    setEditingSupplier(null);
    setRefreshKey(prev => prev + 1);
  };

  const handleCancel = () => {
    setShowDialog(false);
    setEditingSupplier(null);
  };

  const handleBulkUploadComplete = () => {
    setShowDialog(false);
    setRefreshKey(prev => prev + 1);
  };

  const switchToBulkUpload = () => {
    setDialogMode("bulk");
  };

  const switchToForm = () => {
    setDialogMode("form");
  };

  return (
    <>
      <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Proveedores</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => generateSupplierTemplate()}
              >
                <Download className="h-4 w-4 mr-1" />
                Descargar Plantilla
              </Button>
              <Button
                size="sm"
                onClick={() => handleNewSupplier()}
              >
                <Plus className="h-4 w-4 mr-1" />
                Nuevo Proveedor
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <Tabs defaultValue="list">
              <TabsList className="mb-4">
                <TabsTrigger value="list">Listado</TabsTrigger>
                <TabsTrigger value="categories" className="gap-1">
                  <Settings className="h-3 w-3" />
                  Rubros
                </TabsTrigger>
                <TabsTrigger value="service-type">Categoría</TabsTrigger>
              </TabsList>
              <TabsContent value="list">
                <SuppliersList onEdit={handleEdit} refreshKey={refreshKey} />
              </TabsContent>
              <TabsContent value="categories">
                <CategoryManager />
              </TabsContent>
              <TabsContent value="service-type">
                <SupplierCategoryView refreshKey={refreshKey} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "bulk" 
                ? "Carga Masiva de Proveedores" 
                : editingSupplier 
                  ? "Editar Proveedor" 
                  : "Nuevo Proveedor"}
            </DialogTitle>
          </DialogHeader>

          {dialogMode === "form" && !editingSupplier && (
            <div className="flex items-center justify-between p-3 mb-4 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Upload className="h-4 w-4" />
                <span>¿Tienes múltiples proveedores?</span>
              </div>
              <Button variant="link" size="sm" onClick={switchToBulkUpload}>
                Cargar desde Excel
              </Button>
            </div>
          )}

          {dialogMode === "bulk" && (
            <div className="flex items-center justify-between p-3 mb-4 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Plus className="h-4 w-4" />
                <span>¿Solo un proveedor?</span>
              </div>
              <Button variant="link" size="sm" onClick={switchToForm}>
                Crear manualmente
              </Button>
            </div>
          )}

          {dialogMode === "form" ? (
            <SupplierForm
              supplier={editingSupplier}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          ) : (
            <SupplierBulkUpload
              onComplete={handleBulkUploadComplete}
              onCancel={handleCancel}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

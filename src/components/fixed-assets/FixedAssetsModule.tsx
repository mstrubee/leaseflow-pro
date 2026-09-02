import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Archive, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SelectableElement } from "@/components/admin/SelectableElement";
import { FixedAssetForm } from "./FixedAssetForm";
import { FixedAssetsList } from "./FixedAssetsList";
import { FixedAssetContractsTab } from "./FixedAssetContractsTab";
import { FixedAsset } from "./types";

export const FixedAssetsModule = () => {
  const [showDialog, setShowDialog] = useState(false);
  const [editingAsset, setEditingAsset] = useState<FixedAsset | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleEdit = (asset: FixedAsset) => {
    setEditingAsset(asset);
    setShowDialog(true);
  };

  const handleNew = () => {
    setEditingAsset(null);
    setShowDialog(true);
  };

  const handleSave = () => {
    setShowDialog(false);
    setEditingAsset(null);
    setRefreshKey((prev) => prev + 1);
  };

  const handleCancel = () => {
    setShowDialog(false);
    setEditingAsset(null);
  };

  return (
    <>
      <SelectableElement elementId="fixed_assets.module" label="Módulo de Activos Fijos">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <div className="flex items-center gap-2">
              <Archive className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Activos Fijos</CardTitle>
            </div>
            <Button size="sm" onClick={handleNew}>
              <Plus className="h-4 w-4 mr-1" />
              Nuevo Activo
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <Tabs defaultValue="inventory">
              <TabsList className="mb-4">
                <TabsTrigger value="inventory" className="gap-1">
                  <Archive className="h-3 w-3" />
                  Inventario
                </TabsTrigger>
                <TabsTrigger value="contracts" className="gap-1">
                  <FileText className="h-3 w-3" />
                  Contratos con activos
                </TabsTrigger>
              </TabsList>
              <TabsContent value="inventory">
                <FixedAssetsList onEdit={handleEdit} refreshKey={refreshKey} />
              </TabsContent>
              <TabsContent value="contracts">
                <FixedAssetContractsTab />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </SelectableElement>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAsset ? "Editar Activo" : "Nuevo Activo"}</DialogTitle>
          </DialogHeader>
          <FixedAssetForm asset={editingAsset} onSave={handleSave} onCancel={handleCancel} />
        </DialogContent>
      </Dialog>
    </>
  );
};

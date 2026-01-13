import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Plus, 
  Edit, 
  Trash2, 
  GitCompare, 
  CheckCircle, 
  Loader2, 
  FileText,
  Copy,
  RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useRenegotiationDrafts, RenegotiationDraft } from "@/hooks/useRenegotiationDrafts";
import { RenegotiationDraftForm } from "./RenegotiationDraftForm";
import { RenegotiationCompareDialog } from "./RenegotiationCompareDialog";

interface CurrentVersion {
  id: string;
  version_number: number;
  initial_rent: number | null;
  regime_rent: number;
  variable_rent_percentage: number | null;
  duration_months: number;
  notice_type: string;
  notice_value: string;
  effective_date: string | null;
  guarantee_multiplier?: number | null;
  has_periodic_adjustments?: boolean | null;
  first_adjustment_month?: number | null;
  adjustment_periodicity_months?: number | null;
  adjustment_type?: string | null;
  adjustment_value?: number | null;
  gastos_comunes_methodology?: string | null;
  gastos_comunes_uf_m2?: number | null;
  gastos_comunes_percentage?: number | null;
  gastos_comunes_total_centro?: number | null;
  fondo_promocion_percentage?: number | null;
  grace_months?: number | null;
  notice_bilaterality?: string | null;
  otros_egresos_amount?: number | null;
  otros_egresos_description?: string | null;
  rent_escalations?: Array<{ id: string; month_number: number; amount: number }>;
}

interface RenegotiationDraftsPanelProps {
  contractId: string;
  currentVersion: CurrentVersion;
  onSuccess: () => void;
}

export function RenegotiationDraftsPanel({
  contractId,
  currentVersion,
  onSuccess,
}: RenegotiationDraftsPanelProps) {
  const {
    drafts,
    loading,
    loadDrafts,
    createDraft,
    updateDraft,
    deleteDraft,
    updateDraftEscalations,
    acceptDraft,
  } = useRenegotiationDrafts(contractId);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingDraft, setEditingDraft] = useState<RenegotiationDraft | null>(null);
  const [saving, setSaving] = useState(false);

  // Create dialog state
  const [newDraftName, setNewDraftName] = useState("");
  const [sourceType, setSourceType] = useState<"current" | "draft" | "scratch">("scratch");
  const [sourceDraftId, setSourceDraftId] = useState<string>("");

  // Compare state
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [includeCurrentInCompare, setIncludeCurrentInCompare] = useState(true);

  // Accept state
  const [showAcceptConfirm1, setShowAcceptConfirm1] = useState(false);
  const [showAcceptConfirm2, setShowAcceptConfirm2] = useState(false);
  const [selectedDraftForAccept, setSelectedDraftForAccept] = useState<string>("");
  const [accepting, setAccepting] = useState(false);

  // Delete state
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  const handleCreateDraft = async () => {
    if (!newDraftName.trim()) return;

    setSaving(true);
    try {
      await createDraft(
        {
          contract_id: contractId,
          name: newDraftName,
          source_type: sourceType,
          source_draft_id: sourceType === "draft" ? sourceDraftId : undefined,
        },
        currentVersion
      );
      setShowCreateDialog(false);
      setNewDraftName("");
      setSourceType("scratch");
      setSourceDraftId("");
    } catch (error) {
      // Error handled in hook
    } finally {
      setSaving(false);
    }
  };

  const handleEditDraft = (draft: RenegotiationDraft) => {
    setEditingDraft(draft);
    setShowEditForm(true);
  };

  const handleSaveDraft = async (data: Partial<RenegotiationDraft>, escalations: Array<{ month_number: number; amount: number }>) => {
    if (!editingDraft) return;

    setSaving(true);
    try {
      await updateDraft(editingDraft.id, data);
      await updateDraftEscalations(editingDraft.id, escalations);
      setShowEditForm(false);
      setEditingDraft(null);
    } catch (error) {
      // Error handled in hook
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDraft = async (draftId: string) => {
    try {
      await deleteDraft(draftId);
      setDeletingDraftId(null);
    } catch (error) {
      // Error handled in hook
    }
  };

  const handleCompare = () => {
    if (selectedForCompare.length === 0 && !includeCurrentInCompare) return;
    setShowCompareDialog(true);
  };

  const getCompareItems = () => {
    const items: any[] = [];
    
    if (includeCurrentInCompare) {
      items.push({
        type: "current",
        id: "current",
        name: `Versión Actual (v${currentVersion.version_number})`,
        data: currentVersion,
        escalations: currentVersion.rent_escalations,
      });
    }

    selectedForCompare.forEach(draftId => {
      const draft = drafts.find(d => d.id === draftId);
      if (draft) {
        items.push({
          type: "draft",
          id: draft.id,
          name: draft.name,
          data: draft,
          escalations: draft.escalations,
        });
      }
    });

    return items;
  };

  const handleAcceptDraft = async () => {
    if (!selectedDraftForAccept) return;

    setAccepting(true);
    try {
      await acceptDraft(selectedDraftForAccept, currentVersion.id);
      setShowAcceptConfirm2(false);
      setSelectedDraftForAccept("");
      onSuccess();
    } catch (error) {
      // Error handled in hook
    } finally {
      setAccepting(false);
    }
  };

  const toggleDraftSelection = (draftId: string) => {
    setSelectedForCompare(prev => 
      prev.includes(draftId) 
        ? prev.filter(id => id !== draftId)
        : [...prev, draftId]
    );
  };

  const formatCurrency = (amount: number) => {
    return `UF ${amount.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Borradores de Renegociación</h3>
          <p className="text-sm text-muted-foreground">
            Crea y compara diferentes propuestas de renegociación
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nuevo Borrador
        </Button>
      </div>

      {/* Action bar */}
      {drafts.length > 0 && (
        <Card className="bg-muted/50">
          <CardContent className="py-3">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="includeCurrentInCompare"
                  checked={includeCurrentInCompare}
                  onCheckedChange={(checked) => setIncludeCurrentInCompare(checked as boolean)}
                />
                <label htmlFor="includeCurrentInCompare" className="text-sm">
                  Incluir versión actual
                </label>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleCompare}
                disabled={selectedForCompare.length === 0 && !includeCurrentInCompare}
                className="gap-2"
              >
                <GitCompare className="h-4 w-4" />
                Comparar ({selectedForCompare.length + (includeCurrentInCompare ? 1 : 0)})
              </Button>

              <div className="flex-1" />

              <div className="flex items-center gap-2">
                <Select
                  value={selectedDraftForAccept}
                  onValueChange={setSelectedDraftForAccept}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Seleccionar borrador" />
                  </SelectTrigger>
                  <SelectContent>
                    {drafts.map((draft) => (
                      <SelectItem key={draft.id} value={draft.id}>
                        {draft.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setShowAcceptConfirm1(true)}
                  disabled={!selectedDraftForAccept}
                  className="gap-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  Aceptar Renegociación
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Drafts list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : drafts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              No hay borradores de renegociación. Crea uno para comenzar.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {drafts.map((draft) => (
            <Card key={draft.id} className={selectedForCompare.includes(draft.id) ? "ring-2 ring-primary" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedForCompare.includes(draft.id)}
                      onCheckedChange={() => toggleDraftSelection(draft.id)}
                    />
                    <div>
                      <CardTitle className="text-base">{draft.name}</CardTitle>
                      <CardDescription className="text-xs">
                        Creado {format(new Date(draft.created_at), "dd MMM yyyy, HH:mm", { locale: es })}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEditDraft(draft)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeletingDraftId(draft.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Canon Régimen:</span>
                    <span className="ml-2 font-medium">{formatCurrency(draft.regime_rent)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Duración:</span>
                    <span className="ml-2 font-medium">{draft.duration_months} meses</span>
                  </div>
                  {draft.escalations && draft.escalations.length > 0 && (
                    <div className="col-span-2">
                      <Badge variant="secondary" className="text-xs">
                        {draft.escalations.length} escalonamiento(s)
                      </Badge>
                    </div>
                  )}
                </div>
                {draft.source_type !== "scratch" && (
                  <div className="mt-2 pt-2 border-t">
                    <Badge variant="outline" className="text-xs">
                      <Copy className="h-3 w-3 mr-1" />
                      Basado en {draft.source_type === "current" ? "versión actual" : "otro borrador"}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Draft Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Borrador de Renegociación</DialogTitle>
            <DialogDescription>
              Crea un nuevo borrador basándote en las condiciones actuales, otro borrador, o desde cero.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre del Borrador</Label>
              <Input
                value={newDraftName}
                onChange={(e) => setNewDraftName(e.target.value)}
                placeholder="Ej: Propuesta 1 - Aumento 10%"
              />
            </div>

            <div className="space-y-2">
              <Label>Plantilla Base</Label>
              <Select value={sourceType} onValueChange={(v) => setSourceType(v as "current" | "draft" | "scratch")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scratch">
                    <div className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Desde cero
                    </div>
                  </SelectItem>
                  <SelectItem value="current">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4" />
                      Copiar condiciones actuales
                    </div>
                  </SelectItem>
                  {drafts.length > 0 && (
                    <SelectItem value="draft">
                      <div className="flex items-center gap-2">
                        <Copy className="h-4 w-4" />
                        Copiar de otro borrador
                      </div>
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {sourceType === "draft" && (
              <div className="space-y-2">
                <Label>Seleccionar Borrador</Label>
                <Select value={sourceDraftId} onValueChange={setSourceDraftId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar borrador..." />
                  </SelectTrigger>
                  <SelectContent>
                    {drafts.map((draft) => (
                      <SelectItem key={draft.id} value={draft.id}>
                        {draft.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreateDraft}
              disabled={saving || !newDraftName.trim() || (sourceType === "draft" && !sourceDraftId)}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creando...
                </>
              ) : (
                "Crear Borrador"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Draft Form */}
      <RenegotiationDraftForm
        open={showEditForm}
        onOpenChange={setShowEditForm}
        draft={editingDraft}
        onSave={handleSaveDraft}
        saving={saving}
      />

      {/* Compare Dialog */}
      <RenegotiationCompareDialog
        open={showCompareDialog}
        onOpenChange={setShowCompareDialog}
        items={getCompareItems()}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingDraftId} onOpenChange={() => setDeletingDraftId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar borrador?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El borrador será eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingDraftId && handleDeleteDraft(deletingDraftId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Accept Confirmation 1 */}
      <AlertDialog open={showAcceptConfirm1} onOpenChange={setShowAcceptConfirm1}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Aceptar esta renegociación?</AlertDialogTitle>
            <AlertDialogDescription>
              Se creará una nueva versión del contrato con las condiciones del borrador seleccionado.
              Los demás borradores serán eliminados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowAcceptConfirm1(false);
                setShowAcceptConfirm2(true);
              }}
            >
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Accept Confirmation 2 */}
      <AlertDialog open={showAcceptConfirm2} onOpenChange={setShowAcceptConfirm2}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Aceptación de Renegociación</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción creará una nueva versión del contrato en estado de renegociación.
              ¿Estás seguro de que deseas continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={accepting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAcceptDraft}
              disabled={accepting}
            >
              {accepting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Procesando...
                </>
              ) : (
                "Confirmar Aceptación"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

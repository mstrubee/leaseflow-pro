import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, MoreVertical, AlertTriangle, Clock, XCircle, CheckCircle, Upload, FileText, Pencil } from "lucide-react";

interface ContractStatusActionsProps {
  contractId: string;
  contractName: string;
  currentStatus: string;
  isExpiredButOperating: boolean;
  requiresSpecialAttention?: boolean;
  specialAttentionReason?: string | null;
  onStatusChange: () => void;
}

export function ContractStatusActions({
  contractId,
  contractName,
  currentStatus,
  isExpiredButOperating,
  requiresSpecialAttention = false,
  specialAttentionReason = null,
  onStatusChange,
}: ContractStatusActionsProps) {
  const [loading, setLoading] = useState(false);
  const [showExpireDialog, setShowExpireDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [keepInVigentes, setKeepInVigentes] = useState(true);
  const [finiquitoUrl, setFiniquitoUrl] = useState("");
  const [showFiniquitoWarning, setShowFiniquitoWarning] = useState(false);
  const [showSpecialAttentionDialog, setShowSpecialAttentionDialog] = useState(false);
  const [specialAttentionDescription, setSpecialAttentionDescription] = useState(specialAttentionReason || "");

  const handleMarkAsExpired = async () => {
    // Check if finiquito is attached
    if (!finiquitoUrl.trim()) {
      setShowExpireDialog(false);
      setShowFiniquitoWarning(true);
      return;
    }

    await processExpiration(false);
  };

  const handleExpireWithoutFiniquito = async () => {
    await processExpiration(true);
  };

  const processExpiration = async (createFiniquitoAlert: boolean) => {
    setLoading(true);
    try {
      const updateData: any = {
        status: "vencido",
        is_expired_but_operating: keepInVigentes,
      };

      const { error } = await supabase
        .from("contracts")
        .update(updateData)
        .eq("id", contractId);

      if (error) throw error;

      // If finiquito URL is provided, save it to repository
      if (finiquitoUrl.trim()) {
        // Get or create the finiquitos folder
        const { data: existingFolder } = await supabase
          .from("repository_folders")
          .select("id")
          .eq("contract_id", contractId)
          .eq("folder_type", "finiquitos")
          .maybeSingle();

        let folderId = existingFolder?.id;

        if (!folderId) {
          const { data: parentFolder } = await supabase
            .from("repository_folders")
            .select("id")
            .eq("contract_id", contractId)
            .eq("is_base_folder", true)
            .maybeSingle();

          if (parentFolder) {
            const { data: newFolder } = await supabase
              .from("repository_folders")
              .insert({
                contract_id: contractId,
                name: "Finiquitos",
                folder_type: "finiquitos",
                parent_id: parentFolder.id,
              })
              .select()
              .single();

            folderId = newFolder?.id;
          }
        }

        if (folderId) {
          await supabase
            .from("repository_files")
            .insert({
              folder_id: folderId,
              name: `Finiquito_${new Date().toISOString().split('T')[0]}`,
              url: finiquitoUrl,
              file_type: "pdf",
            });
        }
      }

      // Create finiquito alert if no finiquito was provided
      if (createFiniquitoAlert) {
        const { error: alertError } = await supabase
          .from("alerts")
          .insert({
            contract_id: contractId,
            title: `⚠️ FINIQUITO PENDIENTE: ${contractName}`,
            message: "Este contrato fue marcado como vencido sin adjuntar finiquito. Por favor, adjunte el documento de finiquito.",
            alert_type: "other",
            alert_subtype: "finiquito_pendiente",
            due_date: new Date().toISOString().split('T')[0],
            days_before: [0],
            channels: ["email"],
            is_active: true,
            priority: 100, // High priority for finiquito alerts
          });

        if (alertError) {
          console.error("Error creating finiquito alert:", alertError);
        }
      }

      toast.success("Contrato marcado como vencido", {
        description: keepInVigentes 
          ? "El contrato se mantiene en el listado de vigentes con marcador de VENCIDO" 
          : "El contrato se movió al listado de contratos vencidos"
      });
      
      onStatusChange();
    } catch (error: any) {
      toast.error("Error al actualizar estado", { description: error.message });
    } finally {
      setLoading(false);
      setShowExpireDialog(false);
      setShowFiniquitoWarning(false);
      setFiniquitoUrl("");
    }
  };

  const handleMarkAsClosed = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("contracts")
        .update({
          is_expired_but_operating: false,
          operation_status: "cerrado",
        })
        .eq("id", contractId);

      if (error) throw error;

      toast.success("Contrato cerrado", {
        description: "El contrato ha sido cerrado y movido al listado de vencidos"
      });
      
      onStatusChange();
    } catch (error: any) {
      toast.error("Error al cerrar contrato", { description: error.message });
    } finally {
      setLoading(false);
      setShowCloseConfirm(false);
      setShowCloseDialog(false);
    }
  };

  const handleReactivate = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("contracts")
        .update({
          status: "firmado",
          is_expired_but_operating: false,
        })
        .eq("id", contractId);

      if (error) throw error;

      toast.success("Contrato reactivado", {
        description: "El contrato vuelve a estar vigente"
      });
      
      onStatusChange();
    } catch (error: any) {
      toast.error("Error al reactivar contrato", { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSpecialAttentionDialog = () => {
    setSpecialAttentionDescription(specialAttentionReason || "");
    setShowSpecialAttentionDialog(true);
  };

  const handleSaveSpecialAttention = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("contracts")
        .update({
          requires_special_attention: true,
          special_attention_reason: specialAttentionDescription.trim() || null,
        })
        .eq("id", contractId);

      if (error) throw error;

      toast.success("Marcado como Atención Especial", {
        description: "El contrato requiere atención especial"
      });
      
      setShowSpecialAttentionDialog(false);
      onStatusChange();
    } catch (error: any) {
      toast.error("Error al actualizar estado", { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveSpecialAttention = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("contracts")
        .update({
          requires_special_attention: false,
          special_attention_reason: null,
        })
        .eq("id", contractId);

      if (error) throw error;

      toast.success("Marcado como Vigente", {
        description: "El contrato vuelve a estado vigente normal"
      });
      
      onStatusChange();
    } catch (error: any) {
      toast.error("Error al actualizar estado", { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  // For signed/active contracts
  if (currentStatus === "firmado") {
    return (
      <>
        <div className="flex items-center gap-2">
          {requiresSpecialAttention && (
            <Badge variant="outline" className="gap-1 border-orange-400 text-orange-600 bg-orange-50">
              <AlertTriangle className="h-3 w-3" />
              Atención Especial
            </Badge>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreVertical className="h-4 w-4 mr-2" />
                Estado
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowExpireDialog(true)}>
                <Clock className="h-4 w-4 mr-2" />
                Marcar como Vencido
              </DropdownMenuItem>
              {!requiresSpecialAttention && (
                <DropdownMenuItem onClick={handleOpenSpecialAttentionDialog}>
                  <AlertTriangle className="h-4 w-4 mr-2 text-orange-500" />
                  Atención Especial
                </DropdownMenuItem>
              )}
              {requiresSpecialAttention && (
                <>
                  <DropdownMenuItem onClick={handleOpenSpecialAttentionDialog}>
                    <Pencil className="h-4 w-4 mr-2 text-orange-500" />
                    Editar Descripción
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleRemoveSpecialAttention}>
                    <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                    Vigente
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <AlertDialog open={showExpireDialog} onOpenChange={setShowExpireDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Marcar contrato como vencido
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-4">
                  <p>
                    ¿Desea marcar el contrato <strong>"{contractName}"</strong> como vencido?
                  </p>
                  
                  <div className="space-y-2">
                    <Label htmlFor="finiquitoUrl" className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      URL del Finiquito (opcional)
                    </Label>
                    <Input
                      id="finiquitoUrl"
                      placeholder="https://drive.google.com/..."
                      value={finiquitoUrl}
                      onChange={(e) => setFiniquitoUrl(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Adjunte el link al documento de finiquito del contrato
                    </p>
                  </div>

                  <div className="flex items-center space-x-2 bg-muted p-3 rounded-lg">
                    <Checkbox
                      id="keepInVigentes"
                      checked={keepInVigentes}
                      onCheckedChange={(checked) => setKeepInVigentes(checked as boolean)}
                    />
                    <Label htmlFor="keepInVigentes" className="text-sm cursor-pointer">
                      Mantener en listado de Vigentes (el contrato sigue operando)
                    </Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {keepInVigentes 
                      ? "El contrato aparecerá en Vigentes con un marcador de VENCIDO"
                      : "El contrato se moverá al listado de Contratos Vencidos"}
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleMarkAsExpired} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Confirmar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={showFiniquitoWarning} onOpenChange={setShowFiniquitoWarning}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
                Finiquito no adjuntado
              </AlertDialogTitle>
              <AlertDialogDescription>
                <p className="mb-4">
                  No ha adjuntado un documento de finiquito para el contrato <strong>"{contractName}"</strong>.
                </p>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                  <p>
                    <strong>Importante:</strong> Se marcará como vencido, pero se creará un aviso prioritario 
                    para entregar el finiquito del contrato. Este aviso aparecerá en la parte superior del listado.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setShowFiniquitoWarning(false);
                setShowExpireDialog(true);
              }}>
                Volver a adjuntar
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleExpireWithoutFiniquito} 
                disabled={loading}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Continuar sin finiquito
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={showSpecialAttentionDialog} onOpenChange={setShowSpecialAttentionDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Atención Especial
              </DialogTitle>
              <DialogDescription>
                Ingrese una descripción para este estado de atención especial (máximo 200 caracteres).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="specialAttentionReason">Descripción</Label>
              <Textarea
                id="specialAttentionReason"
                placeholder="Describa el motivo de atención especial..."
                value={specialAttentionDescription}
                onChange={(e) => setSpecialAttentionDescription(e.target.value.slice(0, 200))}
                maxLength={200}
                rows={3}
              />
              <p className="text-xs text-muted-foreground text-right">
                {specialAttentionDescription.length}/200 caracteres
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSpecialAttentionDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveSpecialAttention} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // For expired contracts that are still operating (showing in vigentes list)
  if (currentStatus === "vencido" && isExpiredButOperating) {
    return (
      <>
        <div className="flex items-center gap-2">
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            VENCIDO
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreVertical className="h-4 w-4 mr-2" />
                Estado
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleReactivate}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Reactivar Contrato
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => setShowCloseDialog(true)}
                className="text-destructive"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Cerrar Contrato
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <AlertDialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Cerrar este contrato?</AlertDialogTitle>
              <AlertDialogDescription>
                Al cerrar el contrato <strong>"{contractName}"</strong>, este será removido del listado de Vigentes 
                y pasará definitivamente al listado de Contratos Vencidos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => {
                  setShowCloseDialog(false);
                  setShowCloseConfirm(true);
                }}
                className="bg-destructive hover:bg-destructive/90"
              >
                Continuar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Confirmar cierre definitivo
              </AlertDialogTitle>
              <AlertDialogDescription>
                <p className="mb-4">
                  Esta acción moverá el contrato <strong>"{contractName}"</strong> al listado de Vencidos 
                  de forma permanente.
                </p>
                <p className="text-sm">
                  El contrato y todas sus características se conservarán en el listado de contratos vencidos.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleMarkAsClosed}
                disabled={loading}
                className="bg-destructive hover:bg-destructive/90"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Cerrar Definitivamente
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // For fully expired contracts
  if (currentStatus === "vencido") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <MoreVertical className="h-4 w-4 mr-2" />
            Estado
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleReactivate}>
            <CheckCircle className="h-4 w-4 mr-2" />
            Reactivar Contrato
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return null;
}

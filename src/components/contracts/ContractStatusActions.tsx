import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, MoreVertical, AlertTriangle, Clock, XCircle, CheckCircle } from "lucide-react";

interface ContractStatusActionsProps {
  contractId: string;
  contractName: string;
  currentStatus: string;
  isExpiredButOperating: boolean;
  onStatusChange: () => void;
}

export function ContractStatusActions({
  contractId,
  contractName,
  currentStatus,
  isExpiredButOperating,
  onStatusChange,
}: ContractStatusActionsProps) {
  const [loading, setLoading] = useState(false);
  const [showExpireDialog, setShowExpireDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [keepInVigentes, setKeepInVigentes] = useState(true);

  const handleMarkAsExpired = async () => {
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

  // For signed/active contracts
  if (currentStatus === "firmado") {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <MoreVertical className="h-4 w-4 mr-2" />
              Acciones
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShowExpireDialog(true)}>
              <Clock className="h-4 w-4 mr-2" />
              Marcar como Vencido
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

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
                Acciones
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
            Acciones
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

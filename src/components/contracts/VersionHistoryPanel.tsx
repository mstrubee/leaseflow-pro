import { useState, useRef } from "react";
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
  History,
  GitCompare,
  CheckCircle,
  Loader2,
  Trash2,
  Upload,
  FileText
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RenegotiationCompareDialog } from "./RenegotiationCompareDialog";
import { validateFile, sanitizeFileName } from "@/lib/fileValidation";

interface ContractVersion {
  id: string;
  version_number: number;
  is_current: boolean;
  is_renegotiation: boolean;
  initial_rent: number | null;
  regime_rent: number;
  variable_rent_percentage: number | null;
  duration_months: number;
  notice_type: string;
  notice_value: string;
  effective_date: string | null;
  created_at: string;
  guarantee_multiplier?: number | null;
  has_periodic_adjustments?: boolean | null;
  first_adjustment_month?: number | null;
  adjustment_periodicity_months?: number | null;
  adjustment_type?: string | null;
  adjustment_value?: number | null;
  gastos_comunes_methodology?: string | null;
  gastos_comunes_uf_m2?: number | null;
  gastos_comunes_uf_ml_frente?: number | null;
  gastos_comunes_prorrata_kwh_clima?: number | null;
  gastos_comunes_percentage?: number | null;
  gastos_comunes_total_centro?: number | null;
  gastos_comunes_tope?: number | null;
  gastos_comunes_tope_type?: string | null;
  has_extended_gastos_comunes?: boolean | null;
  adicional_administracion_percentage?: number | null;
  fondo_promocion_percentage?: number | null;
  grace_months?: number | null;
  notice_bilaterality?: string | null;
  otros_egresos_amount?: number | null;
  otros_egresos_description?: string | null;
  rent_escalations?: Array<{ id: string; month_number: number; amount: number }>;
}

interface VersionHistoryPanelProps {
  contractId: string;
  contractName: string;
  versions: ContractVersion[];
  signedVersionId: string | null; // ID of the signed/active contract version
  onDeleteRenegotiation: (versionId: string) => Promise<void>;
  onAcceptRenegotiation: (versionId: string, documentUrl: string) => Promise<void>;
  onRefresh: () => void;
}

export function VersionHistoryPanel({
  contractId,
  contractName,
  versions,
  signedVersionId,
  onDeleteRenegotiation,
  onAcceptRenegotiation,
  onRefresh,
}: VersionHistoryPanelProps) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compare state
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [showCompareDialog, setShowCompareDialog] = useState(false);

  // Delete state
  const [showDeleteConfirm1, setShowDeleteConfirm1] = useState(false);
  const [showDeleteConfirm2, setShowDeleteConfirm2] = useState(false);
  const [deletingVersionId, setDeletingVersionId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Accept renegotiation state
  const [showAcceptConfirm1, setShowAcceptConfirm1] = useState(false);
  const [showAcceptConfirm2, setShowAcceptConfirm2] = useState(false);
  const [selectedVersionForAccept, setSelectedVersionForAccept] = useState<string>("");
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const formatCurrency = (amount: number) => {
    return `UF ${amount.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (date: string) => {
    return format(new Date(date), "d 'de' MMMM 'de' yyyy", { locale: es });
  };

  const toggleVersionSelection = (versionId: string) => {
    setSelectedForCompare(prev =>
      prev.includes(versionId)
        ? prev.filter(id => id !== versionId)
        : [...prev, versionId]
    );
  };

  const handleCompare = () => {
    if (selectedForCompare.length < 2) {
      toast.error("Selecciona al menos 2 versiones para comparar");
      return;
    }
    setShowCompareDialog(true);
  };

  const getCompareItems = () => {
    return selectedForCompare.map(versionId => {
      const version = versions.find(v => v.id === versionId);
      if (!version) return null;
      
      const isSignedVersion = version.id === signedVersionId;
      return {
        type: isSignedVersion ? "current" as const : "draft" as const,
        id: version.id,
        name: `Versión ${version.version_number}${isSignedVersion ? " (Vigente)" : version.is_renegotiation ? " (Renegociación)" : ""}`,
        data: version,
        escalations: version.rent_escalations,
      };
    }).filter(Boolean);
  };

  const handleStartDelete = (versionId: string) => {
    setDeletingVersionId(versionId);
    setShowDeleteConfirm1(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingVersionId) return;
    
    setDeleting(true);
    try {
      await onDeleteRenegotiation(deletingVersionId);
      setShowDeleteConfirm2(false);
      setDeletingVersionId(null);
    } catch (error) {
      console.error("Error deleting renegotiation:", error);
    } finally {
      setDeleting(false);
    }
  };

  const handleStartAccept = (versionId: string) => {
    setSelectedVersionForAccept(versionId);
    setShowAcceptConfirm1(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validation = validateFile(file);
      if (!validation.isValid) {
        toast.error(validation.error);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        return;
      }
      setSelectedFile(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleAcceptWithUpload = async () => {
    if (!selectedVersionForAccept || !selectedFile) return;

    setUploading(true);
    try {
      const ext = selectedFile.name.split('.').pop() || '';
      const today = format(new Date(), "yyyy.MM.dd");
      const sanitizedName = sanitizeFileName(`${today} ${contractName} Renegociación`);
      const filePath = `contracts/${contractId}/${Date.now()}_${sanitizedName}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("repository-files")
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      const storagePath = `storage://repository-files/${filePath}`;
      
      await onAcceptRenegotiation(selectedVersionForAccept, storagePath);
      
      toast.success("Renegociación aceptada y documento subido exitosamente");
      setShowUploadDialog(false);
      setSelectedFile(null);
      setSelectedVersionForAccept("");
      onRefresh();
    } catch (error: any) {
      toast.error("Error al procesar la renegociación: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  // Get the renegotiation versions (not the signed one)
  const renegotiationVersions = versions.filter(v => v.is_renegotiation && v.is_current);

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Historial de Versiones
        </CardTitle>
        <CardDescription>
          Este contrato tiene {versions.length} versiones. Selecciona versiones para comparar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Action bar */}
        <div className="flex items-center gap-4 flex-wrap p-3 bg-muted/50 rounded-lg">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCompare}
            disabled={selectedForCompare.length < 2}
            className="gap-2"
          >
            <GitCompare className="h-4 w-4" />
            Comparar ({selectedForCompare.length})
          </Button>

          <div className="flex-1" />

          {renegotiationVersions.length > 0 && (
            <div className="flex items-center gap-2">
              <Select
                value={selectedVersionForAccept}
                onValueChange={setSelectedVersionForAccept}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Seleccionar renegociación" />
                </SelectTrigger>
                <SelectContent>
                  {renegotiationVersions.map((version) => (
                    <SelectItem key={version.id} value={version.id}>
                      Versión {version.version_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="default"
                size="sm"
                onClick={() => handleStartAccept(selectedVersionForAccept)}
                disabled={!selectedVersionForAccept}
                className="gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                Aceptar Renegociación
              </Button>
            </div>
          )}
        </div>

        {/* Versions list */}
        <div className="space-y-3">
          {versions.map((version) => {
            const isSignedVersion = version.id === signedVersionId;
            const isActiveRenegotiation = version.is_renegotiation && version.is_current;

            return (
              <div
                key={version.id}
                className={`p-4 rounded-lg border transition-colors ${
                  selectedForCompare.includes(version.id) ? "ring-2 ring-primary" : ""
                } ${
                  isSignedVersion
                    ? "border-primary bg-primary/5"
                    : isActiveRenegotiation
                    ? "border-amber-500/50 bg-amber-500/5"
                    : "border-border bg-muted/30"
                } ${isActiveRenegotiation ? "cursor-pointer hover:bg-amber-500/10" : ""}`}
                onClick={() => {
                  if (isActiveRenegotiation) {
                    navigate(`/contracts/${contractId}/edit`);
                  }
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedForCompare.includes(version.id)}
                      onCheckedChange={() => toggleVersionSelection(version.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Versión {version.version_number}</span>
                        {isSignedVersion && (
                          <Badge variant="default">Vigente</Badge>
                        )}
                        {version.is_renegotiation && (
                          <Badge variant="secondary">Renegociación</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Canon: {formatCurrency(version.regime_rent)} · {version.duration_months} meses
                        {version.variable_rent_percentage && ` · Variable: ${version.variable_rent_percentage}%`}
                      </div>
                      {version.effective_date && (
                        <div className="text-sm text-muted-foreground">
                          Vigente desde: {formatDate(version.effective_date)}
                        </div>
                      )}
                      {isActiveRenegotiation && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1 mt-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartDelete(version.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                          Eliminar Renegociación
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(version.created_at)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>

      {/* Compare Dialog */}
      <RenegotiationCompareDialog
        open={showCompareDialog}
        onOpenChange={setShowCompareDialog}
        items={getCompareItems()}
        contractName={contractName}
      />

      {/* Delete Confirmation 1 */}
      <AlertDialog open={showDeleteConfirm1} onOpenChange={setShowDeleteConfirm1}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la renegociación?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará la renegociación en curso y todos sus documentos asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowDeleteConfirm1(false);
                setShowDeleteConfirm2(true);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation 2 */}
      <AlertDialog open={showDeleteConfirm2} onOpenChange={setShowDeleteConfirm2}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Eliminación de Renegociación</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro? Esta acción no se puede deshacer. Se eliminarán todos los borradores de la renegociación.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                "Eliminar Definitivamente"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Accept Confirmation 1 */}
      <AlertDialog open={showAcceptConfirm1} onOpenChange={setShowAcceptConfirm1}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Aceptar la renegociación?</AlertDialogTitle>
            <AlertDialogDescription>
              Al aceptar, las condiciones comerciales se actualizarán a las de esta versión.
              Se conservará el historial de versiones anteriores.
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
              ¿Estás seguro de que deseas aceptar esta renegociación? 
              Se te pedirá subir el documento del nuevo contrato o extensión.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowAcceptConfirm2(false);
                setShowUploadDialog(true);
              }}
            >
              Confirmar y Subir Documento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Upload Document Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subir Documento de Renegociación</DialogTitle>
            <DialogDescription>
              Sube el documento del nuevo contrato o extensión. Este documento seguirá el mismo flujo que los contratos anteriores (marcar como firmado, enviar para firma, etc.)
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Seleccionar archivo</Label>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                  accept=".pdf,.doc,.docx"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full gap-2"
                >
                  <Upload className="h-4 w-4" />
                  {selectedFile ? selectedFile.name : "Seleccionar archivo"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Formatos aceptados: PDF, Word
              </p>
            </div>

            {selectedFile && (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm">{selectedFile.name}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAcceptWithUpload}
              disabled={!selectedFile || uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Procesando...
                </>
              ) : (
                "Aceptar Renegociación"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

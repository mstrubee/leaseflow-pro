import { usePermissionSelection, PermissionLevel } from "@/contexts/PermissionSelectionContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, X, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  none: "Sin acceso",
  view: "Ver",
  edit: "Editar",
};

export const FloatingPermissionSelector = () => {
  const { 
    isSelecting, 
    selectedElements, 
    setElementPermission, 
    removeElementPermission,
    confirmSelection, 
    cancelSelection, 
    pendingUserData 
  } = usePermissionSelection();
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(true);

  if (!isSelecting) return null;

  const handleConfirm = () => {
    confirmSelection();
    navigate("/admin?completeUser=true");
  };

  const handleCancel = () => {
    cancelSelection();
    navigate("/admin");
  };

  const selectedCount = Object.keys(selectedElements).length;
  const elements = Object.values(selectedElements);

  return (
    <div className="fixed bottom-4 left-4 z-50 w-96">
      <Card className="shadow-2xl border-primary/20 bg-card/95 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              Modo Selección de Permisos
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
          {pendingUserData && (
            <p className="text-xs text-muted-foreground">
              Usuario: {pendingUserData.email}
            </p>
          )}
          <p className="text-xs text-primary mt-1">
            Haz clic en las Cards/elementos marcados para asignar permisos
          </p>
        </CardHeader>
        
        {isExpanded && (
          <CardContent className="space-y-3">
            {elements.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Navega por la aplicación y haz clic en los elementos para seleccionarlos
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                {elements.map(element => (
                  <div key={element.elementId} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50">
                    <span className="text-sm font-medium truncate flex-1">{element.label}</span>
                    <Select
                      value={element.permission}
                      onValueChange={(v) => setElementPermission(element.elementId, element.label, v as PermissionLevel)}
                    >
                      <SelectTrigger className="w-24 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin acceso</SelectItem>
                        <SelectItem value="view">Ver</SelectItem>
                        <SelectItem value="edit">Editar</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => removeElementPermission(element.elementId)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 border-t flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {selectedCount} elementos seleccionados
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCancel}>
                  <X className="h-4 w-4 mr-1" />
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleConfirm}>
                  <Check className="h-4 w-4 mr-1" />
                  Aceptar
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
};

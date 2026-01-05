import { usePermissionSelection } from "@/contexts/PermissionSelectionContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, X, ChevronDown, ChevronUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

const AVAILABLE_SECTIONS = [
  { id: "dashboard", label: "Dashboard", description: "Panel principal con estadísticas" },
  { id: "contracts", label: "Contratos", description: "Gestión de contratos" },
  { id: "repository", label: "Repositorio", description: "Documentos y archivos" },
  { id: "budget", label: "Presupuesto", description: "Gestión de presupuestos" },
  { id: "gantt", label: "Cronograma Gantt", description: "Planificación de proyectos" },
  { id: "patents", label: "Patentes", description: "Gestión de patentes" },
  { id: "suppliers", label: "Proveedores", description: "Gestión de proveedores" },
  { id: "alerts", label: "Alertas", description: "Sistema de alertas" },
];

export const FloatingPermissionSelector = () => {
  const { isSelecting, selectedSections, toggleSection, confirmSelection, cancelSelection, pendingUserData } = usePermissionSelection();
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

  const selectedCount = Object.values(selectedSections).filter(v => v !== "none").length;

  return (
    <div className="fixed bottom-4 left-4 z-50 w-80">
      <Card className="shadow-2xl border-primary/20 bg-card/95 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              Selección de Permisos
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
        </CardHeader>
        
        {isExpanded && (
          <CardContent className="space-y-3">
            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {AVAILABLE_SECTIONS.map(section => (
                <div key={section.id} className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{section.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{section.description}</p>
                  </div>
                  <Select
                    value={selectedSections[section.id] || "none"}
                    onValueChange={(v) => toggleSection(section.id, v as any)}
                  >
                    <SelectTrigger className="w-24 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin acceso</SelectItem>
                      <SelectItem value="view">Ver</SelectItem>
                      <SelectItem value="edit">Editar</SelectItem>
                      <SelectItem value="all">Todo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {selectedCount} secciones seleccionadas
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

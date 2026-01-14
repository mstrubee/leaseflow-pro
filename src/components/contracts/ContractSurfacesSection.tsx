import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Ruler, Pencil, Check, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SurfaceData {
  superficie_terreno: number;
  superficie_edificada_local: number;
  superficie_showroom: number;
  superficie_bodega_backoffice: number;
  superficie_exterior_cubierto: number;
  superficie_exterior_descubierto: number;
  num_estacionamientos: number;
  metros_lineales_frente: number;
  metros_lineales_frente_2: number;
  superficie_mezanina_altillo: number;
  superficie_segundo_nivel: number;
  es_esquina: boolean;
}

interface ContractSurfacesSectionProps {
  contractId: string;
  readOnly?: boolean;
  onSurfaceChange?: (superficie: number) => void;
}

export const ContractSurfacesSection = ({ contractId, readOnly = false, onSurfaceChange }: ContractSurfacesSectionProps) => {
  const [surfaces, setSurfaces] = useState<SurfaceData>({
    superficie_terreno: 0,
    superficie_edificada_local: 0,
    superficie_showroom: 0,
    superficie_bodega_backoffice: 0,
    superficie_exterior_cubierto: 0,
    superficie_exterior_descubierto: 0,
    num_estacionamientos: 0,
    metros_lineales_frente: 0,
    metros_lineales_frente_2: 0,
    superficie_mezanina_altillo: 0,
    superficie_segundo_nivel: 0,
    es_esquina: false,
  });
  const [originalSurfaces, setOriginalSurfaces] = useState<SurfaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadSurfaces();
  }, [contractId]);

  const loadSurfaces = async () => {
    try {
      const { data, error } = await supabase
        .from("contracts")
        .select("superficie_terreno, superficie_edificada_local, superficie_showroom, superficie_bodega_backoffice, superficie_exterior_cubierto, superficie_exterior_descubierto, num_estacionamientos, metros_lineales_frente, metros_lineales_frente_2, superficie_mezanina_altillo, superficie_segundo_nivel, es_esquina")
        .eq("id", contractId)
        .single();

      if (error) throw error;
      if (data) {
        const loadedSurfaces = {
          superficie_terreno: data.superficie_terreno || 0,
          superficie_edificada_local: data.superficie_edificada_local || 0,
          superficie_showroom: data.superficie_showroom || 0,
          superficie_bodega_backoffice: data.superficie_bodega_backoffice || 0,
          superficie_exterior_cubierto: data.superficie_exterior_cubierto || 0,
          superficie_exterior_descubierto: data.superficie_exterior_descubierto || 0,
          num_estacionamientos: data.num_estacionamientos || 0,
          metros_lineales_frente: data.metros_lineales_frente || 0,
          metros_lineales_frente_2: (data as any).metros_lineales_frente_2 || 0,
          superficie_mezanina_altillo: (data as any).superficie_mezanina_altillo || 0,
          superficie_segundo_nivel: (data as any).superficie_segundo_nivel || 0,
          es_esquina: (data as any).es_esquina || false,
        };
        setSurfaces(loadedSurfaces);
      }
    } catch (error) {
      console.error("Error loading surfaces:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartEditing = () => {
    setOriginalSurfaces({ ...surfaces });
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    if (originalSurfaces) {
      setSurfaces(originalSurfaces);
    }
    setIsEditing(false);
    setOriginalSurfaces(null);
  };

  const handleSaveEditing = async () => {
    try {
      await supabase.from("contracts").update(surfaces).eq("id", contractId);
      toast({ title: "Guardado", description: "Superficies actualizadas correctamente" });
      setIsEditing(false);
      setOriginalSurfaces(null);
      
      if (onSurfaceChange) {
        onSurfaceChange(surfaces.superficie_edificada_local);
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleChange = (field: keyof SurfaceData, value: string) => {
    if (!isEditing) return;
    
    const numValue = parseFloat(value) || 0;
    const newData = { ...surfaces, [field]: numValue };
    
    // Auto-calculate edificada local as sum of showroom + bodega/backoffice
    if (field === "superficie_showroom" || field === "superficie_bodega_backoffice") {
      newData.superficie_edificada_local = (newData.superficie_showroom || 0) + (newData.superficie_bodega_backoffice || 0);
    }
    
    // Auto-calculate exterior descubierto
    if (field !== "superficie_exterior_descubierto" && field !== "superficie_edificada_local") {
      newData.superficie_exterior_descubierto = Math.max(
        0,
        newData.superficie_terreno - newData.superficie_edificada_local - newData.superficie_exterior_cubierto
      );
    }
    
    setSurfaces(newData);
  };

  // Primera fila: 5 columnas
  const fieldsRow1: { key: keyof SurfaceData; label: string; unit: string; calculated?: boolean }[] = [
    { key: "superficie_terreno", label: "Terreno", unit: "m²" },
    { key: "superficie_showroom", label: "Showroom", unit: "m²" },
    { key: "superficie_bodega_backoffice", label: "Bodega & Backoffice", unit: "m²" },
    { key: "superficie_edificada_local", label: "Edificada Local", unit: "m²", calculated: true },
    { key: "superficie_mezanina_altillo", label: "Mezanina / Altillo", unit: "m²" },
  ];

  // Segunda fila: 4 columnas
  const fieldsRow2: { key: keyof SurfaceData; label: string; unit: string; calculated?: boolean }[] = [
    { key: "superficie_segundo_nivel", label: "Segundo Nivel", unit: "m²" },
    { key: "superficie_exterior_cubierto", label: "Exterior Cubierto", unit: "m²" },
    { key: "superficie_exterior_descubierto", label: "Exterior Descubierto", unit: "m²", calculated: true },
    { key: "num_estacionamientos", label: "Estacionamientos", unit: "unid." },
  ];

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Ruler className="h-5 w-5" />
            Superficies y Datos
          </CardTitle>
          {!readOnly && (
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <Button variant="ghost" size="sm" onClick={handleCancelEditing}>
                    <X className="h-4 w-4 mr-1" />
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={handleSaveEditing}>
                    <Check className="h-4 w-4 mr-1" />
                    Guardar
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={handleStartEditing}>
                  <Pencil className="h-4 w-4 mr-1" />
                  Editar
                </Button>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Primera fila - 5 columnas */}
        <div className="grid grid-cols-5 gap-4">
          {fieldsRow1.map(({ key, label, unit, calculated }) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <div className="flex items-center gap-1">
                {isEditing ? (
                  <Input
                    type="number"
                    step="0.01"
                    value={surfaces[key] === 0 ? "" : surfaces[key] as number}
                    onChange={(e) => handleChange(key, e.target.value)}
                    onFocus={(e) => e.target.select()}
                    disabled={calculated}
                    className={calculated ? "bg-muted" : ""}
                    placeholder="0"
                  />
                ) : (
                  <p className="text-sm font-medium py-2">
                    {(surfaces[key] as number) > 0 ? (surfaces[key] as number).toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : "-"}
                  </p>
                )}
                <span className="text-xs text-muted-foreground">{unit}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Segunda fila - 5 columnas (4 campos + Metros Lineales) */}
        <div className="grid grid-cols-5 gap-4">
          {fieldsRow2.map(({ key, label, unit, calculated }) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <div className="flex items-center gap-1">
                {isEditing ? (
                  <Input
                    type="number"
                    step="0.01"
                    value={surfaces[key] === 0 ? "" : surfaces[key] as number}
                    onChange={(e) => handleChange(key, e.target.value)}
                    onFocus={(e) => e.target.select()}
                    disabled={calculated}
                    className={calculated ? "bg-muted" : ""}
                    placeholder="0"
                  />
                ) : (
                  <p className="text-sm font-medium py-2">
                    {(surfaces[key] as number) > 0 ? (surfaces[key] as number).toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : "-"}
                  </p>
                )}
                <span className="text-xs text-muted-foreground">{unit}</span>
              </div>
            </div>
          ))}

          {/* Metros Lineales Frente/Esquina - 5ta columna */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">
                {surfaces.es_esquina ? "Metros Lineales Esquina" : "Metros Lineales Frente"}
              </Label>
              {isEditing && (
                <Checkbox
                  checked={surfaces.es_esquina}
                  onCheckedChange={(checked) => setSurfaces({ ...surfaces, es_esquina: checked === true })}
                  className="h-3.5 w-3.5"
                />
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                {isEditing ? (
                  <Input
                    type="number"
                    step="0.01"
                    value={surfaces.metros_lineales_frente === 0 ? "" : surfaces.metros_lineales_frente}
                    onChange={(e) => handleChange("metros_lineales_frente", e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder="0"
                    className="w-20"
                  />
                ) : (
                  <p className="text-sm font-medium py-2">
                    {surfaces.metros_lineales_frente > 0 ? surfaces.metros_lineales_frente.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : "-"}
                  </p>
                )}
                <span className="text-xs text-muted-foreground">mL</span>
              </div>
              {surfaces.es_esquina && (
                <div className="flex items-center gap-1">
                  {isEditing ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={surfaces.metros_lineales_frente_2 === 0 ? "" : surfaces.metros_lineales_frente_2}
                      onChange={(e) => handleChange("metros_lineales_frente_2", e.target.value)}
                      onFocus={(e) => e.target.select()}
                      placeholder="0"
                      className="w-20"
                    />
                  ) : (
                    <p className="text-sm font-medium py-2">
                      {surfaces.metros_lineales_frente_2 > 0 ? surfaces.metros_lineales_frente_2.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : "-"}
                    </p>
                  )}
                  <span className="text-xs text-muted-foreground">mL</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

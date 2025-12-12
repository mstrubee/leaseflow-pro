import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Ruler } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface SurfaceData {
  superficie_terreno: number;
  superficie_edificada_local: number;
  superficie_showroom: number;
  superficie_bodega_backoffice: number;
  superficie_exterior_cubierto: number;
  superficie_exterior_descubierto: number;
  num_estacionamientos: number;
  metros_lineales_frente: number;
  superficie_mezanina_altillo: number;
  superficie_segundo_nivel: number;
}

interface ContractSurfacesSectionProps {
  contractId: string;
  readOnly?: boolean;
}

export const ContractSurfacesSection = ({ contractId, readOnly = false }: ContractSurfacesSectionProps) => {
  const [surfaces, setSurfaces] = useState<SurfaceData>({
    superficie_terreno: 0,
    superficie_edificada_local: 0,
    superficie_showroom: 0,
    superficie_bodega_backoffice: 0,
    superficie_exterior_cubierto: 0,
    superficie_exterior_descubierto: 0,
    num_estacionamientos: 0,
    metros_lineales_frente: 0,
    superficie_mezanina_altillo: 0,
    superficie_segundo_nivel: 0,
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadSurfaces();
  }, [contractId]);

  const loadSurfaces = async () => {
    try {
      const { data, error } = await supabase
        .from("contracts")
        .select("superficie_terreno, superficie_edificada_local, superficie_showroom, superficie_bodega_backoffice, superficie_exterior_cubierto, superficie_exterior_descubierto, num_estacionamientos, metros_lineales_frente, superficie_mezanina_altillo, superficie_segundo_nivel")
        .eq("id", contractId)
        .single();

      if (error) throw error;
      if (data) {
        setSurfaces({
          superficie_terreno: data.superficie_terreno || 0,
          superficie_edificada_local: data.superficie_edificada_local || 0,
          superficie_showroom: data.superficie_showroom || 0,
          superficie_bodega_backoffice: data.superficie_bodega_backoffice || 0,
          superficie_exterior_cubierto: data.superficie_exterior_cubierto || 0,
          superficie_exterior_descubierto: data.superficie_exterior_descubierto || 0,
          num_estacionamientos: data.num_estacionamientos || 0,
          metros_lineales_frente: data.metros_lineales_frente || 0,
          superficie_mezanina_altillo: (data as any).superficie_mezanina_altillo || 0,
          superficie_segundo_nivel: (data as any).superficie_segundo_nivel || 0,
        });
      }
    } catch (error) {
      console.error("Error loading surfaces:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = async (field: keyof SurfaceData, value: string) => {
    if (readOnly) return;
    
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
    
    try {
      await supabase.from("contracts").update(newData).eq("id", contractId);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const fields: { key: keyof SurfaceData; label: string; unit: string; calculated?: boolean }[] = [
    { key: "superficie_terreno", label: "Terreno", unit: "m²" },
    { key: "superficie_showroom", label: "Showroom", unit: "m²" },
    { key: "superficie_bodega_backoffice", label: "Bodega & Backoffice", unit: "m²" },
    { key: "superficie_edificada_local", label: "Edificada Local", unit: "m²", calculated: true },
    { key: "superficie_mezanina_altillo", label: "Mezanina / Altillo", unit: "m²" },
    { key: "superficie_segundo_nivel", label: "Segundo Nivel", unit: "m²" },
    { key: "superficie_exterior_cubierto", label: "Exterior Cubierto", unit: "m²" },
    { key: "superficie_exterior_descubierto", label: "Exterior Descubierto", unit: "m²", calculated: true },
    { key: "num_estacionamientos", label: "Estacionamientos", unit: "unid." },
    { key: "metros_lineales_frente", label: "Metros Lineales Frente", unit: "mL" },
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
        <CardTitle className="flex items-center gap-2 text-lg">
          <Ruler className="h-5 w-5" />
          Superficies y Datos
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {fields.map(({ key, label, unit, calculated }) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  step="0.01"
                  value={surfaces[key] === 0 ? "" : surfaces[key]}
                  onChange={(e) => handleChange(key, e.target.value)}
                  onFocus={(e) => e.target.select()}
                  disabled={readOnly || calculated}
                  className={calculated ? "bg-muted" : ""}
                  placeholder="0"
                />
                <span className="text-xs text-muted-foreground w-8">{unit}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
